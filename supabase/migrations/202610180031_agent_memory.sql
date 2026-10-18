-- One shared text note, injected into chat and maintained through a bounded tool.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-agent-memory',0));
create table public.agent_memory (
 id text primary key default 'shared' check (id='shared'),
 content text not null default '' check (octet_length(content)<=16000),
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.agent_memory(id) values('shared');
alter table public.agent_memory enable row level security;
alter table public.agent_memory force row level security;
revoke all on table public.agent_memory from public,anon,authenticated,service_role;
grant select on table public.agent_memory to service_role;

create function public.agent_memory_read() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status','ready','memory',to_jsonb(m))
 from public.agent_memory m where m.id='shared';
$$;
create function public.agent_memory_write(p_content text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.agent_memory;
begin
 if p_content is null or octet_length(p_content)>16000 or p_expected_updated_at is null
  or not isfinite(p_expected_updated_at) then raise check_violation using message='Invalid memory update';end if;
 select * into m from public.agent_memory where id='shared' for update;
 if not found then raise check_violation using message='Shared memory unavailable';end if;
 if m.content=p_content then return jsonb_build_object('status','ready','outcome','unchanged','memory',to_jsonb(m));end if;
 if m.updated_at<>p_expected_updated_at then return jsonb_build_object('status','conflict');end if;
 update public.agent_memory set content=p_content,
  updated_at=greatest(clock_timestamp(),m.updated_at+interval '1 microsecond') where id='shared' returning * into m;
 return jsonb_build_object('status','ready','outcome','updated','memory',to_jsonb(m));
end $$;
alter function public.agent_memory_read() owner to postgres;
alter function public.agent_memory_write(text,timestamptz) owner to postgres;
revoke all on function public.agent_memory_read() from public,anon,authenticated;
revoke all on function public.agent_memory_write(text,timestamptz) from public,anon,authenticated;
grant execute on function public.agent_memory_read() to service_role;
grant execute on function public.agent_memory_write(text,timestamptz) to service_role;
comment on table public.agent_memory is 'One shared long-term text note for chat. Background context only; never a source archive, credential store or replacement for core instructions.';
commit;
