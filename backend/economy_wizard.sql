-- Non-destructive economy wizard; defaults preserve today's economy exactly.
alter table public.predictions_settings add column if not exists weekly_credit integer not null default 1000 check (weekly_credit between 500 and 5000);
alter table public.predictions_settings add column if not exists price_pace numeric(4,2) not null default 1 check (price_pace between 1 and 3);
alter table public.predictions_settings add column if not exists economy_revision bigint not null default 0;
alter table public.predictions_shop_items add column if not exists economy_base_price numeric;
update public.predictions_shop_items set economy_base_price=price where economy_base_price is null;
CREATE OR REPLACE FUNCTION public.predictions_weekly(p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare wk date:=date_trunc('week',p_at at time zone 'Europe/Athens')::date; q record; a record; due integer; i integer; credit integer;
begin
 perform pg_advisory_xact_lock(542602,1);
 if not exists(select 1 from public.predictions_settings where singleton and economy_enabled) then return;end if;
 update public.predictions_loans set status='expired',closed_at=p_at where status='requested' and due_date<=wk;
 -- All due debts are covered by the weekly allowance, including suspended borrowers.
 for a in select id,status,last_weekly_credit from public.predictions_accounts where (status='approved' and last_weekly_credit<wk) or exists(select 1 from public.predictions_loans l where l.borrower=predictions_accounts.id and l.status='active' and l.due_date<=wk) order by id for update loop
  select coalesce(sum(outstanding+ceil(outstanding::numeric/10)::int),0)::int into due from public.predictions_loans where borrower=a.id and status='active' and due_date<=wk;
  credit:=case when a.last_weekly_credit<wk and a.status='approved' then (select weekly_credit from public.predictions_settings where singleton) when a.last_weekly_credit<wk then due else 0 end;
  if credit>0 then
   update public.predictions_accounts set chips=chips+credit,last_weekly_credit=wk where id=a.id;
   insert into public.predictions_ledger(account_id,amount,reason,reference) values(a.id,credit,'weekly',wk::text);
  end if;
 end loop;
 for q in select * from public.predictions_loans where status='active' and due_date<=wk order by id for update loop
  i:=ceil(q.outstanding::numeric/10)::int;
  update public.predictions_accounts set chips=chips-q.outstanding-i where id=q.borrower;
  update public.predictions_accounts set chips=chips+q.outstanding+i where id=q.lender;
  insert into public.predictions_ledger(account_id,amount,reason,reference) values
  (q.borrower,-q.outstanding,'repayment_out',q.id::text||':due'),(q.lender,q.outstanding,'repayment_in',q.id::text||':due'),
  (q.borrower,-i,'interest_out',q.id::text),(q.lender,i,'interest_in',q.id::text);
  update public.predictions_loans set outstanding=0,status='paid',closed_at=p_at,interest_paid=i where id=q.id;
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION public.predictions_manage(p_actor uuid, p_target uuid, p_action text, p_salt text DEFAULT NULL::text, p_hash text DEFAULT NULL::text, p_admin_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.predictions_accounts%rowtype; t public.predictions_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(542602,1);
 select * into a from public.predictions_accounts where id=p_actor for update;
 if not found or not a.is_admin or a.status<>'approved' then raise exception 'Δεν επιτρέπεται.'; end if;
 select * into t from public.predictions_accounts where id=p_target for update;
 if not found or t.is_admin then raise exception 'Άκυρος λογαριασμός.'; end if;
 if p_action='approve' then
  if t.status<>'pending' and t.status<>'suspended' then raise exception 'Μη έγκυρη κατάσταση.'; end if;
  update public.predictions_accounts set status='approved',approved_at=coalesce(approved_at,now()) where id=t.id;
  if t.legacy_id is null and t.approved_at is null then
   update public.predictions_accounts set chips=chips+(select weekly_credit from public.predictions_settings where singleton),last_weekly_credit=date_trunc('week',now() at time zone 'Europe/Athens')::date where id=t.id;
   insert into public.predictions_ledger(account_id,amount,reason,reference) values(t.id,(select weekly_credit from public.predictions_settings where singleton),'welcome','first');
  end if;
 elsif p_action in ('reject','suspend') then
  if p_action='reject' and t.status='pending' and t.approved_at is null and exists(select 1 from staff_registry.account_links l where l.account_id=t.id) then
   perform staff_registry.expire_registrations(t.id);
   return jsonb_build_object('ok',true);
  end if;
  update public.predictions_accounts set status=case p_action when 'reject' then 'rejected' else 'suspended' end where id=t.id;
  delete from public.predictions_sessions where account_id=t.id;
 elsif p_action='reset_pin' then
  if p_admin_hash is distinct from a.pin_hash or p_salt is null or p_hash is null then raise exception 'Η επαλήθευση Admin απέτυχε.'; end if;
  update public.predictions_accounts set pin_salt=p_salt,pin_hash=p_hash where id=t.id;
  delete from public.predictions_sessions where account_id=t.id;
 else raise exception 'Άγνωστη ενέργεια.'; end if;
 insert into public.predictions_audit(actor_id,target_id,action) values(a.id,t.id,p_action);
 return jsonb_build_object('ok',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.predictions_bank_state(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d date:=(now() at time zone 'Europe/Athens')::date;wk date:=date_trunc('week',d::timestamp)::date;a public.predictions_accounts%rowtype;
begin
 select * into a from public.predictions_accounts where id=p_actor and status='approved';if not found then raise exception 'Δεν επιτρέπεται.';end if;
 return jsonb_build_object(
 'available',greatest(0,a.chips-public.predictions_bank_reserve(a.id,d)),
 'lend_available',public.predictions_long_spendable(a.id,d),
 'borrow_available',greatest(0,a.chips-public.predictions_reserve(d))<=100,
 'borrowed',coalesce((select sum(principal) from public.predictions_loans where borrower=a.id and week_start=wk and lender is not null),0),
 'lent',coalesce((select sum(principal) from public.predictions_loans where lender=a.id and week_start=wk),0),
 'due_date',wk+7,'weekly_credit',(select weekly_credit from public.predictions_settings where singleton),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'borrower',l.borrower,'name',b.nickname,'principal',l.principal) order by l.created_at) from public.predictions_loans l join public.predictions_accounts b on b.id=l.borrower where l.status='requested' and l.week_start=wk and b.status='approved'),'[]'::jsonb),
 'loans',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select l.id,l.borrower,l.lender,b.nickname borrower_name,c.nickname lender_name,l.principal,l.outstanding,l.status,l.due_date,l.interest_paid,l.created_at from public.predictions_loans l join public.predictions_accounts b on b.id=l.borrower join public.predictions_accounts c on c.id=l.lender where a.id in(l.borrower,l.lender) order by l.created_at desc limit 100)x),'[]'::jsonb)
 );
end $function$
;
create or replace function public.predictions_admin_economy(p_actor uuid,p_weekly integer default null,p_pace numeric default null,p_apply boolean default false,p_expected text default null,p_admin_hash text default null)
returns jsonb language plpgsql set search_path to '' as $plan$
declare cfg public.predictions_settings%rowtype; a public.predictions_accounts%rowtype; credit integer; pace numeric; old_scale numeric; new_scale numeric; fingerprint text; items jsonb; samples jsonb; old_total bigint; new_total bigint; count_items integer; typical numeric; members integer; settled integer;
begin
 perform pg_advisory_xact_lock(542602,1);
 select * into a from public.predictions_accounts where id=p_actor and status='approved' and is_admin;
 if not found then raise exception 'Απαιτείται Admin.';end if;
 select * into strict cfg from public.predictions_settings where singleton for update;
 credit:=coalesce(p_weekly,cfg.weekly_credit); pace:=coalesce(p_pace,cfg.price_pace);
 if credit not between 500 and 5000 or pace not between 1 and 3 or pace<>round(pace,2) then raise exception 'Μη έγκυρο πλάνο.';end if;
 old_scale:=cfg.weekly_credit::numeric/1000*cfg.price_pace;new_scale:=credit::numeric/1000*pace;
 select md5(jsonb_build_array(cfg.weekly_credit,cfg.price_pace,cfg.economy_revision,coalesce(jsonb_agg(jsonb_build_array(code,price,economy_base_price,active) order by code),'[]'))::text) into fingerprint from public.predictions_shop_items;
 with base as (select code,name,price,case when economy_base_price is null or round(economy_base_price*old_scale)<>price then price/old_scale else economy_base_price end as base from public.predictions_shop_items),
 proposed as (select code,name,price as old_price,greatest(1,round(base*new_scale))::bigint as new_price,base from base)
 select coalesce(jsonb_agg(to_jsonb(proposed) order by old_price,code),'[]'),coalesce(sum(old_price),0),coalesce(sum(new_price),0),count(*) into items,old_total,new_total,count_items from proposed;
 if exists(select 1 from jsonb_to_recordset(items) as v(new_price bigint) where new_price>1000000) then raise exception 'Το πλάνο υπερβαίνει το όριο τιμών.';end if;
 select count(*),coalesce(sum(n),0),coalesce(round((percentile_cont(.5) within group(order by net))::numeric/4),0) into members,settled,typical from
 (select t.account_id,count(*) n,sum(t.paid-t.stake) net from public.predictions_tickets t join public.predictions_accounts a2 on a2.id=t.account_id where t.settled_at>=now()-interval '28 days' and a2.status='approved' and not a2.is_bot group by t.account_id) x;
 select coalesce(jsonb_agg(to_jsonb(v) order by v.old_price,v.code),'[]') into samples from (select code,name,old_price,new_price from jsonb_to_recordset(items) as j(code text,name text,old_price bigint,new_price bigint) order by old_price limit 8)v;
 if p_apply then
  if p_admin_hash is distinct from a.pin_hash then raise exception 'Απαιτείται επαλήθευση Admin.';end if;
  if p_expected is distinct from fingerprint then raise exception 'Το πλάνο άλλαξε. Κάνε νέα προεπισκόπηση.';end if;
  if credit<>cfg.weekly_credit or pace<>cfg.price_pace then
   update public.predictions_shop_items s set price=v.new_price::integer,economy_base_price=v.base from jsonb_to_recordset(items) as v(code text,new_price bigint,base numeric) where s.code=v.code;
   update public.predictions_settings set weekly_credit=credit,price_pace=pace,economy_revision=economy_revision+1 where singleton;
   insert into public.predictions_audit(actor_id,target_id,action,details) values(a.id,a.id,'economy_plan',jsonb_build_object('old_weekly',cfg.weekly_credit,'weekly',credit,'old_pace',cfg.price_pace,'pace',pace,'catalog_items',count_items));
  end if;
 end if;
 return jsonb_build_object('ok',true,'current_weekly',cfg.weekly_credit,'current_pace',cfg.price_pace,'weekly',credit,'pace',pace,'fingerprint',fingerprint,'items',count_items,'old_total',old_total,'new_total',new_total,'samples',samples,'median_weekly_net',typical,'sample_members',members,'sample_tickets',settled,'applied',p_apply);
end $plan$;
revoke all on function public.predictions_admin_economy(uuid,integer,numeric,boolean,text,text) from public,anon,authenticated;
grant execute on function public.predictions_admin_economy(uuid,integer,numeric,boolean,text,text) to service_role;
-- Stale clients cannot purchase at a different price after an economy update.
create or replace function public.predictions_shop_checked(p_actor uuid,p_operation text,p_code text,p_recipient uuid,p_request uuid,p_expected_price integer default null)
returns jsonb language plpgsql set search_path to '' as $checked$
declare current_price integer; rev bigint;
begin
 perform pg_advisory_xact_lock(542602,1);
 if p_operation in ('buy','gift') and not exists(select 1 from public.predictions_shop_receipts where account_id=p_actor and request_id=p_request) then
  select economy_revision into rev from public.predictions_settings where singleton;
  select price into current_price from public.predictions_shop_items where code=p_code and active;
  if (p_expected_price is null and rev>0) or (p_expected_price is not null and p_expected_price is distinct from current_price) then raise exception 'Η τιμή ενημερώθηκε. Ανανέωσε το κατάστημα πριν αγοράσεις.';end if;
 end if;
 return public.predictions_shop_action(p_actor,p_operation,p_code,p_recipient,p_request);
end $checked$;
revoke all on function public.predictions_shop_checked(uuid,text,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.predictions_shop_checked(uuid,text,text,uuid,uuid,integer) to service_role;
