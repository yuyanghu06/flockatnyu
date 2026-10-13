-- M18: service-only discovery policy, fail-closed hierarchy and original-memory
-- buckets. Apply after the two prior migrations; no model calls or image blobs.
alter table public.discord_channels add column policy_revision bigint;
create table public.discord_guild_policies (
 guild_id text primary key check(guild_id ~ '^[0-9]{1,20}$'),
 revision bigint not null default 1 check(revision>0),
 paused boolean not null default true,
 discovery_enabled boolean not null default true,
 excluded_category_ids text[] not null default '{}',
 excluded_channel_ids text[] not null default '{}',
 backfill_from timestamptz not null default '2015-01-01T00:00:00Z',
 updated_at timestamptz not null default now()
);
create table public.discord_channel_metadata (
 guild_id text not null references public.discord_guild_policies(guild_id) on delete cascade,
 channel_id text not null check(channel_id ~ '^[0-9]{1,20}$'),
 parent_id text check(parent_id is null or parent_id ~ '^[0-9]{1,20}$'),
 channel_type integer not null check(channel_type in (0,2,4,5,10,11,12,13,15,16)),
 access_status text not null check(access_status in ('metadata','ready','excluded','unknown_ancestry','permission_denied','not_found')),
 eligible boolean not null default false,
 generation uuid not null,
 primary key(guild_id,channel_id)
);
create table public.discord_discovery_state (
 guild_id text primary key references public.discord_guild_policies(guild_id) on delete cascade,
 policy_revision bigint not null,
 generation uuid not null,
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=3000000),
 updated_at timestamptz not null default now()
);
create table public.discord_memory_buckets (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.discord_channels(source_id) on delete cascade,
 tier text not null check(tier in ('daily','weekly','monthly')),
 period_start timestamptz not null,
 period_end timestamptz not null,
 timezone text not null default 'America/New_York' check(timezone='America/New_York'),
 as_of timestamptz not null,
 policy_revision bigint not null,
 message_count bigint not null check(message_count>0),
 check(period_start<period_end),
 unique(source_id,tier,period_start), unique(id,source_id)
);
-- A message has exactly one current tier, and cannot join another source bucket.
create unique index discord_messages_identity_source on public.discord_messages(message_id,source_id);
create table public.discord_memory_members (
 message_id text primary key,
 source_id uuid not null,
 bucket_id uuid not null,
 foreign key(message_id,source_id) references public.discord_messages(message_id,source_id) on delete cascade,
 foreign key(bucket_id,source_id) references public.discord_memory_buckets(id,source_id) on delete cascade
);
create index discord_memory_members_bucket on public.discord_memory_members(bucket_id,message_id);
do $$ declare t text; begin
 foreach t in array array['discord_guild_policies','discord_channel_metadata','discord_discovery_state','discord_memory_buckets','discord_memory_members'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on table public.%I to service_role',t);
 end loop;
end $$;

-- Missing, cyclic, foreign-guild or unknown ancestry cannot qualify a channel.
create function public.discord_channel_allowed(p_guild_id text,p_channel_id text,p_allow_paused boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare policy public.discord_guild_policies; node public.discord_channel_metadata; current_id text:=p_channel_id; visited text[]:='{}'; child_type integer; active_generation uuid; begin
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id;
 if policy.guild_id is null then return true; end if; -- legacy explicit-source guilds
 if (policy.paused and not p_allow_paused) or not policy.discovery_enabled then return false; end if;
 if not p_allow_paused and not exists(select 1 from public.discord_discovery_state d where d.guild_id=p_guild_id and d.policy_revision=policy.revision and d.state->>'phase'='complete') then return false; end if;
 loop
  if current_id=any(visited) or cardinality(visited)>8 or current_id=any(policy.excluded_category_ids) or current_id=any(policy.excluded_channel_ids) then return false; end if;
  visited:=array_append(visited,current_id);
  select * into node from public.discord_channel_metadata where guild_id=p_guild_id and channel_id=current_id;
  if cardinality(visited)=1 then active_generation:=node.generation; end if;
  if node.channel_id is null or node.generation is distinct from active_generation or node.access_status in ('excluded','unknown_ancestry','permission_denied','not_found') then return false; end if;
  if cardinality(visited)>1 and ((child_type in (10,11,12) and node.channel_type not in (0,5,15,16)) or (child_type not in (10,11,12) and node.channel_type<>4)) then return false; end if;
  if cardinality(visited)=1 and (not node.eligible or node.access_status<>'ready') then return false; end if;
  if node.channel_type=4 and node.parent_id is not null then return false; end if;
  if node.channel_type in (10,11,12) and node.parent_id is null then return false; end if;
  if node.parent_id is null then return node.channel_type in (0,2,4,5,13,15,16); end if;
  child_type:=node.channel_type; current_id:=node.parent_id;
 end loop;
end $$;
create function public.discord_get_policy(p_guild_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(p) from public.discord_guild_policies p where guild_id=p_guild_id;
$$;
create function public.discord_configure_policy(p_member_id text,p_guild_id text,p_policy jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.discord_guild_policies; result public.discord_guild_policies; categories text[]; channels text[]; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id) then raise insufficient_privilege using message='Admin access denied'; end if;
 if p_guild_id !~ '^[0-9]{1,20}$' or jsonb_typeof(p_policy) is distinct from 'object'
 or jsonb_typeof(p_policy->'paused') is distinct from 'boolean' or jsonb_typeof(p_policy->'discovery_enabled') is distinct from 'boolean'
 or jsonb_typeof(p_policy->'excluded_category_ids') is distinct from 'array' or jsonb_typeof(p_policy->'excluded_channel_ids') is distinct from 'array'
 or jsonb_array_length(p_policy->'excluded_category_ids')>500 or jsonb_array_length(p_policy->'excluded_channel_ids')>500
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_category_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_channel_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z')>now()
 then raise check_violation using message='Invalid policy'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-policy:'||p_guild_id));
 select * into old from public.discord_guild_policies where guild_id=p_guild_id for update;
 if old.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy'; end if;
 select coalesce(array_agg(distinct v),'{}') into categories from jsonb_array_elements_text(p_policy->'excluded_category_ids') v;
 select coalesce(array_agg(distinct v),'{}') into channels from jsonb_array_elements_text(p_policy->'excluded_channel_ids') v;
 insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,backfill_from)
 values(p_guild_id,coalesce(old.revision,0)+1,(p_policy->>'paused')::boolean,(p_policy->>'discovery_enabled')::boolean,categories,channels,coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z'))
 on conflict(guild_id) do update set revision=excluded.revision,paused=excluded.paused,discovery_enabled=excluded.discovery_enabled,excluded_category_ids=excluded.excluded_category_ids,excluded_channel_ids=excluded.excluded_channel_ids,backfill_from=excluded.backfill_from,updated_at=now() returning * into result;
 update public.discord_channels set policy_revision=result.revision where guild_id=p_guild_id;
 update public.knowledge_sources s set status='disabled',updated_at=now() from public.discord_channels c where c.source_id=s.id and c.guild_id=p_guild_id;
 -- Any policy change invalidates published groups until a fresh transaction.
 delete from public.discord_memory_buckets b using public.discord_channels c where c.source_id=b.source_id and c.guild_id=p_guild_id;
 return to_jsonb(result);
end $$;
create function public.discord_get_discovery_state(p_guild_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select d.state from public.discord_discovery_state d join public.discord_guild_policies p on p.guild_id=d.guild_id and p.revision=d.policy_revision where d.guild_id=p_guild_id;
$$;
create function public.discord_persist_discovery(p_guild_id text,p_expected_policy_revision bigint,p_expected_generation uuid,p_expected_state jsonb,p_channels jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; old public.discord_discovery_state; n jsonb; sid uuid; generation uuid:=(p_state->>'generation')::uuid; begin
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for share;
 if policy.guild_id is null or not policy.discovery_enabled or policy.revision is distinct from p_expected_policy_revision then return false; end if;
 if jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>100 or jsonb_typeof(p_state) is distinct from 'object' or generation is null
 or (p_state->>'policyRevision')::bigint is distinct from policy.revision or octet_length(p_state::text)>3000000 then raise check_violation using message='Invalid discovery'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-discovery:'||p_guild_id));
 select * into old from public.discord_discovery_state where guild_id=p_guild_id and policy_revision=policy.revision for update;
 if old.generation is distinct from p_expected_generation or old.state is distinct from p_expected_state then return false; end if;
 for n in select jsonb_array_elements(p_channels) loop
  if n->>'channelId' !~ '^[0-9]{1,20}$' or n->>'guildId' is distinct from p_guild_id or coalesce(n->>'parentId','0') !~ '^[0-9]{1,20}$'
  or jsonb_typeof(n->'eligible') is distinct from 'boolean' or length(trim(n->>'title')) not between 1 and 300 then raise check_violation using message='Invalid discovery channel'; end if;
  insert into public.discord_channel_metadata(guild_id,channel_id,parent_id,channel_type,access_status,eligible,generation)
  values(p_guild_id,n->>'channelId',n->>'parentId',(n->>'type')::integer,n->>'accessStatus',(n->>'eligible')::boolean,generation)
  on conflict(guild_id,channel_id) do update set parent_id=excluded.parent_id,channel_type=excluded.channel_type,access_status=excluded.access_status,eligible=excluded.eligible,generation=excluded.generation;
  if (n->>'eligible')::boolean and public.discord_channel_allowed(p_guild_id,n->>'channelId',true) then
   insert into public.knowledge_sources(kind,external_id,title,original_url,status)
   values('discord',n->>'channelId',n->>'title','https://discord.com/channels/'||p_guild_id||'/'||(n->>'channelId'),case when policy.paused then 'disabled' else 'active' end)
   on conflict(kind,external_id) do update set title=excluded.title,status=excluded.status,updated_at=now() returning id into sid;
   if exists(select 1 from public.discord_channels where channel_id=n->>'channelId' and guild_id<>p_guild_id) then raise check_violation using message='Channel guild mismatch'; end if;
   insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,backfill_from,policy_revision)
   values(sid,n->>'channelId',p_guild_id,n->>'title',true,policy.backfill_from,policy.revision)
   on conflict(source_id) do update set title=excluded.title,enabled=true,policy_revision=excluded.policy_revision,backfill_from=least(discord_channels.backfill_from,excluded.backfill_from),updated_at=now();
  else
   update public.discord_channels set enabled=false,updated_at=now() where guild_id=p_guild_id and channel_id=n->>'channelId';
   update public.knowledge_sources s set status='disabled',updated_at=now() from public.discord_channels c where c.source_id=s.id and c.guild_id=p_guild_id and c.channel_id=n->>'channelId';
  end if;
 end loop;
 insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values(p_guild_id,policy.revision,generation,p_state)
 on conflict(guild_id) do update set policy_revision=excluded.policy_revision,generation=excluded.generation,state=excluded.state,updated_at=now();
 return true;
end $$;
create function public.discord_complete_discovery(p_guild_id text,p_generation uuid,p_expected_policy_revision bigint,p_expected_state jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; old public.discord_discovery_state; begin
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for share;
 if policy.guild_id is null or policy.revision is distinct from p_expected_policy_revision then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-discovery:'||p_guild_id));
 select * into old from public.discord_discovery_state where guild_id=p_guild_id for update;
 if old.policy_revision is distinct from policy.revision or old.generation is distinct from p_generation or old.state is distinct from p_expected_state then return false; end if;
 if p_state->>'phase' is distinct from 'complete' or (p_state->>'generation')::uuid is distinct from p_generation or (p_state->>'policyRevision')::bigint is distinct from policy.revision then raise check_violation using message='Invalid completion'; end if;
 update public.discord_channels c set enabled=false,updated_at=now() where c.guild_id=p_guild_id and not exists(select 1 from public.discord_channel_metadata n where n.guild_id=c.guild_id and n.channel_id=c.channel_id and n.generation=p_generation and public.discord_channel_allowed(c.guild_id,c.channel_id,true));
 update public.knowledge_sources s set status='disabled',updated_at=now() from public.discord_channels c where c.source_id=s.id and c.guild_id=p_guild_id and not c.enabled;
 update public.discord_discovery_state set state=p_state,updated_at=now() where guild_id=p_guild_id;
 return true;
end $$;

-- Image-only attachment records and image-bearing embed/avatar fields are not
-- retained. Message text and non-image attachment links remain originals.
create function public.discord_strip_components(p_value jsonb,p_depth integer default 0)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; item jsonb; cleaned jsonb; property record; file jsonb; begin
 if p_depth is null or p_depth<0 or p_depth>12 or p_value is null then return null; end if;
 if jsonb_typeof(p_value)='array' then
  result:='[]'::jsonb;
  for item in select jsonb_array_elements(p_value) loop
   cleaned:=public.discord_strip_components(item,p_depth+1);
   if cleaned is not null then result:=result||jsonb_build_array(cleaned); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p_value)='object' then
  -- Discord Components V2 Thumbnail and Media Gallery are image containers.
  if p_value->>'type' in ('11','12') then return null; end if;
  if p_value->>'type'='13' then
   file:=p_value->'file';
   if lower(coalesce(file->>'content_type',file->>'mime_type',p_value->>'content_type',p_value->>'mime_type','')) like 'image/%'
   or lower(coalesce(file->>'url','')) ~ '\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)'
   or lower(coalesce(file->>'filename',p_value->>'filename','')) ~ '\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)'
   then return null; end if;
  end if;
  result:='{}'::jsonb;
  for property in select key,value from jsonb_each(p_value) loop
   if property.key=any(array['media','image','thumbnail','video','icon_url','proxy_icon_url','avatar','avatar_decoration_data','banner']) then continue; end if;
   cleaned:=public.discord_strip_components(property.value,p_depth+1);
   if cleaned is not null then result:=result||jsonb_build_object(property.key,cleaned); end if;
  end loop;
  return result;
 end if;
 return p_value;
end $$;
create function public.discord_strip_message_images(p_message jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare payload jsonb:=p_message->'payload'; attachments jsonb; embeds jsonb; search_text text; begin
 select coalesce(jsonb_agg(a),'[]'::jsonb) into attachments from jsonb_array_elements(case when jsonb_typeof(payload->'attachments')='array' then payload->'attachments' else '[]'::jsonb end) a
 where lower(coalesce(a->>'content_type','')) not like 'image/%'
 and lower(coalesce(a->>'filename','')) !~ '\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)'
 and lower(coalesce(a->>'url','')) !~ '\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)'
 and not (a ? 'width' and a ? 'height' and lower(coalesce(a->>'content_type','')) not like 'video/%');
 select coalesce(jsonb_agg((e-'image'-'thumbnail'-'video') || case when jsonb_typeof(e->'author')='object' then jsonb_build_object('author',(e->'author')-'icon_url'-'proxy_icon_url') else '{}'::jsonb end || case when jsonb_typeof(e->'footer')='object' then jsonb_build_object('footer',(e->'footer')-'icon_url'-'proxy_icon_url') else '{}'::jsonb end || case when jsonb_typeof(e->'provider')='object' then jsonb_build_object('provider',(e->'provider')-'icon_url'-'proxy_icon_url') else '{}'::jsonb end),'[]'::jsonb)
 into embeds from jsonb_array_elements(case when jsonb_typeof(payload->'embeds')='array' then payload->'embeds' else '[]'::jsonb end) e where coalesce(e->>'type','') not in ('image','gifv');
 payload:=payload-'sticker_items';
 if payload ? 'components' then payload:=jsonb_set(payload,'{components}',coalesce(public.discord_strip_components(payload->'components'),'[]'::jsonb)); end if;
 if payload ? 'attachments' then payload:=jsonb_set(payload,'{attachments}',attachments); end if;
 if payload ? 'embeds' then payload:=jsonb_set(payload,'{embeds}',embeds); end if;
 if jsonb_typeof(payload->'author')='object' then payload:=jsonb_set(payload,'{author}',(payload->'author')-'avatar'-'avatar_decoration_data'-'banner'); end if;
 if jsonb_typeof(payload->'mentions')='array' then payload:=jsonb_set(payload,'{mentions}',coalesce((select jsonb_agg(case when jsonb_typeof(v)='object' then v-'avatar'-'avatar_decoration_data'-'banner' else v end) from jsonb_array_elements(payload->'mentions') v),'[]'::jsonb)); end if;
 if jsonb_typeof(payload->'member')='object' then payload:=jsonb_set(payload,'{member}',(payload->'member')-'avatar'-'banner'); end if;
 select coalesce(string_agg(t,E'\n' order by section,ordinal,field_order),'') into search_text from (
  select p_message->>'content' t,0 section,0::bigint ordinal,0 field_order where jsonb_typeof(p_message->'content')='string'
  union all select f.value#>>'{}',1,e.ordinality,f.field_order from jsonb_array_elements(embeds) with ordinality e(value,ordinality)
  cross join lateral (values(e.value->'title',0),(e.value->'description',1),(e.value->'url',2)) f(value,field_order) where jsonb_typeof(f.value)='string'
  union all select a.value->>'filename',2,a.ordinality,0 from jsonb_array_elements(attachments) with ordinality a(value,ordinality) where jsonb_typeof(a.value->'filename')='string'
 ) parts where length(t)>0;
 return p_message || jsonb_build_object('payload',payload,'embedding_text',left(search_text,50000),'content_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(left(search_text,50000),'UTF8')),'hex'));
end $$;
create or replace function public.discord_persist_page(p_source_id uuid,p_messages jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.discord_channels; old public.discord_sync_state; m jsonb; previous public.discord_messages; policy public.discord_guild_policies; begin
 select * into c from public.discord_channels where source_id=p_source_id;
 select * into policy from public.discord_guild_policies where guild_id=c.guild_id for share;
 if policy.guild_id is not null and (policy.paused or policy.revision is distinct from (p_state->>'expected_policy_revision')::bigint or not public.discord_channel_allowed(c.guild_id,c.channel_id)) then return false; end if;
 if policy.guild_id is not null then
  select coalesce(jsonb_agg(public.discord_strip_message_images(v)),'[]'::jsonb) into p_messages from jsonb_array_elements(p_messages) v;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-memory:'||c.guild_id));
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

create or replace function public.discord_sync_channels()
returns setof public.discord_channels language sql stable security invoker set search_path='' as $$
 select c.* from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id
 where c.enabled and s.status='active' and public.discord_channel_allowed(c.guild_id,c.channel_id) order by c.channel_id;
$$;
-- Embeddings stay unavailable for discovery-policy guilds regardless of env.
create or replace function public.discord_embedding_work(p_limit integer,p_model text,p_provider text)
returns table(message_id text,content_hash text,content text,embedding_text text)
language sql stable security invoker set search_path='' as $$
 select m.message_id,m.content_hash,m.content,m.embedding_text from public.discord_messages m
 join public.discord_channels c on c.source_id=m.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 where not exists(select 1 from public.discord_guild_policies p where p.guild_id=c.guild_id)
 and length(trim(m.embedding_text)) between 1 and 12000
 and (m.embedding is null or m.embedding_model is distinct from p_model or m.embedding_provider is distinct from p_provider)
 order by m.created_at,m.message_id limit greatest(1,least(coalesce(p_limit,16),64));
$$;
create or replace function public.discord_save_embedding(p_message_id text,p_content_hash text,p_model text,p_provider text,p_vector extensions.vector(1536))
returns boolean language plpgsql security invoker set search_path='' as $$
declare count integer; guild text; policy public.discord_guild_policies; begin
 select c.guild_id into guild from public.discord_messages m join public.discord_channels c on c.source_id=m.source_id where m.message_id=p_message_id;
 select * into policy from public.discord_guild_policies where guild_id=guild for share;
 if policy.guild_id is not null then return false; end if;
 if p_model is null or p_provider is null or length(trim(p_model)) not between 1 and 200 or length(trim(p_provider)) not between 1 and 100 or p_vector is null then raise check_violation using message='Invalid embedding'; end if;
 update public.discord_messages m set embedding=p_vector,embedding_model=p_model,embedding_provider=p_provider,embedding_hash=p_content_hash
 from public.discord_channels c,public.knowledge_sources s
 where m.message_id=p_message_id and m.content_hash=p_content_hash and c.source_id=m.source_id and c.enabled and s.id=c.source_id and s.status='active';
 get diagnostics count=row_count; return count=1;
end $$;

-- Same exact rolling 168-hour precedence as server/discord/memory.js. Calendar
-- truncation happens in NY local time before converting to timestamptz.
create function public.discord_memory_period(p_created_at timestamptz,p_as_of timestamptz)
returns table(tier text,period_start timestamptz,period_end timestamptz)
language sql immutable security invoker set search_path='' as $$
 with bounds as(select p_created_at at time zone 'America/New_York' local_created,
   date_trunc('month',p_as_of at time zone 'America/New_York') month_start,
   p_as_of-interval '168 hours' recent_from), classified as(
 select case when p_created_at>=recent_from then 'daily' when local_created>=month_start then 'weekly' else 'monthly' end tier,
 local_created,month_start,recent_from from bounds)
 select tier,
 case when tier='daily' then greatest(date_trunc('day',local_created) at time zone 'America/New_York',recent_from)
 when tier='weekly' then greatest(date_trunc('week',local_created) at time zone 'America/New_York',month_start at time zone 'America/New_York')
 else date_trunc('month',local_created) at time zone 'America/New_York' end,
 case when tier='daily' then least((date_trunc('day',local_created)+interval '1 day') at time zone 'America/New_York',p_as_of)
 when tier='weekly' then least((date_trunc('week',local_created)+interval '7 days') at time zone 'America/New_York',recent_from)
 else least((date_trunc('month',local_created)+interval '1 month') at time zone 'America/New_York',recent_from) end
 from classified where p_created_at<p_as_of;
$$;
create function public.discord_rebuild_memory(p_guild_id text,p_expected_revision bigint,p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; buckets bigint; members bigint; begin
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for share;
 if policy.guild_id is null or policy.paused or policy.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy'; end if;
 if p_as_of is null or p_as_of>now()+interval '5 minutes' then raise check_violation using message='Invalid memory time'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-memory:'||p_guild_id));
 delete from public.discord_memory_buckets b using public.discord_channels c where b.source_id=c.source_id and c.guild_id=p_guild_id;
 insert into public.discord_memory_buckets(source_id,tier,period_start,period_end,as_of,policy_revision,message_count)
 select m.source_id,p.tier,p.period_start,p.period_end,p_as_of,policy.revision,count(*)
 from public.discord_messages m join public.discord_channels c on c.source_id=m.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 cross join lateral public.discord_memory_period(m.created_at,p_as_of) p
 where c.guild_id=p_guild_id and public.discord_channel_allowed(c.guild_id,c.channel_id)
 group by m.source_id,p.tier,p.period_start,p.period_end;
 get diagnostics buckets=row_count;
 insert into public.discord_memory_members(message_id,source_id,bucket_id)
 select m.message_id,m.source_id,b.id from public.discord_messages m join public.discord_memory_buckets b on b.source_id=m.source_id
 where b.as_of=p_as_of and b.policy_revision=policy.revision and m.guild_id=p_guild_id and m.created_at>=b.period_start and m.created_at<b.period_end;
 get diagnostics members=row_count;
 return jsonb_build_object('buckets',buckets,'messages',members,'as_of',p_as_of,'policy_revision',policy.revision);
end $$;
create function public.discord_reset_archive(p_member_id text,p_guild_id text,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; deleted bigint; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id) then raise insufficient_privilege using message='Admin access denied'; end if;
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.paused or policy.revision is distinct from p_expected_revision then raise serialization_failure using message='Reset requires paused current policy'; end if;
 delete from public.discord_memory_buckets b using public.discord_channels c where c.source_id=b.source_id and c.guild_id=p_guild_id;
 delete from public.discord_messages where guild_id=p_guild_id; get diagnostics deleted=row_count;
 delete from public.discord_sync_state st using public.discord_channels c where c.source_id=st.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_daily_summaries st using public.discord_channels c where c.source_id=st.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_documents d using public.discord_channels c where d.source_id=c.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_sync_state st using public.discord_channels c where st.source_id=c.source_id and c.guild_id=p_guild_id;
 delete from public.discord_discovery_state where guild_id=p_guild_id;
 update public.discord_guild_policies set revision=revision+1,updated_at=now() where guild_id=p_guild_id returning * into policy;
 update public.discord_channels set policy_revision=policy.revision where guild_id=p_guild_id;
 -- Operator, guild policy, exclusions, source ACLs and unrelated sources survive.
 return jsonb_build_object('deleted_messages',deleted,'guild_id',p_guild_id,'policy_revision',policy.revision);
end $$;

create function public.discord_memory_list(p_member_id text,p_allowed_source_ids uuid[],p_tier text default null,p_after uuid default null,p_limit integer default 20)
returns setof public.discord_memory_buckets language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.discord_guild_policies p where p.guild_id in(select c.guild_id from public.discord_channels c where c.source_id=any(p_allowed_source_ids)) order by p.guild_id for share;
 return query select b.* from public.discord_memory_buckets b
 join public.discord_channels c on c.source_id=b.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 join public.discord_guild_policies p on p.guild_id=c.guild_id and p.revision=b.policy_revision
 join public.knowledge_source_members sm on sm.source_id=b.source_id and sm.member_id=p_member_id and sm.can_read
 where cardinality(p_allowed_source_ids) between 1 and 100 and b.source_id=any(p_allowed_source_ids)
 and public.discord_channel_allowed(c.guild_id,c.channel_id) and (p_tier is null or b.tier=p_tier)
 and (p_after is null or b.id>p_after) order by b.id limit greatest(1,least(coalesce(p_limit,20),100));
end $$;
create function public.discord_memory_page(p_member_id text,p_allowed_source_ids uuid[],p_bucket_id uuid,p_after text default null,p_limit integer default 50)
returns table(message_id text,source_id uuid,created_at timestamptz,url text,payload jsonb)
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.discord_guild_policies p where p.guild_id in(select c.guild_id from public.discord_channels c where c.source_id=any(p_allowed_source_ids)) order by p.guild_id for share;
 return query select m.message_id,m.source_id,m.created_at,m.url,m.payload from public.discord_memory_members mm
 join public.discord_memory_buckets b on b.id=mm.bucket_id
 join public.discord_channels c on c.source_id=b.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 join public.discord_guild_policies p on p.guild_id=c.guild_id and p.revision=b.policy_revision
 join public.knowledge_source_members sm on sm.source_id=b.source_id and sm.member_id=p_member_id and sm.can_read
 join public.discord_messages m on m.message_id=mm.message_id and m.source_id=b.source_id
 where cardinality(p_allowed_source_ids) between 1 and 100 and b.source_id=any(p_allowed_source_ids) and b.id=p_bucket_id
 and public.discord_channel_allowed(c.guild_id,c.channel_id) and (p_after is null or m.message_id::numeric>p_after::numeric)
 order by m.message_id::numeric limit greatest(1,least(coalesce(p_limit,50),100));
end $$;
create or replace function public.discord_search(p_member_id text,p_allowed_source_ids uuid[],p_query text,p_channel_ids text[],p_author_id text,p_author_name text,p_from timestamptz,p_to timestamptz,p_mode text,p_vector extensions.vector(1536),p_model text,p_provider text,p_limit integer)
returns table(id uuid,source_id uuid,message_id text,channel_id text,guild_id text,author_id text,title text,excerpt text,created_at timestamptz,edited_at timestamptz,indexed_at timestamptz,reply_to_message_id text)
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.discord_guild_policies p where p.guild_id in(select c.guild_id from public.discord_channels c where c.source_id=any(p_allowed_source_ids)) order by p.guild_id for share;
 return query
 select m.id,m.source_id,m.message_id,m.channel_id,m.guild_id,m.author_id,c.title,left(m.embedding_text,1800),m.created_at,m.edited_at,m.indexed_at,m.reply_to_message_id
 from public.discord_messages m
 join public.discord_channels c on c.source_id=m.source_id and c.enabled
 join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
 where public.discord_channel_allowed(c.guild_id,c.channel_id) and cardinality(p_allowed_source_ids) between 1 and 100 and s.id=any(p_allowed_source_ids)
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
end $$;

-- Every new RPC/helper remains an invoker and executable by service_role only.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['discord_channel_allowed','discord_get_policy','discord_configure_policy','discord_get_discovery_state','discord_persist_discovery','discord_complete_discovery','discord_strip_components','discord_strip_message_images','discord_memory_period','discord_rebuild_memory','discord_reset_archive','discord_memory_list','discord_memory_page']) loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
