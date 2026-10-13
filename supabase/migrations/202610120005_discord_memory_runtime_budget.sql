-- Scoped budget for the recurring service-only archive classification RPC.
-- PostgREST hoists this function's statement_timeout before its main query;
-- work_mem applies while the existing guarded implementation executes.
-- No role, database, access policy or classification algorithm is changed.
alter function public.discord_rebuild_memory(text,bigint,timestamptz)
 set statement_timeout='60s';
alter function public.discord_rebuild_memory(text,bigint,timestamptz)
 set work_mem='16MB';
notify pgrst,'reload schema';
