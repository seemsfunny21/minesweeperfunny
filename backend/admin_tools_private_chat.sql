ALTER TABLE public.predictions_ledger DROP CONSTRAINT predictions_ledger_reason_check;
ALTER TABLE public.predictions_ledger ADD CONSTRAINT predictions_ledger_reason_check CHECK (reason IN ('welcome','weekly','legacy_balance','stake','settlement','resignation_bonus','interest_in','interest_out','loan_in','loan_out','repayment_in','repayment_out','trophy','casino_stake','casino_payout','daily_draw','admin_grant','admin_remove'));
CREATE UNIQUE INDEX predictions_admin_remove_request_key ON public.predictions_ledger(reference) WHERE reason='admin_remove';
ALTER TABLE public.predictions_audit ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE public.predictions_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES public.predictions_accounts(id),
 recipient_id uuid REFERENCES public.predictions_accounts(id), request_id uuid NOT NULL,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 1000),
 announcement boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sender_id,request_id), CHECK(recipient_id IS NULL OR recipient_id<>sender_id),
 CHECK(NOT announcement OR recipient_id IS NULL)
);
ALTER TABLE public.predictions_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.predictions_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.predictions_messages TO service_role;
CREATE INDEX predictions_messages_public_idx ON public.predictions_messages(created_at DESC,id DESC) WHERE recipient_id IS NULL;
CREATE INDEX predictions_messages_private_idx ON public.predictions_messages(sender_id,recipient_id,created_at DESC);
CREATE INDEX predictions_messages_incoming_idx ON public.predictions_messages(recipient_id,sender_id,created_at DESC);
CREATE FUNCTION public.predictions_admin_remove(p_actor uuid,p_target uuid,p_amount integer,p_request uuid,p_admin_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE ref text; prior record; d date:=(clock_timestamp() AT TIME ZONE 'Europe/Athens')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(542602,1);
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved' AND pin_hash=p_admin_hash) THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 IF p_target IS NULL OR p_target=p_actor OR p_request IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Μη έγκυρο ποσό.'; END IF;
 ref:=p_actor::text||':'||p_request::text;
 SELECT account_id,amount INTO prior FROM public.predictions_ledger WHERE reason='admin_remove' AND reference=ref;
 IF FOUND THEN
  IF prior.account_id=p_target AND prior.amount=-p_amount THEN RETURN; END IF;
  RAISE EXCEPTION 'Το αίτημα χρησιμοποιήθηκε ήδη.';
 END IF;
 PERFORM 1 FROM public.predictions_accounts WHERE id=p_target AND status='approved' AND NOT is_admin FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένο μέλος.'; END IF;
 IF coalesce(public.predictions_long_spendable(p_target,d),0)<p_amount THEN RAISE EXCEPTION 'Δεν επαρκούν οι μη δεσμευμένες μάρκες.'; END IF;
 UPDATE public.predictions_accounts SET chips=chips-p_amount WHERE id=p_target;
 INSERT INTO public.predictions_ledger(account_id,amount,reason,reference) VALUES(p_target,-p_amount,'admin_remove',ref);
END $fn$;
CREATE FUNCTION public.predictions_admin_cancel(p_actor uuid,p_event uuid,p_request uuid,p_admin_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE e record; t record; paidval bigint; at_time timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock(542602,1);
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved' AND pin_hash=p_admin_hash) THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 IF p_event IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'Άκυρη ερώτηση.'; END IF;
 IF EXISTS(SELECT 1 FROM public.predictions_audit WHERE actor_id=p_actor AND action='cancel_event' AND details->>'request_id'=p_request::text AND details->>'event_id'=p_event::text) THEN RETURN; END IF;
 SELECT id,name,settled_at INTO e FROM public.predictions_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.settled_at IS NOT NULL THEN RAISE EXCEPTION 'Η ερώτηση δεν είναι εκκρεμής.'; END IF;
 UPDATE public.predictions_events SET result=NULL,settled_at=at_time WHERE id=p_event;
 FOR t IN SELECT q.id,q.account_id FROM public.predictions_tickets q WHERE q.settled_at IS NULL
 AND EXISTS(SELECT 1 FROM public.predictions_picks p WHERE p.ticket_id=q.id AND p.event_id=p_event)
 AND NOT EXISTS(SELECT 1 FROM public.predictions_picks p JOIN public.predictions_events ev ON ev.id=p.event_id WHERE p.ticket_id=q.id AND ev.settled_at IS NULL)
 ORDER BY q.id FOR UPDATE LOOP
  paidval:=public.predictions_payout(t.id);
  UPDATE public.predictions_accounts SET chips=chips+paidval WHERE id=t.account_id;
  UPDATE public.predictions_tickets SET paid=paidval,settled_at=at_time WHERE id=t.id;
  INSERT INTO public.predictions_ledger(account_id,amount,reason,reference) VALUES(t.account_id,paidval,'settlement',t.id::text);
 END LOOP;
 INSERT INTO public.predictions_audit(actor_id,action,details) VALUES(p_actor,'cancel_event',jsonb_build_object('event_id',p_event,'request_id',p_request,'name',e.name));
END $fn$;
CREATE FUNCTION public.predictions_message_send(p_actor uuid,p_recipient uuid,p_body text,p_request uuid,p_announcement boolean DEFAULT false,p_admin_hash text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE msg text:=btrim(p_body); old record; mid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('predictions-chat:'||coalesce(p_actor::text,''),0));
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND status='approved') THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένος λογαριασμός.'; END IF;
 IF p_request IS NULL OR msg IS NULL OR char_length(msg) NOT BETWEEN 1 AND 1000 OR p_announcement IS NULL OR p_recipient=p_actor THEN RAISE EXCEPTION 'Μη έγκυρο μήνυμα.'; END IF;
 IF p_announcement AND (p_recipient IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved' AND pin_hash=p_admin_hash)) THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 SELECT * INTO old FROM public.predictions_messages WHERE sender_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF old.recipient_id IS NOT DISTINCT FROM p_recipient AND old.body=msg AND old.announcement=p_announcement THEN RETURN old.id; END IF;
  RAISE EXCEPTION 'Το αίτημα χρησιμοποιήθηκε ήδη.';
 END IF;
 IF p_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_recipient AND status='approved') THEN RAISE EXCEPTION 'Ο παραλήπτης δεν είναι διαθέσιμος.'; END IF;
 IF (SELECT count(*) FROM public.predictions_messages WHERE sender_id=p_actor AND created_at>clock_timestamp()-interval '1 minute')>=12 THEN RAISE EXCEPTION 'Πολλά μηνύματα. Δοκίμασε σε λίγο.'; END IF;
 INSERT INTO public.predictions_messages(sender_id,recipient_id,body,request_id,announcement) VALUES(p_actor,p_recipient,msg,p_request,p_announcement) RETURNING id INTO mid;
 IF p_announcement THEN INSERT INTO public.predictions_audit(actor_id,action,details) VALUES(p_actor,'announcement',jsonb_build_object('message_id',mid)); END IF;
 RETURN mid;
END $fn$;
CREATE FUNCTION public.predictions_message_list(p_actor uuid,p_peer uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND status='approved') THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένος λογαριασμός.'; END IF;
 RETURN jsonb_build_object('messages',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id) FROM
 (SELECT m.id,m.sender_id,m.recipient_id,a.nickname,m.body,m.announcement,m.created_at FROM public.predictions_messages m JOIN public.predictions_accounts a ON a.id=m.sender_id
 WHERE (p_peer IS NULL AND m.recipient_id IS NULL) OR (p_peer IS NOT NULL AND ((m.sender_id=p_actor AND m.recipient_id=p_peer) OR (m.sender_id=p_peer AND m.recipient_id=p_actor)))
 ORDER BY m.created_at DESC,m.id DESC LIMIT 100)x),'[]'::jsonb),
 'conversations',coalesce((SELECT jsonb_agg(to_jsonb(y) ORDER BY y.last_at DESC) FROM
 (SELECT a.id,a.nickname,max(m.created_at) last_at FROM public.predictions_messages m JOIN public.predictions_accounts a ON a.id=CASE WHEN m.sender_id=p_actor THEN m.recipient_id ELSE m.sender_id END
 WHERE m.recipient_id IS NOT NULL AND (m.sender_id=p_actor OR m.recipient_id=p_actor) GROUP BY a.id,a.nickname LIMIT 100)y),'[]'::jsonb));
END $fn$;
CREATE FUNCTION public.predictions_announcement_latest(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $fn$
SELECT (SELECT jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at) FROM public.predictions_messages m WHERE announcement AND EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND status='approved') ORDER BY created_at DESC LIMIT 1)
$fn$;
CREATE FUNCTION public.predictions_admin_overview(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved') THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 RETURN jsonb_build_object(
 'history',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM (
 SELECT q.created_at,q.action,a.nickname actor,b.nickname target,q.details FROM public.predictions_audit q LEFT JOIN public.predictions_accounts a ON a.id=q.actor_id LEFT JOIN public.predictions_accounts b ON b.id=q.target_id
 UNION ALL SELECT l.created_at,l.reason,a.nickname,b.nickname,jsonb_build_object('amount',l.amount) FROM public.predictions_ledger l LEFT JOIN public.predictions_accounts a ON a.id::text=split_part(l.reference,':',1) JOIN public.predictions_accounts b ON b.id=l.account_id WHERE l.reason IN ('admin_grant','admin_remove')
 )z ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.target_date,x.name) FROM (SELECT e.id,e.name,r.target_date,(SELECT count(*) FROM public.predictions_picks p WHERE p.event_id=e.id) picks FROM public.predictions_events e JOIN public.predictions_rounds r USING(open_date) WHERE e.settled_at IS NULL ORDER BY r.target_date,e.name LIMIT 100)x),'[]'::jsonb),
 'system',(SELECT jsonb_build_object('economy_enabled',economy_enabled,'staff_synced_at',staff_synced_at,'sync_ok',coalesce(staff_synced_at>now()-interval '5 minutes',false),
 'enabled_devices',(SELECT count(*) FROM public.predictions_push_devices WHERE enabled),
 'push_sent_24h',(SELECT count(*) FROM public.predictions_push_deliveries WHERE sent_at>now()-interval '24 hours'),
 'push_stopped_24h',(SELECT count(*) FROM public.predictions_push_deliveries WHERE stopped_at>now()-interval '24 hours' AND sent_at IS NULL),
 'pending_tickets',(SELECT count(*) FROM public.predictions_tickets WHERE settled_at IS NULL)) FROM public.predictions_settings WHERE singleton));
END $fn$;
REVOKE ALL ON FUNCTION public.predictions_admin_remove(uuid,uuid,integer,uuid,text), public.predictions_admin_cancel(uuid,uuid,uuid,text), public.predictions_message_send(uuid,uuid,text,uuid,boolean,text), public.predictions_message_list(uuid,uuid),public.predictions_announcement_latest(uuid),public.predictions_admin_overview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.predictions_admin_remove(uuid,uuid,integer,uuid,text), public.predictions_admin_cancel(uuid,uuid,uuid,text), public.predictions_message_send(uuid,uuid,text,uuid,boolean,text), public.predictions_message_list(uuid,uuid),public.predictions_announcement_latest(uuid),public.predictions_admin_overview(uuid) TO service_role;