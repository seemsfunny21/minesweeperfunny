-- Legacy arrival push: preserve dispatch whenever devices or pending queue entries exist.
-- Avoid idle HTTP invocations without deleting any legacy accounts, events or history.
do $legacy$
declare j record;
begin
 select jobid,command into strict j from cron.job where jobname='arrival-push-new-events';
 if position('arrival_push_devices where enabled' in j.command)>0 then return;end if;
 if j.command not like '%net.http_post%' then raise exception 'Unexpected legacy push cron';end if;
 perform cron.alter_job(job_id=>j.jobid,command=>regexp_replace(rtrim(j.command),'[;[:space:]]+$','') || ' where exists(select 1 from public.arrival_push_devices where enabled) or exists(select 1 from public.arrival_push_events where completed_at is null);');
end $legacy$;
