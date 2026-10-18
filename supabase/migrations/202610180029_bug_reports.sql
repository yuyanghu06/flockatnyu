-- User-reported product bugs only. Details stay in one structured JSON field.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-bug-reports',0));

create table public.bug_reports (
 uuid uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 report jsonb not null check (jsonb_typeof(report)='object' and octet_length(report::text)<=16384)
);
alter table public.bug_reports enable row level security;
alter table public.bug_reports force row level security;
revoke all on table public.bug_reports from public,anon,authenticated,service_role;
grant select on table public.bug_reports to service_role;
comment on table public.bug_reports is 'Structured bug reports submitted by chat users; service-only append via bug_report_record. No browser access or general-purpose source archive.';

create function public.bug_report_record(p_uuid uuid,p_report jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stored public.bug_reports; inserted boolean;
begin
 if p_uuid is null or p_report is null or jsonb_typeof(p_report)<>'object'
  or octet_length(p_report::text)>16384
  or p_report->>'schema_version' is distinct from '1'
  or p_report->>'status' is distinct from 'new'
  or jsonb_typeof(p_report->'summary') is distinct from 'string'
  or length(btrim(p_report->>'summary')) not between 1 and 200
  or jsonb_typeof(p_report->'observed_behavior') is distinct from 'string'
  or length(btrim(p_report->>'observed_behavior')) not between 1 and 2000
  or jsonb_typeof(p_report->'user_message') is distinct from 'string'
  or length(p_report->>'user_message') not between 1 and 12000
 then raise check_violation using message='Invalid structured bug report'; end if;
 insert into public.bug_reports(uuid,report) values(p_uuid,p_report)
 on conflict(uuid) do nothing returning * into stored;
 inserted=found;
 if not inserted then
  select * into stored from public.bug_reports where uuid=p_uuid;
  if stored.report is distinct from p_report then return jsonb_build_object('status','conflict');end if;
 end if;
 return jsonb_build_object('status','ready','reportId',stored.uuid,'createdAt',stored.created_at,
  'outcome',case when inserted then 'created' else 'already_saved' end);
end $$;
alter function public.bug_report_record(uuid,jsonb) owner to postgres;
revoke all on function public.bug_report_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bug_report_record(uuid,jsonb) to service_role;
commit;
