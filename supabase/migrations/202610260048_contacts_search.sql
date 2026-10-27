-- Saved-contact search only: filter and rank the complete table before paging.
-- No contact row, timestamp, raw provider field or existing grant is rewritten.
begin;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;
do $$
begin
 if exists(select 1 from pg_catalog.pg_extension e
   where e.extname in ('pg_trgm','fuzzystrmatch') and e.extnamespace <> 'extensions'::regnamespace) then
  raise check_violation using message='Contact search extensions must use the extensions schema';
 end if;
end $$;
grant usage on schema extensions to service_role;

create function public.contacts_search(
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
 with strings as materialized (
  select c.id,c.created_at,c.updated_at,c.raw_input,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'first_name')='string' then c.raw_input->>'first_name' else '' end,'[[:space:]]+',' ','g'))) first_name,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'last_name')='string' then c.raw_input->>'last_name' else '' end,'[[:space:]]+',' ','g'))) last_name,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'email')='string' then c.raw_input->>'email' else '' end,'[[:space:]]+',' ','g'))) email,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'phone_number')='string' then c.raw_input->>'phone_number' else '' end,'[[:space:]]+',' ','g'))) phone,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'workplace')='string' then c.raw_input->>'workplace' else '' end,'[[:space:]]+',' ','g'))) workplace,
   lower(btrim(regexp_replace(case when jsonb_typeof(c.raw_input->'notes')='string' then c.raw_input->>'notes' else '' end,'[[:space:]]+',' ','g'))) notes
  from public.contacts c
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
 select m.id,m.created_at,m.updated_at,m.raw_input from matches m
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
commit;
