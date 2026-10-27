-- Preserve native provider JSON; display its supported fields and retain the
-- verified email used for a future enrichment lookup outside that provider JSON.
-- No existing contact/cache row or timestamp is rewritten by this migration.
begin;
alter table public.contacts add column lookup_email text
 check (lookup_email is null or public._gmail_enrichment_email(lookup_email));
comment on column public.contacts.lookup_email is 'Verified original email used for enrichment, separate from unchanged native provider JSON. Null on existing rows until explicitly authorized recovery; manual top-level email overrides its display.';

create function public.contact_fields(p_raw jsonb, p_lookup_email text default null) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='{}'::jsonb; person jsonb; field_name text; field_limit integer; value text;
begin
 person:=case when (not(p_raw?'found') or p_raw->'found'='true'::jsonb) and jsonb_typeof(p_raw->'person')='object' then p_raw->'person' else '{}'::jsonb end;
 for field_name,field_limit in select * from (values ('first_name',200),('last_name',200),('email',320),('phone_number',100),('workplace',500),('notes',4000)) fields(name,maximum) loop
  -- An explicit manual key suppresses native/fallback data even when cleared.
  value:=case when p_raw?field_name then case when jsonb_typeof(p_raw->field_name)='string' then p_raw->>field_name else '' end
   when jsonb_typeof(person->field_name)='string' then person->>field_name
   when field_name='email' then coalesce(p_lookup_email,'') else '' end;
  -- Match JavaScript string.length, including two units per supplementary char.
  if length(value)+length(regexp_replace(value,U&'[\0001-\FFFF]','','g'))>field_limit then value:=''; end if;
  result:=jsonb_set(result,array[field_name],to_jsonb(value));
 end loop;
 return result;
end $$;
revoke all on function public.contact_fields(jsonb,text) from public,anon,authenticated;
grant execute on function public.contact_fields(jsonb,text) to service_role;
comment on function public.contact_fields(jsonb,text) is 'Six bounded saved-contact strings only. Explicit top-level fields win, otherwise observed found/person native fields, then original lookup email. No guessing, mutation or full provider payload exposure.';

create function public.contacts_match_email(p_email text) returns setof public.contacts
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_email is null or length(p_email)>320 or p_email='' then raise check_violation using message='Invalid contact email match'; end if;
 return query select c.* from public.contacts c
 where lower(public.contact_fields(c.raw_input,c.lookup_email)->>'email')=lower(p_email)
 order by c.created_at,c.id limit 2;
end $$;
revoke all on function public.contacts_match_email(text) from public,anon,authenticated;
grant execute on function public.contacts_match_email(text) to service_role;

create or replace function public.contacts_search(
 p_query text default '', p_limit integer default 5, p_offset integer default 0,
 p_name text default '', p_workplace text default '',
 p_email_presence text default 'any', p_phone_presence text default 'any',
 p_sort text default 'auto'
) returns setof public.contacts
language plpgsql stable security invoker set search_path='' as $$
declare
 q text; name_filter text; workplace_filter text; ordering text; allow_fuzzy boolean;
begin
 if p_query is null or length(p_query)>256 or p_name is null or length(p_name)>200
  or p_workplace is null or length(p_workplace)>500
  or p_limit is null or p_limit not between 1 and 10
  or p_offset is null or p_offset not between 0 and 10000
  or p_email_presence is null or p_email_presence not in ('any','yes','no')
  or p_phone_presence is null or p_phone_presence not in ('any','yes','no')
  or p_sort is null or p_sort not in ('auto','relevance','name_asc','name_desc','newest','oldest') then
  raise check_violation using message='Invalid contact search';
 end if;
 q:=lower(btrim(regexp_replace(p_query,'[[:space:]]+',' ','g')));
 name_filter:=lower(btrim(regexp_replace(p_name,'[[:space:]]+',' ','g')));
 workplace_filter:=lower(btrim(regexp_replace(p_workplace,'[[:space:]]+',' ','g')));
 ordering:=case when p_sort='auto' then case when q='' then 'newest' else 'relevance' end else p_sort end;
 -- Short text and punctuation still have exact/literal matching. Approximate
 -- names/workplaces require at least four plain word characters, never a LIKE
 -- wildcard, SQL fragment, email-address heuristic or mutable session setting.
 allow_fuzzy:=length(q) between 4 and 64 and q ~ '^[[:alpha:]]+([[:space:]][[:alpha:]]+)*$';
 return query
 with projected as materialized (
  select c.*,public.contact_fields(c.raw_input,c.lookup_email) fields from public.contacts c
 ), strings as materialized (
  select c.id,c.created_at,c.updated_at,c.raw_input,c.lookup_email,
   lower(btrim(regexp_replace(c.fields->>'first_name','[[:space:]]+',' ','g'))) first_name,
   lower(btrim(regexp_replace(c.fields->>'last_name','[[:space:]]+',' ','g'))) last_name,
   lower(btrim(regexp_replace(c.fields->>'email','[[:space:]]+',' ','g'))) email,
   lower(btrim(regexp_replace(c.fields->>'phone_number','[[:space:]]+',' ','g'))) phone,
   lower(btrim(regexp_replace(c.fields->>'workplace','[[:space:]]+',' ','g'))) workplace,
   lower(btrim(regexp_replace(c.fields->>'notes','[[:space:]]+',' ','g'))) notes
  from projected c
 ), named as (
  select s.*,concat_ws(' ',nullif(s.first_name,''),nullif(s.last_name,'')) full_name from strings s
 ), filtered as materialized (
  select n.* from named n
  where (name_filter='' or strpos(n.full_name,name_filter)>0)
   and (workplace_filter='' or strpos(n.workplace,workplace_filter)>0)
   and (p_email_presence='any' or (n.email<>'')=(p_email_presence='yes'))
   and (p_phone_presence='any' or (n.phone<>'')=(p_phone_presence='yes'))
 ), scored as (
  select f.*,literal.exact_match,literal.literal_match,coalesce(approx.score,0) fuzzy_score
  from filtered f
  cross join lateral (
   select bool_or(value=q) exact_match,bool_or(strpos(value,q)>0) literal_match
   from unnest(array[f.first_name,f.last_name,f.full_name,f.email,f.phone,f.workplace,f.notes]) as fields(value)
  ) literal
  cross join lateral (
   select max(greatest(
    -- A high explicit word threshold finds close names/workplace words without
    -- the pg_trgm % operator's session-dependent threshold.
    case when allow_fuzzy then case when extensions.word_similarity(q,candidate)>=0.67
      then extensions.word_similarity(q,candidate) else 0 end else 0 end,
    -- Adjacent transpositions cost two in Levenshtein distance (Jhon/John,
    -- Avrey/Avery). Keep that allowance narrow: near-equal length, same initial,
    -- and an unchanged first token or remaining name for a multiword query.
    case when allow_fuzzy and length(candidate) between 4 and 64
      and abs(length(candidate)-length(q))<=1 and left(candidate,1)=left(q,1)
      and candidate ~ '^[[:alnum:]]+([[:space:]][[:alnum:]]+)*$'
      and (strpos(q,' ')=0 or split_part(candidate,' ',1)=split_part(q,' ',1)
        or strpos(candidate,' ')>0 and substring(candidate from strpos(candidate,' ')+1)=substring(q from strpos(q,' ')+1))
      and extensions.levenshtein_less_equal(left(q,255),left(candidate,255),2)<=2
     then 1.0-extensions.levenshtein_less_equal(left(q,255),left(candidate,255),2)::numeric/greatest(length(q),length(candidate))
     else 0 end
   )) score
   from (
    select value candidate from unnest(array[left(f.first_name,200),left(f.last_name,200),left(f.full_name,401),left(replace(f.full_name,' ',''),400),left(f.workplace,500),left(replace(f.workplace,' ',''),500)]) as fields(value)
    union all
    select regexp_split_to_table(left(f.first_name,200)||' '||left(f.last_name,200)||' '||left(f.workplace,500),' ') candidate
   ) candidates where candidate<>''
  ) approx
 ), matches as (
  select s.*,case when s.exact_match then 0 when s.literal_match then 1 else 2 end match_tier
  from scored s where q='' or s.exact_match or s.literal_match or s.fuzzy_score>0
 )
 select m.id,m.created_at,m.updated_at,m.raw_input,m.lookup_email from matches m
 order by
  case when ordering='relevance' and q<>'' then m.match_tier end asc,
  case when ordering='relevance' and q<>'' and m.match_tier=2 then m.fuzzy_score end desc,
  case when ordering='name_asc' then nullif(m.full_name,'') end asc nulls last,
  case when ordering='name_desc' then nullif(m.full_name,'') end desc nulls last,
  case when ordering='oldest' then m.created_at end asc,
  case when ordering in ('newest','relevance') then m.created_at end desc,
  m.id asc
 limit p_limit+1 offset p_offset;
end $$;
revoke all on function public.contacts_search(text,integer,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.contacts_search(text,integer,integer,text,text,text,text,text) to service_role;
comment on function public.contacts_search(text,integer,integer,text,text,text,text,text) is 'Service-only stable saved-contact search. ANDed literal filters and conservative approximate name/workplace candidates; exact/literal hits precede fuzzy hits for relevance ordering. Full rows remain unchanged; caller receives limit+1 for bounded pagination.';

create or replace function public.gmail_enrichment_complete(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare locked jsonb; s public.contacts_enrichment_state%rowtype; j public.contacts_enrichment_jobs%rowtype;
 r public.contacts_cache%rowtype; contact_row public.contacts%rowtype; usage_data jsonb:=p_payload->'usage';
 outcome_value text:=p_payload->>'outcome'; reason_value text; raw_value jsonb:=p_payload->'rawInput';
 expected_id uuid; saved_contact_id uuid; operation text; old_day bigint; old_cycle bigint; cost_value bigint; charge bigint; cycle_charge bigint;
begin
 if jsonb_typeof(p_payload->'outcome') is distinct from 'string' or outcome_value not in ('hit','miss','unsupported_raw')
  or jsonb_typeof(usage_data) is distinct from 'object' or jsonb_typeof(usage_data->'provider') is distinct from 'string'
  or usage_data->>'provider' !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' or not(usage_data?'callId') or not(usage_data?'costMicro')
  or not(usage_data->'callId'='null'::jsonb or (jsonb_typeof(usage_data->'callId')='string' and usage_data->>'callId' ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'))
  or not(usage_data->'costMicro'='null'::jsonb or (jsonb_typeof(usage_data->'costMicro')='number'
    and usage_data->>'costMicro' ~ '^(0|[1-9][0-9]{0,15})$' and (usage_data->>'costMicro')::numeric<=9007199254740991))
  or octet_length(p_payload::text)>1100000 then return '{"status":"invalid_request"}'; end if;
 if outcome_value='hit' then
  if jsonb_typeof(raw_value) is distinct from 'object' or public._gmail_enrichment_json_bytes(raw_value)>254976 or p_payload?'reason' then return '{"status":"invalid_request"}'; end if;
 elsif p_payload?'rawInput' then return '{"status":"invalid_request"}'; end if;
 if outcome_value='unsupported_raw' then
  if jsonb_typeof(p_payload->'reason') is distinct from 'string' or p_payload->>'reason' not in ('unsupported_raw','raw_too_large') then return '{"status":"invalid_request"}'; end if;
  reason_value:=p_payload->>'reason';
 elsif p_payload?'reason' then return '{"status":"invalid_request"}'; end if;
 locked:=public._gmail_enrichment_lock(p_payload->'claim',true);
 if locked->>'status'<>'ready' then return locked; end if;
 select * into j from public.contacts_enrichment_jobs where id=(p_payload->'claim'->>'jobId')::uuid;
 if (locked->>'completed')::boolean then
  if j.outcome is distinct from outcome_value or j.reason is distinct from reason_value then return '{"status":"conflict"}'; end if;
  if j.outcome='hit' then
   if not exists(select 1 from public.contacts where id=j.contact_id) then return '{"status":"conflict"}'; end if;
   update public.contacts_enrichment_jobs set contact_operation='existing' where id=j.id;
  end if;
  return jsonb_build_object('status','ready','receipt',public._gmail_enrichment_receipt(j.id));
 end if;
 select * into s from public.contacts_enrichment_state where singleton;
 select * into r from public.contacts_cache where id=j.cache_id;
 if outcome_value='hit' then
  expected_id:=public._gmail_enrichment_contact_id(r.raw_input->>'email');
  select * into contact_row from public.contacts where lower(public.contact_fields(raw_input,lookup_email)->>'email')=r.raw_input->>'email' order by created_at,id limit 1 for share;
  if found then operation:='existing';
  else
   insert into public.contacts(id,raw_input,lookup_email) values(expected_id,raw_value,r.raw_input->>'email') on conflict(id) do nothing returning * into contact_row;
   if found then operation:='imported'; else
    select * into contact_row from public.contacts where id=expected_id for share;
    if not found then return '{"status":"conflict"}'; end if;
    operation:='existing';
   end if;
  end if;
  saved_contact_id:=contact_row.id;
 end if;
 old_day:=coalesce((s.day_requests->>j.request_id::text)::bigint,0);
 old_cycle:=coalesce((s.cycles->j.reservation_cycle::text->>j.request_id::text)::bigint,0);
 cost_value:=case when usage_data->'costMicro'='null'::jsonb then null else (usage_data->>'costMicro')::bigint end;
 if cost_value is null then charge:=old_day; cycle_charge:=old_cycle;
 elsif j.reservation_reused then charge:=greatest(old_day,cost_value); cycle_charge:=greatest(old_cycle,cost_value);
 else charge:=cost_value; cycle_charge:=cost_value; end if;
 if s.budget_day=j.reservation_day then
  update public.contacts_enrichment_state set day_spent_micro=day_spent_micro-old_day+charge,
   day_requests=jsonb_set(day_requests,array[j.request_id::text],to_jsonb(charge)),
   cycles=jsonb_set(cycles,array[j.reservation_cycle::text,j.request_id::text],to_jsonb(cycle_charge)) where singleton;
 end if;
 update public.contacts_enrichment_jobs set status='completed',outcome=outcome_value,reason=reason_value,
  contact_id=saved_contact_id,contact_operation=operation,usage_provider=usage_data->>'provider',usage_call_id=usage_data->>'callId',
  usage_cost_micro=cost_value,cost_overrun=coalesce(cost_value>reserved_micro,false),completed_at=clock_timestamp() where id=j.id;
 update public.contacts_enrichment_state set lease_job_id=null,lease_cache_id=null,lease_token=null,lease_expires_at=null where singleton;
 return jsonb_build_object('status','ready','receipt',public._gmail_enrichment_receipt(j.id));
end $$;

revoke all on function public.gmail_enrichment_complete(jsonb) from public,anon,authenticated;
grant execute on function public.gmail_enrichment_complete(jsonb) to service_role;
commit;
