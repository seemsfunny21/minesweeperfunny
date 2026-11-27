alter table public.predictions_accounts add column is_bot boolean not null default false;
alter table public.predictions_accounts add constraint predictions_bot_not_admin check (not (is_bot and is_admin));
create unique index predictions_one_bot on public.predictions_accounts(is_bot) where is_bot;
CREATE OR REPLACE FUNCTION public.predictions_lookup(p_name text)
 RETURNS TABLE(id uuid, pin_salt text, pin_hash text, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select a.id,a.pin_salt,a.pin_hash,a.status from public.predictions_accounts a where not a.is_bot and a.name_key=lower(btrim(p_name))
$function$
;
CREATE OR REPLACE FUNCTION public.predictions_majority(p_event uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH valid AS (
 SELECT v.side FROM public.predictions_votes v
 JOIN public.predictions_accounts a ON a.id=v.account_id
 JOIN public.predictions_events e ON e.id=v.event_id
 WHERE v.event_id=p_event AND a.status='approved' and not a.is_bot
 AND public.predictions_option_odds(e.options,v.side) IS NOT NULL
), counts AS (SELECT side,count(*) n FROM valid GROUP BY side)
SELECT side FROM counts WHERE n*2>(SELECT count(*) FROM valid)
ORDER BY n DESC LIMIT 1
$function$
;
CREATE OR REPLACE FUNCTION public.predictions_vote(p_actor uuid, p_event uuid, p_side text, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l timestamp:=p_at at time zone 'Europe/Athens';
begin
 perform pg_advisory_xact_lock(542602,1);
 if exists(select 1 from public.predictions_accounts where id=p_actor and is_bot) then raise exception 'Το BOT δεν ψηφίζει.';end if;
 perform public.predictions_guard(p_actor,p_at);
 if p_side is null or not public.predictions_workday(l::date) or not exists(select 1 from public.predictions_events e join public.predictions_rounds r using(open_date) where e.id=p_event and r.target_date=l::date and e.settled_at is null and l::time>=public.predictions_vote_start(e.kind) and l::time<public.predictions_vote_end(e.kind) and public.predictions_option_odds(e.options,p_side) is not null and (e.kind<>'attendance' or public.predictions_eligible(e.worker_id,r.target_date))) then raise exception 'Η επιβεβαίωση είναι κλειστή.';end if;
 if exists(select 1 from public.predictions_votes where event_id=p_event and account_id=p_actor) then raise exception 'Έχεις ήδη ψηφίσει.';end if;
 insert into public.predictions_votes(event_id,account_id,side) values(p_event,p_actor,p_side);
 perform public.predictions_finish_ready(p_at);
 if (select market_v2 from public.predictions_settings where singleton) then perform public.predictions_generate_market(l::date,p_at);end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.predictions_run_daily_draw(p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare local_at timestamp:=p_at at time zone 'Europe/Athens'; d date:=local_at::date; winner_id uuid; nick text; n int;
begin
 if local_at::time<time '12:00' then return false;end if;
 perform pg_advisory_xact_lock(542602,1);
 if exists(select 1 from public.predictions_daily_draws where day=d) or not exists(select 1 from public.predictions_settings where singleton and economy_enabled) then return false;end if;
 select count(*) into n from public.predictions_accounts where status='approved' and not is_bot;if n=0 then return false;end if;
 select id,nickname into winner_id,nick from public.predictions_accounts where status='approved' and not is_bot order by gen_random_uuid() limit 1 for update;
 if not found then return false;end if;
 insert into public.predictions_daily_draws(day,winner,winner_name,eligible_count,created_at) values(d,winner_id,nick,n,p_at);
 update public.predictions_accounts set chips=chips+500 where id=winner_id;
 insert into public.predictions_ledger(account_id,amount,reason,reference,created_at) values(winner_id,500,'daily_draw',d::text,p_at);
 return true;
end $function$
;

create table public.predictions_bot_days (account_id uuid not null references public.predictions_accounts(id), day date not null, created_at timestamptz not null default clock_timestamp(), primary key(account_id,day));
alter table public.predictions_bot_days enable row level security;
revoke all on public.predictions_bot_days from public,anon,authenticated;
grant select,insert on public.predictions_bot_days to service_role;
create function public.predictions_bot_tick() returns boolean language plpgsql set search_path to '' as $bot$
declare atime timestamptz:=clock_timestamp(); local_at timestamp:=atime at time zone 'Europe/Athens'; d date:=local_at::date; a uuid; e record; op text; result jsonb; rr jsonb; req uuid; item record; n int; remaining bigint;
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
 -- Fixed 10-chip demonstrations, at most one round in each game per day, never chase losses.
 foreach op in array array['start','slots','roulette_red','dice_low','coin_heads','scratch','hilo_low','wheel'] loop
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
 select s.code,s.category into item from public.predictions_shop_items s where s.active and s.category<>'gift' and s.price>0 and s.price<=remaining/5 and not exists(select 1 from public.predictions_collectibles c where c.account_id=a and c.item_code=s.code) order by s.price desc,s.sort_order,s.code limit 1;
 if found then
  perform public.predictions_shop_action(a,'buy',item.code,null,gen_random_uuid(),atime);
  if item.category in ('color','background','title','effect','frame','trophy') then perform public.predictions_shop_action(a,'equip_'||item.category,item.code,null,null,atime);end if;
 end if;
 return true;
end $bot$;
revoke all on function public.predictions_bot_tick() from public,anon,authenticated;
grant execute on function public.predictions_bot_tick() to service_role;
do $init$ declare a uuid; begin
 insert into public.predictions_accounts(nickname,pin_salt,pin_hash,status,is_bot,chips,approved_at,last_weekly_credit) values('🤖 Κουβάς',encode(extensions.gen_random_bytes(16),'hex'),encode(extensions.gen_random_bytes(32),'hex'),'approved',true,1000,now(),date_trunc('week',now() at time zone 'Europe/Athens')::date) returning id into a;
 insert into public.predictions_ledger(account_id,amount,reason,reference) values(a,1000,'welcome','first');
end $init$;

-- Scheduled after verification: select cron.schedule('predictions-bot-daily','*/15 * * * *','select public.predictions_bot_tick()');
