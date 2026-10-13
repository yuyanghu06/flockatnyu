-- LOCAL ONLY. Apply after 202610120001_knowledge.sql, with explicit authorization.
-- One original Discord message per row; identifiers are text, never JS numbers.
grant usage on schema extensions to service_role;
create table public.discord_admin_members (
  member_id text primary key check(member_id='local-development' or member_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  created_at timestamptz not null default now()
);
create table public.discord_channels (
  source_id uuid primary key references public.knowledge_sources(id) on delete cascade,
  channel_id text not null unique check(channel_id ~ '^[0-9]{1,20}$'),
  guild_id text not null check(guild_id ~ '^[0-9]{1,20}$'),
  title text not null check(length(title) between 1 and 300),
  enabled boolean not null default false,
  backfill_from timestamptz not null default '2026-01-01T05:00:00Z',
  updated_at timestamptz not null default now()
);
create table public.discord_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique check(message_id ~ '^[0-9]{1,20}$'),
  source_id uuid not null references public.discord_channels(source_id) on delete cascade,
  channel_id text not null check(channel_id ~ '^[0-9]{1,20}$'),
  guild_id text not null check(guild_id ~ '^[0-9]{1,20}$'),
  author_id text not null check(author_id ~ '^[0-9]{1,20}$'),
  created_at timestamptz not null,
  edited_at timestamptz,
  reply_to_message_id text check(reply_to_message_id is null or reply_to_message_id ~ '^[0-9]{1,20}$'),
  content text not null check(length(content)<=10000),
  embedding_text text not null check(length(embedding_text)<=50000),
  payload jsonb not null check(jsonb_typeof(payload)='object' and not payload ?| array['referenced_message','message_snapshots','resolved','thread']),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  url text not null check(url ~ '^https://discord.com/channels/[0-9]+/[0-9]+/[0-9]+$'),
  search_text tsvector generated always as (to_tsvector('english',embedding_text)) stored,
  embedding extensions.vector(1536),
  embedding_model text,
  embedding_provider text,
  embedding_hash text,
  indexed_at timestamptz not null default now(),
  check((embedding is null and embedding_model is null and embedding_provider is null and embedding_hash is null) or
        (embedding is not null and embedding_model is not null and embedding_provider is not null and embedding_hash is not null
         and length(trim(embedding_model))>0 and length(trim(embedding_provider))>0 and embedding_hash=content_hash))
);
create index discord_messages_text on public.discord_messages using gin(search_text);
create index discord_messages_channel_date on public.discord_messages(source_id,created_at desc);
create index discord_messages_author_date on public.discord_messages(author_id,created_at desc);
-- Historical revisions remain available to service-side audit; no model retrieval
-- from superseded revisions, and no browser reads.
create table public.discord_message_revisions (
  id bigint generated always as identity primary key,
  message_id text not null references public.discord_messages(message_id) on delete cascade,
  payload jsonb not null,
  content_hash text not null,
  archived_at timestamptz not null default now()
);
create table public.discord_sync_state (
  source_id uuid primary key references public.discord_channels(source_id) on delete cascade,
  last_success_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  before_cursor text check(before_cursor is null or before_cursor ~ '^[0-9]{1,20}$'),
  status text not null default 'succeeded' check(status in ('running','succeeded')),
  last_attempt_at timestamptz not null default now(),
  check((status='running' and window_from is not null and window_to is not null and before_cursor is not null and window_from<window_to)
    or (status='succeeded' and window_from is null and window_to is null and before_cursor is null))
);
do $$ declare t text; begin
  foreach t in array array['discord_admin_members','discord_channels','discord_messages','discord_message_revisions','discord_sync_state'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on sequence public.discord_message_revisions_id_seq from public,anon,authenticated;
grant usage,select on sequence public.discord_message_revisions_id_seq to service_role;

create function public.discord_list_channels(p_member_id text)
returns setof public.discord_channels language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id)
 then raise insufficient_privilege using message='Admin access denied'; end if;
 return query select * from public.discord_channels order by title,channel_id;
end $$;

create function public.discord_configure_channel(p_member_id text,p_channel jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sid uuid; existing public.discord_channels; result public.discord_channels; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id)
 then raise insufficient_privilege using message='Admin access denied'; end if;
 if p_channel->>'channel_id' !~ '^[0-9]{1,20}$' or p_channel->>'guild_id' !~ '^[0-9]{1,20}$'
 or length(trim(p_channel->>'title')) not between 1 and 300 or jsonb_typeof(p_channel->'enabled') is distinct from 'boolean'
 or (p_channel->>'backfill_from')::timestamptz > now()
 then raise check_violation using message='Invalid channel'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_channel->>'channel_id'));
 select * into existing from public.discord_channels where channel_id=p_channel->>'channel_id';
 sid:=coalesce((p_channel->>'source_id')::uuid,existing.source_id);
 if existing.source_id is not null and ((sid is distinct from existing.source_id) or existing.guild_id is distinct from p_channel->>'guild_id')
 then raise check_violation using message='Channel identity cannot change'; end if;
 if sid is null then
   insert into public.knowledge_sources(kind,external_id,title,original_url,status)
   values('discord',p_channel->>'channel_id',p_channel->>'title','https://discord.com/channels/'||(p_channel->>'guild_id')||'/'||(p_channel->>'channel_id'),case when (p_channel->>'enabled')::boolean then 'active' else 'disabled' end)
   on conflict(kind,external_id) do update set title=excluded.title returning id into sid;
 end if;
 if not exists(select 1 from public.knowledge_sources where id=sid and kind='discord' and external_id=p_channel->>'channel_id')
 then raise check_violation using message='Source identity mismatch'; end if;
 insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,backfill_from)
 values(sid,p_channel->>'channel_id',p_channel->>'guild_id',p_channel->>'title',(p_channel->>'enabled')::boolean,(p_channel->>'backfill_from')::timestamptz)
 on conflict(source_id) do update set title=excluded.title,enabled=excluded.enabled,backfill_from=excluded.backfill_from,updated_at=now()
 returning * into result;
 update public.knowledge_sources set title=result.title,status=case when result.enabled then 'active' else 'disabled' end,updated_at=now() where id=sid;
 -- An earlier backfill request requires scanning again; original rows stay intact.
 if existing.source_id is not null and result.backfill_from < existing.backfill_from then delete from public.discord_sync_state where source_id=sid; end if;
 -- Configuration deliberately grants no members. Separate explicit source ACLs
 -- must be provisioned by trusted operators before any member can retrieve.
 return to_jsonb(result);
end $$;

create function public.discord_sync_channels()
returns setof public.discord_channels language sql stable security invoker set search_path='' as $$
 select c.* from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id
 where c.enabled and s.status='active' order by c.channel_id;
$$;
create function public.discord_get_sync_state(p_source_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(st) from public.discord_sync_state st where st.source_id=p_source_id;
$$;

create function public.discord_persist_page(p_source_id uuid,p_messages jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.discord_channels; old public.discord_sync_state; m jsonb; previous public.discord_messages; begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_id::text));
 select * into c from public.discord_channels where source_id=p_source_id and enabled;
 if c.source_id is null or not exists(select 1 from public.knowledge_sources where id=p_source_id and status='active')
 then raise insufficient_privilege using message='Channel disabled'; end if;
 select * into old from public.discord_sync_state where source_id=p_source_id for update;
 if old.before_cursor is distinct from p_state->>'expected_before' or old.window_to is distinct from (p_state->>'expected_window_to')::timestamptz
 or old.last_success_at is distinct from (p_state->>'expected_last_success_at')::timestamptz then return false; end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>100
 or p_state->>'status' not in ('running','succeeded') then raise check_violation using message='Invalid page'; end if;
 for m in select jsonb_array_elements(p_messages) loop
   if m->>'channel_id' is distinct from c.channel_id or m->>'guild_id' is distinct from c.guild_id
   or jsonb_typeof(m->'message_id') is distinct from 'string' or jsonb_typeof(m->'author_id') is distinct from 'string'
   or jsonb_typeof(m->'payload') is distinct from 'object' or m->'payload' ?| array['referenced_message','message_snapshots','resolved','thread']
   or m->'payload'->>'id' is distinct from m->>'message_id' or m->'payload'->>'channel_id' is distinct from c.channel_id
   or m->'payload'->'author'->>'id' is distinct from m->>'author_id'
   or m->'payload'->>'guild_id' is distinct from c.guild_id
   or m->>'url' is distinct from 'https://discord.com/channels/'||c.guild_id||'/'||c.channel_id||'/'||(m->>'message_id')
   then raise check_violation using message='Invalid message scope'; end if;
   select * into previous from public.discord_messages where message_id=m->>'message_id';
   if previous.source_id is not null and previous.source_id<>p_source_id then raise check_violation using message='Message identity mismatch'; end if;
   if previous.id is not null and (previous.author_id is distinct from m->>'author_id' or previous.created_at is distinct from (m->>'created_at')::timestamptz)
   then raise check_violation using message='Message identity mismatch'; end if;
   if previous.id is not null and previous.payload is distinct from m->'payload' then
     insert into public.discord_message_revisions(message_id,payload,content_hash) values(previous.message_id,previous.payload,previous.content_hash);
   end if;
   insert into public.discord_messages(message_id,source_id,channel_id,guild_id,author_id,created_at,edited_at,reply_to_message_id,content,embedding_text,payload,content_hash,url)
   values(m->>'message_id',p_source_id,c.channel_id,c.guild_id,m->>'author_id',(m->>'created_at')::timestamptz,(m->>'edited_at')::timestamptz,m->>'reply_to_message_id',m->>'content',m->>'embedding_text',m->'payload',m->>'content_hash',m->>'url')
   on conflict(message_id) do update set edited_at=excluded.edited_at,reply_to_message_id=excluded.reply_to_message_id,content=excluded.content,embedding_text=excluded.embedding_text,payload=excluded.payload,content_hash=excluded.content_hash,indexed_at=now(),
     embedding=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding else null end,
     embedding_model=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_model else null end,
     embedding_provider=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_provider else null end,
     embedding_hash=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_hash else null end;
 end loop;
 insert into public.discord_sync_state(source_id,last_success_at,window_from,window_to,before_cursor,status)
 values(p_source_id,(p_state->>'last_success_at')::timestamptz,(p_state->>'window_from')::timestamptz,(p_state->>'window_to')::timestamptz,p_state->>'before_cursor',p_state->>'status')
 on conflict(source_id) do update set last_success_at=excluded.last_success_at,window_from=excluded.window_from,window_to=excluded.window_to,before_cursor=excluded.before_cursor,status=excluded.status,last_attempt_at=now();
 return true;
end $$;

create function public.discord_embedding_work(p_limit integer,p_model text,p_provider text)
returns table(message_id text,content_hash text,content text,embedding_text text)
language sql stable security invoker set search_path='' as $$
 select m.message_id,m.content_hash,m.content,m.embedding_text from public.discord_messages m
 join public.discord_channels c on c.source_id=m.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 where length(trim(m.embedding_text)) between 1 and 12000
 and (m.embedding is null or m.embedding_model is distinct from p_model or m.embedding_provider is distinct from p_provider)
 order by m.created_at,m.message_id limit greatest(1,least(coalesce(p_limit,16),64));
$$;
create function public.discord_save_embedding(p_message_id text,p_content_hash text,p_model text,p_provider text,p_vector extensions.vector(1536))
returns boolean language plpgsql security invoker set search_path='' as $$
declare count integer; begin
 if p_model is null or p_provider is null or length(trim(p_model)) not between 1 and 200 or length(trim(p_provider)) not between 1 and 100 or p_vector is null then raise check_violation using message='Invalid embedding'; end if;
 update public.discord_messages m set embedding=p_vector,embedding_model=p_model,embedding_provider=p_provider,embedding_hash=p_content_hash
 from public.discord_channels c,public.knowledge_sources s
 where m.message_id=p_message_id and m.content_hash=p_content_hash and c.source_id=m.source_id and c.enabled and s.id=c.source_id and s.status='active';
 get diagnostics count=row_count; return count=1;
end $$;

create function public.discord_search(p_member_id text,p_allowed_source_ids uuid[],p_query text,p_channel_ids text[],p_author_id text,p_author_name text,p_from timestamptz,p_to timestamptz,p_mode text,p_vector extensions.vector(1536),p_model text,p_provider text,p_limit integer)
returns table(id uuid,source_id uuid,message_id text,channel_id text,guild_id text,author_id text,title text,excerpt text,created_at timestamptz,edited_at timestamptz,indexed_at timestamptz,reply_to_message_id text)
language sql stable security invoker set search_path='' as $$
 select m.id,m.source_id,m.message_id,m.channel_id,m.guild_id,m.author_id,c.title,left(m.embedding_text,1800),m.created_at,m.edited_at,m.indexed_at,m.reply_to_message_id
 from public.discord_messages m
 join public.discord_channels c on c.source_id=m.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
 where cardinality(p_allowed_source_ids) between 1 and 100 and s.id=any(p_allowed_source_ids)
 and coalesce(cardinality(p_channel_ids),0)<=100 and (coalesce(cardinality(p_channel_ids),0)=0 or m.channel_id=any(p_channel_ids))
 and length(p_member_id) between 1 and 128 and length(coalesce(p_query,''))<=500 and p_mode in ('text','latest','semantic')
 and (p_author_id is null or m.author_id=p_author_id)
 and (p_author_name is null or lower(m.payload->'author'->>'username')=lower(p_author_name) or lower(m.payload->'author'->>'global_name')=lower(p_author_name))
 and (p_from is null or m.created_at>=p_from) and (p_to is null or m.created_at<p_to)
 and (p_mode<>'semantic' or (p_vector is not null and m.embedding is not null and m.embedding_hash=m.content_hash and m.embedding_model=p_model and m.embedding_provider=p_provider))
 and (p_mode='semantic' or length(trim(coalesce(p_query,'')))=0 or m.search_text @@ websearch_to_tsquery('english',p_query))
 order by case when p_mode='semantic' then m.embedding operator(extensions.<=>) p_vector end asc nulls last,
 case when p_mode='text' and length(trim(coalesce(p_query,'')))>0 then ts_rank(m.search_text,websearch_to_tsquery('english',p_query)) end desc nulls last,
 m.created_at desc,m.message_id desc
 limit greatest(1,least(coalesce(p_limit,5),8));
$$;

revoke all on function public.discord_list_channels(text) from public,anon,authenticated;
revoke all on function public.discord_configure_channel(text,jsonb) from public,anon,authenticated;
revoke all on function public.discord_sync_channels() from public,anon,authenticated;
revoke all on function public.discord_get_sync_state(uuid) from public,anon,authenticated;
revoke all on function public.discord_persist_page(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.discord_embedding_work(integer,text,text) from public,anon,authenticated;
revoke all on function public.discord_save_embedding(text,text,text,text,extensions.vector) from public,anon,authenticated;
revoke all on function public.discord_search(text,uuid[],text,text[],text,text,timestamptz,timestamptz,text,extensions.vector,text,text,integer) from public,anon,authenticated;
grant execute on function public.discord_list_channels(text) to service_role;
grant execute on function public.discord_configure_channel(text,jsonb) to service_role;
grant execute on function public.discord_sync_channels() to service_role;
grant execute on function public.discord_get_sync_state(uuid) to service_role;
grant execute on function public.discord_persist_page(uuid,jsonb,jsonb) to service_role;
grant execute on function public.discord_embedding_work(integer,text,text) to service_role;
grant execute on function public.discord_save_embedding(text,text,text,text,extensions.vector) to service_role;
grant execute on function public.discord_search(text,uuid[],text,text[],text,text,timestamptz,timestamptz,text,extensions.vector,text,text,integer) to service_role;
notify pgrst,'reload schema';
