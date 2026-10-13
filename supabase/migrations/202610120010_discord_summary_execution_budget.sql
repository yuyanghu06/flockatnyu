-- Fingerprint verification and shared execution locks can exceed the hosted
-- authenticator's eight-second defaults. Scope budgets to these functions only;
-- preserve their bodies, permissions, financial guards and immutable migrations.
alter function public.discord_summary_claim_job(uuid,text,integer)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_renew_job(uuid,uuid,integer)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_get_inputs(uuid,uuid,integer,integer,integer)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_get_parts(uuid,uuid)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_save_part(uuid,uuid,jsonb)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_reserve_request(uuid,uuid,uuid,numeric,bigint,bigint)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_commit_usage(uuid,text,jsonb)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_fail_job(uuid,uuid,text)
 set statement_timeout='55s' set lock_timeout='55s';
alter function public.discord_summary_lock_job(uuid,uuid)
 set statement_timeout='55s' set lock_timeout='55s';
-- Keep the existing 60-second publication budget and 16MB work_mem. The wrapper
-- already allows 65 seconds; lock waits now match the other execution functions.
alter function public.discord_summary_finish_job(uuid,uuid,jsonb,jsonb,jsonb)
 set lock_timeout='55s';
notify pgrst,'reload schema';
