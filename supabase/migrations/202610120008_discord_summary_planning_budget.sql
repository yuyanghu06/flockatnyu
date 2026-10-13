-- Native hosted canonical planning exceeds60s after the bounded007 plan fix.
-- Extend only planning RPCs; preserve their bodies,16MB work_mem and permissions.
alter function public.discord_summary_preview(text,text,text,text,text,timestamptz)
 set statement_timeout='180s';
alter function public.discord_summary_begin_operation(text,bigint,text,text,text,numeric,integer,text,timestamptz,text)
 set statement_timeout='180s';
notify pgrst,'reload schema';
