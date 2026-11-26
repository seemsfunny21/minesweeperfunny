CREATE OR REPLACE FUNCTION public.predictions_push_claim(p_limit integer DEFAULT 50)
 RETURNS TABLE(queue_id uuid, device_id uuid, kind text, endpoint text, p256dh text, auth text, attempts integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(542603,1);
 perform public.predictions_push_reminders();
 insert into public.predictions_push_deliveries(queue_id,device_id)
 select q.id,d.id from public.predictions_push_queue q join public.predictions_push_devices d on d.account_id=q.account_id and d.enabled join public.predictions_sessions s on s.token_hash=d.session_hash and s.account_id=d.account_id and s.expires_at>now()
 where q.expires_at>now() and q.created_at>=d.updated_at on conflict do nothing;
 return query with eligible as (
 select l.queue_id,l.device_id from public.predictions_push_deliveries l join public.predictions_push_queue q on q.id=l.queue_id join public.predictions_push_devices d on d.id=l.device_id join public.predictions_accounts a on a.id=q.account_id join public.predictions_sessions s on s.token_hash=d.session_hash and s.account_id=d.account_id and s.expires_at>now()
 where l.sent_at is null and l.stopped_at is null and l.attempts<4 and (l.claimed_at is null or l.claimed_at<now()-interval '2 minutes') and q.expires_at>now() and d.enabled and d.account_id=q.account_id and q.created_at>=d.updated_at and a.status='approved'
 and (q.kind<>'round' or (q.round_day is not null and now()>=((q.round_day+time '17:31') at time zone 'Europe/Athens') and exists(select 1 from public.predictions_events e join public.predictions_rounds r using(open_date) where r.open_date=q.round_day and e.settled_at is null)))
 and (q.kind<>'reminder' or not exists(select 1 from public.predictions_tickets t where t.account_id=q.account_id and t.open_date=q.round_day))
 and (q.kind<>'loan_request' or exists(select 1 from public.predictions_loans b where b.id::text=q.dedupe and b.status='requested'))
 order by q.created_at limit greatest(1,least(p_limit,100)) for update of l skip locked
 ), claimed as (update public.predictions_push_deliveries l set attempts=l.attempts+1,claimed_at=now() from eligible e where l.queue_id=e.queue_id and l.device_id=e.device_id returning l.queue_id,l.device_id,l.attempts)
 select c.queue_id,c.device_id,q.kind,d.endpoint,d.p256dh,d.auth,c.attempts from claimed c join public.predictions_push_queue q on q.id=c.queue_id join public.predictions_push_devices d on d.id=c.device_id;
end $function$;
