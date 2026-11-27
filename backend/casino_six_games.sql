-- Shared wallet, atomic transaction and request receipts retained.
alter table public.predictions_casino_days add column extra_count integer not null default 0 check (extra_count between 0 and 20);
alter table public.predictions_casino_rounds drop constraint predictions_casino_rounds_kind_check, add constraint predictions_casino_rounds_kind_check check (kind in ('blackjack','slots','roulette','dice','coin','scratch','hilo','wheel'));
create function public.predictions_casino_uniform(p_n integer) returns integer language plpgsql volatile set search_path to '' as $$
declare v integer;
begin
 if p_n is null or p_n<1 or p_n>256 then raise exception 'Invalid range';end if;
 loop v:=get_byte(extensions.gen_random_bytes(1),0);exit when v < (256/p_n)*p_n;end loop;
 return v%p_n;
end $$;
revoke all on function public.predictions_casino_uniform(integer) from public,anon,authenticated;
grant execute on function public.predictions_casino_uniform(integer) to service_role;
CREATE OR REPLACE FUNCTION public.predictions_casino_state(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d date:=(now() at time zone 'Europe/Athens')::date; u public.predictions_casino_days%rowtype; r public.predictions_casino_rounds%rowtype; rd jsonb; hist jsonb; draws jsonb; balance bigint;
begin
 if not exists(select 1 from public.predictions_accounts where id=p_actor and status='approved') then raise exception 'Δεν επιτρέπεται.';end if;
 select * into u from public.predictions_casino_days where account_id=p_actor and day=d;
 select * into r from public.predictions_casino_rounds where account_id=p_actor order by (status='open') desc,created_at desc limit 1;
 if found then rd:=jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'version',r.version,'day',r.day,'stake',r.stake,'paid',r.paid,'hands',r.hands,'active_hand',r.active_hand,'dealer',case when r.status='open' then to_jsonb(r.dealer[1:1]) else to_jsonb(r.dealer) end,'reels',r.reels);end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into hist from (select id,kind,stake,paid,status,created_at from public.predictions_casino_rounds where account_id=p_actor and status='settled' order by created_at desc limit 20)t;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.day desc),'[]') into draws from (select day,winner_name,amount,eligible_count from public.predictions_daily_draws order by day desc limit 30)t;
 balance:=public.predictions_long_spendable(p_actor,d);
 return jsonb_build_object('day',d,'available',balance,'wagered',coalesce(u.wagered,0),'blackjack_count',coalesce(u.blackjack_count,0),'slot_count',coalesce(u.slot_count,0),'extra_count',coalesce(u.extra_count,0),'round',rd,'history',hist,'draws',draws,'enabled',coalesce((select economy_enabled from public.predictions_settings where singleton),false));
end $function$
;
CREATE OR REPLACE FUNCTION public.predictions_casino_action(p_actor uuid, p_operation text, p_request uuid, p_stake integer DEFAULT NULL::integer, p_round uuid DEFAULT NULL::uuid, p_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare atime timestamptz:=clock_timestamp(); d date:=(atime at time zone 'Europe/Athens')::date; u public.predictions_casino_days%rowtype; r public.predictions_casino_rounds%rowtype; receipt public.predictions_casino_requests%rowtype;
 h jsonb; cards int[]; other int[]; idx int; wager int:=0; total int; dealer_total int; payout int:=0; initial boolean:=false; finish boolean:=false; sym int[]; natural boolean; split_aces boolean; n int; old_bet int; extra_game text; outcome int; choice int; multiplier int; vals int[];
begin
 perform pg_advisory_xact_lock(542602,1);
 if p_request is null or p_operation is null or p_operation not in ('slots','start','hit','stand','double','split','roulette_red','roulette_black','dice_low','dice_high','coin_heads','coin_tails','scratch','hilo_low','hilo_high','wheel') then raise exception 'Άκυρο αίτημα.';end if;
 if not exists(select 1 from public.predictions_accounts where id=p_actor and status='approved') then raise exception 'Δεν επιτρέπεται.';end if;
 select * into receipt from public.predictions_casino_requests where account_id=p_actor and request_id=p_request;
 if found then
  if receipt.operation is distinct from p_operation or receipt.stake is distinct from p_stake or receipt.round_id is distinct from p_round or receipt.version is distinct from p_version then raise exception 'Το αίτημα έχει ήδη χρησιμοποιηθεί.';end if;
  return public.predictions_casino_state(p_actor);
 end if;
 if not exists(select 1 from public.predictions_settings where singleton and economy_enabled) then raise exception 'Η οικονομία είναι κλειστή.';end if;
 perform public.predictions_weekly(atime);
 perform 1 from public.predictions_accounts where id=p_actor and status='approved' for update;
 if not found then raise exception 'Δεν επιτρέπεται.';end if;
 insert into public.predictions_casino_days(account_id,day) values(p_actor,d) on conflict do nothing;
 select * into u from public.predictions_casino_days where account_id=p_actor and day=d for update;
 extra_game:=case when p_operation in ('roulette_red','roulette_black','dice_low','dice_high','coin_heads','coin_tails','scratch','hilo_low','hilo_high','wheel') then split_part(p_operation,'_',1) else null end;
 if p_operation in ('slots','start') or extra_game is not null then
  if p_round is not null or p_version is not null or p_stake is null or p_stake<10 or p_stake>100 then raise exception 'Ποντάρισμα 10–100 μαρκών.';end if;
  if exists(select 1 from public.predictions_casino_rounds where account_id=p_actor and status='open') then raise exception 'Ολοκλήρωσε πρώτα την παρτίδα Blackjack.';end if;
  if (p_operation='slots' and u.slot_count>=20) or (p_operation='start' and u.blackjack_count>=10) or (extra_game is not null and u.extra_count>=20) then raise exception 'Το ημερήσιο όριο παιχνιδιών εξαντλήθηκε.';end if;
  wager:=p_stake;
  if u.wagered+wager>500 or public.predictions_long_spendable(p_actor,d)<wager then raise exception 'Υπέρβαση ορίου ή ανεπαρκείς ελεύθερες μάρκες.';end if;
  if p_operation='slots' then
   select array_agg(1+get_byte(extensions.gen_random_bytes(1),0)%8 order by x) into sym from generate_series(1,3)x;
   -- Each reel has eight equally likely symbols. 8 divides 256 exactly.
   payout:=case when sym[1]=sym[2] and sym[2]=sym[3] then case when sym[1]=8 then 16*wager else 8*wager end when sym[1]=sym[2] or sym[1]=sym[3] or sym[2]=sym[3] then 2*wager else 0 end;
   insert into public.predictions_casino_rounds(account_id,day,kind,stake,paid,status,reels,settled_at) values(p_actor,d,'slots',wager,payout,'settled',sym,atime) returning * into r;
   update public.predictions_casino_days set slot_count=slot_count+1 where account_id=p_actor and day=d;
  elsif extra_game is not null then
   choice:=case when p_operation in ('roulette_red','dice_low','coin_heads','hilo_low') then 1 when p_operation in ('roulette_black','dice_high','coin_tails','hilo_high') then 2 else 0 end;
   if extra_game='roulette' then
    outcome:=public.predictions_casino_uniform(37);
    multiplier:=case when outcome=0 then 0 when (outcome=any(array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]))=(choice=1) then 2 else 0 end;
    sym:=array[outcome,choice];
   elsif extra_game='dice' then
    vals:=array[1+public.predictions_casino_uniform(6),1+public.predictions_casino_uniform(6)];outcome:=vals[1]+vals[2];
    multiplier:=case when outcome=7 then 1 when (outcome<7)=(choice=1) then 2 else 0 end;
    sym:=array[vals[1],vals[2],choice];
   elsif extra_game='coin' then
    outcome:=1+public.predictions_casino_uniform(2);multiplier:=case when outcome=choice then 2 else 0 end;sym:=array[outcome,choice];
   elsif extra_game='scratch' then
    sym:=array[1+public.predictions_casino_uniform(4),1+public.predictions_casino_uniform(4),1+public.predictions_casino_uniform(4)];
    multiplier:=case when sym[1]=sym[2] and sym[2]=sym[3] then 6 when sym[1]=sym[2] or sym[1]=sym[3] or sym[2]=sym[3] then 1 else 0 end;
   elsif extra_game='hilo' then
    outcome:=1+public.predictions_casino_uniform(52);n:=(outcome-1)%13+1;
    multiplier:=case when n=7 then 1 when (n<7)=(choice=1) then 2 else 0 end;sym:=array[outcome,choice];
   elsif extra_game='wheel' then
    outcome:=1+public.predictions_casino_uniform(8);multiplier:=(array[0,0,0,1,1,1,2,3])[outcome];sym:=array[outcome,multiplier];
   end if;
   payout:=multiplier*wager;
   insert into public.predictions_casino_rounds(account_id,day,kind,stake,paid,status,reels,settled_at) values(p_actor,d,extra_game,wager,payout,'settled',sym,atime) returning * into r;
   update public.predictions_casino_days set extra_count=extra_count+1 where account_id=p_actor and day=d;
  else
   select array_agg(x order by gen_random_uuid()) into cards from generate_series(1,52)x;
   insert into public.predictions_casino_rounds(account_id,day,kind,stake,status,deck,dealer,hands) values(p_actor,d,'blackjack',wager,'open',cards[5:52],array[cards[2],cards[4]],jsonb_build_array(jsonb_build_object('cards',array[cards[1],cards[3]],'bet',wager,'done',false))) returning * into r;
   update public.predictions_casino_days set blackjack_count=blackjack_count+1 where account_id=p_actor and day=d;
   initial:=true;
   total:=public.predictions_casino_score(array[cards[1],cards[3]]);
   dealer_total:=public.predictions_casino_score(r.dealer);
   if total=21 or dealer_total=21 then
    payout:=case when total=21 and dealer_total=21 then wager when total=21 then (5*wager)/2 else 0 end;
    r.hands:=jsonb_set(r.hands,'{0,done}','true');finish:=true;
   end if;
  end if;
 else
  if p_stake is not null or p_round is null or p_version is null then raise exception 'Άκυρη κίνηση.';end if;
  select * into r from public.predictions_casino_rounds where id=p_round and account_id=p_actor and kind='blackjack' and status='open' for update;
  if not found or r.version<>p_version then raise exception 'Η παρτίδα έχει αλλάξει. Κάνε ανανέωση.';end if;
  idx:=r.active_hand; h:=r.hands->idx; cards:=public.predictions_casino_cards(h);old_bet:=(h->>'bet')::int;
  if (h->>'done')::boolean then raise exception 'Η κίνηση δεν επιτρέπεται.';end if;
  if p_operation in ('double','split') then
   if r.day<>d or cardinality(cards)<>2 then raise exception 'Δεν επιτρέπεται πρόσθετο ποντάρισμα.';end if;
   if p_operation='split' and (jsonb_array_length(r.hands)<>1 or (cards[1]-1)%13<>(cards[2]-1)%13) then raise exception 'Το Split απαιτεί δύο φύλλα ίδιας αξίας, μία φορά ανά παρτίδα.';end if;
   wager:=old_bet;
   if u.wagered+wager>500 or public.predictions_long_spendable(p_actor,d)<wager then raise exception 'Υπέρβαση ορίου ή ανεπαρκείς ελεύθερες μάρκες.';end if;
   r.stake:=r.stake+wager;
  end if;
  if p_operation='split' then
   split_aces:=(cards[1]-1)%13=0;
   other:=array[cards[2],r.deck[2]];cards:=array[cards[1],r.deck[1]];r.deck:=r.deck[3:cardinality(r.deck)];
   r.hands:=jsonb_build_array(jsonb_build_object('cards',cards,'bet',old_bet,'done',split_aces or public.predictions_casino_score(cards)>=21),jsonb_build_object('cards',other,'bet',old_bet,'done',split_aces or public.predictions_casino_score(other)>=21));
  else
   if p_operation in ('hit','double') then cards:=array_append(cards,r.deck[1]);r.deck:=r.deck[2:cardinality(r.deck)];end if;
   h:=jsonb_build_object('cards',cards,'bet',old_bet+wager,'done',p_operation in ('stand','double') or public.predictions_casino_score(cards)>=21);
   r.hands:=jsonb_set(r.hands,array[idx::text],h);
  end if;
  idx:=0;while idx<jsonb_array_length(r.hands) and (r.hands->idx->>'done')::boolean loop idx:=idx+1;end loop;
  r.active_hand:=least(idx,jsonb_array_length(r.hands)-1);
  if idx=jsonb_array_length(r.hands) then
   finish:=true;
   while public.predictions_casino_score(r.dealer)<17 loop r.dealer:=array_append(r.dealer,r.deck[1]);r.deck:=r.deck[2:cardinality(r.deck)];end loop;
   dealer_total:=public.predictions_casino_score(r.dealer);
   for h in select value from jsonb_array_elements(r.hands) loop
    total:=public.predictions_casino_score(public.predictions_casino_cards(h));old_bet:=(h->>'bet')::int;
    payout:=payout+case when total>21 then 0 when dealer_total>21 or total>dealer_total then 2*old_bet when total=dealer_total then old_bet else 0 end;
   end loop;
  end if;
  r.version:=r.version+1;
 end if;
 if wager>0 then
  update public.predictions_casino_days set wagered=wagered+wager where account_id=p_actor and day=d;
  update public.predictions_accounts set chips=chips-wager where id=p_actor;
  insert into public.predictions_ledger(account_id,amount,reason,reference) values(p_actor,-wager,'casino_stake',p_request::text);
 end if;
 if finish then r.status:='settled';r.paid:=payout;r.settled_at:=atime;end if;
 if r.kind='blackjack' then
  update public.predictions_casino_rounds set stake=r.stake,paid=r.paid,status=r.status,version=r.version,deck=r.deck,dealer=r.dealer,hands=r.hands,active_hand=r.active_hand,settled_at=r.settled_at where id=r.id;
 end if;
 if r.status='settled' and r.paid>0 then
  update public.predictions_accounts set chips=chips+r.paid where id=p_actor;
  insert into public.predictions_ledger(account_id,amount,reason,reference) values(p_actor,r.paid,'casino_payout',r.id::text);
 end if;
 insert into public.predictions_casino_requests(account_id,request_id,operation,stake,round_id,version,result_id) values(p_actor,p_request,p_operation,p_stake,p_round,p_version,r.id);
 return public.predictions_casino_state(p_actor);
end $function$
;

-- Rollback-only smoke test (run separately, never as a persistent migration):
/*
begin;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d date:=(now() at time zone 'Europe/Athens')::date; req uuid; result jsonb; op text; i int; before_chips bigint; after_chips bigint; failed boolean; 
begin
 insert into public.predictions_accounts(id,nickname,pin_salt,pin_hash,status,chips,approved_at,last_weekly_credit) values(a,'QA casino '||left(a::text,8),repeat('0',32),repeat('0',64),'approved',10000,now(),date_trunc('week',d::timestamp)::date),(b,'QA pending '||left(b::text,8),repeat('0',32),repeat('0',64),'pending',10000,null,date_trunc('week',d::timestamp)::date);
 foreach op in array array['roulette_red','roulette_black','dice_low','dice_high','coin_heads','coin_tails','scratch','hilo_low','hilo_high','wheel'] loop
  req:=gen_random_uuid();select chips into before_chips from public.predictions_accounts where id=a;
  result:=public.predictions_casino_action(a,op,req,10);
  if result->'round'->>'kind'<>split_part(op,'_',1) or result->'round'->>'status'<>'settled' then raise exception 'Wrong round %',op;end if;
  select chips into after_chips from public.predictions_accounts where id=a;
  if after_chips<>before_chips-10+(result->'round'->>'paid')::int then raise exception 'Ledger balance %',op;end if;
  perform public.predictions_casino_action(a,op,req,10);
  if (select chips from public.predictions_accounts where id=a)<>after_chips then raise exception 'Replay %',op;end if;
  failed:=false;begin perform public.predictions_casino_action(a,op,req,20);exception when others then failed:=true;end;if not failed then raise exception 'Changed replay accepted';end if;
 end loop;
 if (select extra_count from public.predictions_casino_days where account_id=a and day=d)<>10 then raise exception 'Extra count';end if;
 for i in 1..10 loop perform public.predictions_casino_action(a,'coin_heads',gen_random_uuid(),10);end loop;
 failed:=false;begin perform public.predictions_casino_action(a,'wheel',gen_random_uuid(),10);exception when others then failed:=true;end;if not failed then raise exception 'Count limit failed';end if;
 for i in 1..3 loop perform public.predictions_casino_action(a,'slots',gen_random_uuid(),100);end loop;
 failed:=false;begin perform public.predictions_casino_action(a,'slots',gen_random_uuid(),10);exception when others then failed:=true;end;if not failed then raise exception 'Shared limit failed';end if;
 if (select wagered from public.predictions_casino_days where account_id=a and day=d)<>500 then raise exception 'Wager count';end if;
 failed:=false;begin perform public.predictions_casino_action(b,'wheel',gen_random_uuid(),10);exception when others then failed:=true;end;if not failed then raise exception 'Pending accepted';end if;
 if has_function_privilege('anon','public.predictions_casino_uniform(integer)','execute') or has_function_privilege('authenticated','public.predictions_casino_action(uuid,text,uuid,integer,uuid,integer)','execute') then raise exception 'Permissions';end if;
end $test$;
rollback;
*/
