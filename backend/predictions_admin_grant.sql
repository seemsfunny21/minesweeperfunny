ALTER TABLE public.predictions_ledger DROP CONSTRAINT predictions_ledger_reason_check;
ALTER TABLE public.predictions_ledger ADD CONSTRAINT predictions_ledger_reason_check CHECK (reason IN ('welcome','weekly','legacy_balance','stake','settlement','resignation_bonus','interest_in','interest_out','loan_in','loan_out','repayment_in','repayment_out','trophy','casino_stake','casino_payout','daily_draw','admin_grant'));
CREATE UNIQUE INDEX predictions_admin_grant_request_key ON public.predictions_ledger(reference) WHERE reason='admin_grant';
CREATE FUNCTION public.predictions_admin_grant(p_actor uuid,p_target uuid,p_amount integer,p_request uuid,p_admin_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE ref text; prior record;
BEGIN
 PERFORM pg_advisory_xact_lock(542602,1);
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved' AND pin_hash=p_admin_hash) THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 IF p_target IS NULL OR p_target=p_actor OR p_request IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Μη έγκυρη πίστωση.'; END IF;
 ref:=p_actor::text||':'||p_request::text;
 SELECT account_id,amount INTO prior FROM public.predictions_ledger WHERE reason='admin_grant' AND reference=ref;
 IF FOUND THEN
  IF prior.account_id=p_target AND prior.amount=p_amount THEN RETURN; END IF;
  RAISE EXCEPTION 'Το αίτημα χρησιμοποιήθηκε ήδη.';
 END IF;
 UPDATE public.predictions_accounts SET chips=chips+p_amount WHERE id=p_target AND status='approved' AND NOT is_admin;
 IF NOT FOUND THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένο μέλος.'; END IF;
 INSERT INTO public.predictions_ledger(account_id,amount,reason,reference) VALUES(p_target,p_amount,'admin_grant',ref);
END $fn$;
REVOKE ALL ON FUNCTION public.predictions_admin_grant(uuid,uuid,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.predictions_admin_grant(uuid,uuid,integer,uuid,text) TO service_role;