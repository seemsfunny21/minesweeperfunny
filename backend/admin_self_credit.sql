CREATE OR REPLACE FUNCTION public.predictions_admin_grant(p_actor uuid, p_target uuid, p_amount integer, p_request uuid, p_admin_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE ref text; prior record;
BEGIN
 PERFORM pg_advisory_xact_lock(542602,1);
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND is_admin AND status='approved' AND pin_hash=p_admin_hash) THEN RAISE EXCEPTION 'Δεν επιτρέπεται.'; END IF;
 IF p_target IS NULL OR p_request IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Μη έγκυρη πίστωση.'; END IF;
 ref:=p_actor::text||':'||p_request::text;
 SELECT account_id,amount INTO prior FROM public.predictions_ledger WHERE reason='admin_grant' AND reference=ref;
 IF FOUND THEN
  IF prior.account_id=p_target AND prior.amount=p_amount THEN RETURN; END IF;
  RAISE EXCEPTION 'Το αίτημα χρησιμοποιήθηκε ήδη.';
 END IF;
 UPDATE public.predictions_accounts SET chips=chips+p_amount WHERE id=p_target AND status='approved';
 IF NOT FOUND THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένο μέλος.'; END IF;
 INSERT INTO public.predictions_ledger(account_id,amount,reason,reference) VALUES(p_target,p_amount,'admin_grant',ref);
END $function$
;
-- Rollback-only regression test; no persistent balances changed:
/*
begin;
do $qa$
declare a uuid; b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); h text; base bigint; n bigint; rejected boolean;
begin
select id,pin_hash,chips into strict a,h,base from public.predictions_accounts where is_admin and status='approved';
select count(*) into n from public.predictions_ledger where account_id=a and reason='admin_grant';
insert into public.predictions_accounts(id,nickname,pin_salt,pin_hash,status,is_admin,chips) values(b,'QA member '||left(b::text,8),repeat('0',32),repeat('1',64),'approved',false,100),(c,'QA pending '||left(c::text,8),repeat('0',32),repeat('1',64),'pending',false,0);
perform public.predictions_admin_grant(a,a,1000,req,h);
perform public.predictions_admin_grant(a,a,1000,req,h);
if (select chips from public.predictions_accounts where id=a)<>base+1000 then raise exception 'self/replay failed';end if;
perform public.predictions_admin_grant(a,a,200,gen_random_uuid(),h);
perform public.predictions_admin_grant(a,b,1000,gen_random_uuid(),h);
if (select chips from public.predictions_accounts where id=a)<>base+1200 or (select chips from public.predictions_accounts where id=b)<>1100 then raise exception 'repeat failed';end if;
if (select count(*) from public.predictions_ledger where account_id=a and reason='admin_grant')<>n+2 then raise exception 'ledger failed';end if;
rejected:=false;begin perform public.predictions_admin_grant(a,c,100,gen_random_uuid(),h);exception when others then rejected:=true;end;if not rejected then raise exception 'pending accepted';end if;
rejected:=false;begin perform public.predictions_admin_grant(a,a,100,gen_random_uuid(),case when h=repeat('2',64) then repeat('3',64) else repeat('2',64) end);exception when others then rejected:=true;end;if not rejected then raise exception 'invalid pin accepted';end if;
rejected:=false;begin perform public.predictions_admin_grant(b,b,100,gen_random_uuid(),repeat('1',64));exception when others then rejected:=true;end;if not rejected then raise exception 'non-admin accepted';end if;
rejected:=false;begin perform public.predictions_admin_grant(a,a,999,req,h);exception when others then rejected:=true;end;if not rejected then raise exception 'changed replay accepted';end if;
if has_function_privilege('anon','public.predictions_admin_grant(uuid,uuid,integer,uuid,text)','execute') or has_function_privilege('authenticated','public.predictions_admin_grant(uuid,uuid,integer,uuid,text)','execute') then raise exception 'permissions';end if;
end $qa$;
rollback;
*/
