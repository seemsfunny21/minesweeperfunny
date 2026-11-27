CREATE OR REPLACE FUNCTION public.predictions_bot_tick()
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare atime timestamptz:=clock_timestamp(); local_at timestamp:=atime at time zone 'Europe/Athens'; d date:=local_at::date; a uuid; e record; op text; result jsonb; rr jsonb; req uuid; item record; n int; remaining bigint; demo_ops text[]:=array['start','slots','roulette_red','dice_low','coin_heads','scratch','hilo_low','wheel'];
begin
 if local_at::time<time '18:05' then return false; end if;
 perform pg_advisory_xact_lock(542602,1);
 select id into a from public.predictions_accounts where is_bot and status='approved';
 if a is null or not exists(select 1 from public.predictions_settings where singleton and economy_enabled) or exists(select 1 from public.predictions_bot_days where account_id=a and day=d) then return false; end if;
 -- On workdays wait for the real market and fresh staff sync; never place after closing.
 if public.predictions_workday(d) and not exists(select 1 from public.predictions_rounds r cross join public.predictions_settings s where r.open_date=d and s.singleton and s.staff_synced_at>=atime-interval '5 minutes' and s.staff_synced_at<=atime+interval '5 seconds') then return false;end if;
 perform public.predictions_weekly(atime);
 insert into public.predictions_bot_days(account_id,day) values(a,d);
 if public.predictions_workday(d) then
  -- Pick only from public current odds, which are derived from past settled events. No outcome access.
  for e in select ev.id, opt.k from public.predictions_events ev join public.predictions_rounds r using(open_date)
   cross join lateral (select x->>'key' as k,(x->>'odds')::numeric as odds from jsonb_array_elements(ev.options)x where (x->>'odds')::numeric>=1.01 order by (x->>'odds')::numeric,x->>'key' limit 1)opt
   where ev.open_date=d and ev.settled_at is null and local_at::time>=case when r.schedule_version=2 then time '17:30' else time '12:00' end and (ev.kind<>'attendance' or public.predictions_eligible(ev.worker_id,r.target_date)) and not exists(select 1 from public.predictions_picks p where p.account_id=a and p.event_id=ev.id)
   order by opt.odds,ev.id limit 3 loop
   if public.predictions_long_spendable(a,d)<20 then exit;end if;
   perform public.predictions_place(a,array[e.id],array[e.k],20,atime);
  end loop;
 end if;
 -- Rotate one fixed 10-chip demonstration per day; preserve capital for collection goals.
 foreach op in array array[demo_ops[1+((d-date '2026-01-01')%8+8)%8]] loop
  if public.predictions_long_spendable(a,d)<10 then exit;end if;
  result:=public.predictions_casino_state(a);rr:=result->'round';
  if rr->>'status'='open' then
   -- Finish prior open Blackjack without adding stake, using only own visible cards.
   for n in 1..16 loop
    exit when rr->>'status'<>'open';
    result:=public.predictions_casino_action(a,case when public.predictions_casino_score(public.predictions_casino_cards((rr->'hands')->((rr->>'active_hand')::int)))<17 then 'hit' else 'stand' end,gen_random_uuid(),null,(rr->>'id')::uuid,(rr->>'version')::int);
    rr:=result->'round';
   end loop;
  end if;
  if rr->>'status'='open' then exit;end if;
  if (result->>'wagered')::int+10>500 or (op='start' and (result->>'blackjack_count')::int>=10) or (op='slots' and (result->>'slot_count')::int>=20) or (op not in ('start','slots') and (result->>'extra_count')::int>=20) then continue;end if;
  result:=public.predictions_casino_action(a,op,gen_random_uuid(),10);rr:=result->'round';
  if op='start' then
   for n in 1..16 loop
    exit when rr->>'status'<>'open';
    result:=public.predictions_casino_action(a,case when public.predictions_casino_score(public.predictions_casino_cards((rr->'hands')->((rr->>'active_hand')::int)))<17 then 'hit' else 'stand' end,gen_random_uuid(),null,(rr->>'id')::uuid,(rr->>'version')::int);
    rr:=result->'round';
   end loop;
  end if;
 end loop;
 -- Only purchase from existing catalogue; never gifts, loans, or free items.
 remaining:=public.predictions_long_spendable(a,d);
 -- Collect the top-priced item in each lasting category, with a savings reserve.
 select s.code,s.category into item
 from public.predictions_shop_items s
 where s.active and s.category not in ('gift','donation','seasonal') and s.price>0
 and s.price=(select max(t.price) from public.predictions_shop_items t where t.active and t.category=s.category)
 and not exists(select 1 from public.predictions_collectibles c where c.account_id=a and c.item_code=s.code)
 and s.price<=remaining-greatest(1000,ceil(remaining*0.20)::bigint)
 order by s.price desc,s.sort_order,s.code limit 1;
 if found then
  perform public.predictions_shop_action(a,'buy',item.code,null,gen_random_uuid(),atime);
  if item.category in ('color','background','title','effect','frame','trophy') then perform public.predictions_shop_action(a,'equip_'||item.category,item.code,null,null,atime);end if;
 end if;
 return true;
end $function$

-- Applied to production; keeps actual balance, outcome rules, and account data unchanged.
