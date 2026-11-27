-- Applied to production 2026-11-27: next workday round generation at 10:00,
-- ticket opening at 12:00 independent of prior round settlement.
-- Preserve 17:30 settlement, 17:31 round push, existing odds and ticket limits.
-- Snapshot of the four deployed functions; do not overwrite newer revisions blindly.
BEGIN;
SELECT pg_advisory_xact_lock(542602,1);
CREATE OR REPLACE FUNCTION public.predictions_game_state(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare l timestamp:=now() at time zone 'Europe/Athens'; d date:=l::date; data jsonb;
begin
 if not exists(select 1 from public.predictions_accounts where id=p_actor and status='approved') then raise exception 'Απαιτείται εγκεκριμένος λογαριασμός.';end if;
 select jsonb_build_object('now',to_char(l,'YYYY-MM-DD HH24:MI'),'open_date',d,'target_date',public.predictions_next_day(d),'reserve',public.predictions_reserve(d),'sync_ok',coalesce(staff_synced_at>=now()-interval '5 minutes',false),'market_v2',market_v2,'season',work_season,'phase',case when not economy_enabled or not public.predictions_workday(d) then 'closed' when exists(select 1 from public.predictions_rounds rr where rr.open_date=d and l::time>=(time '12:00')) then 'open' when l::time>=time '09:00' and l::time<time '22:00' then 'vote' else 'locked' end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'source',e.source,'kind',e.kind,'season',e.season,'options',e.options,'worker_id',e.worker_id,'can_vote',r.target_date=d and e.settled_at is null and l::time>=public.predictions_vote_start(e.kind) and l::time<public.predictions_vote_end(e.kind),'can_bet',e.open_date=d and e.settled_at is null and l::time>=(time '12:00'),'open_date',e.open_date,'date',r.target_date,'odds_yes',e.odds_yes,'odds_no',e.odds_no,'result',e.result,'settled',e.settled_at is not null,'already_bet',exists(select 1 from public.predictions_picks p where p.account_id=p_actor and p.event_id=e.id),'voted',exists(select 1 from public.predictions_votes v where v.account_id=p_actor and v.event_id=e.id)) order by e.open_date desc,case e.kind when 'potatoes' then 1 when 'statements' then 2 when 'customers' then 3 when 'attendance' then 4 else 5 end,e.name) from public.predictions_events e join public.predictions_rounds r using(open_date) where e.open_date=d or r.target_date>=d and e.open_date<=d),'[]'::jsonb),
 'workers',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.predictions_staff s where public.predictions_eligible(s.id,public.predictions_next_day(d)) and not exists(select 1 from public.predictions_events e where e.open_date=d and e.worker_id=s.id)),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select q.id,q.stake,q.paid,q.created_at,q.settled_at,(select jsonb_agg(jsonb_build_object('name',e.name,'side',p.side,'label',coalesce((select x->>'label' from jsonb_array_elements(e.options)x where x->>'key'=p.side),p.side),'odds',p.odds,'result',e.result,'settled',e.settled_at is not null)) from public.predictions_picks p join public.predictions_events e on e.id=p.event_id where p.ticket_id=q.id) as picks from public.predictions_tickets q where q.account_id=p_actor order by created_at desc limit 100)t),'[]'::jsonb),
 'stats',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'net',coalesce(q.net,0)+coalesce(i.net,0)+coalesce(z.net,0),'weekly_net',coalesce(q.w,0)+coalesce(i.w,0)+coalesce(z.w,0),'monthly_net',coalesce(q.m,0)+coalesce(i.m,0)+coalesce(z.m,0),'interest_net',coalesce(i.net,0),'resignation_net',coalesce(z.net,0),'resignation_bonus',coalesce(z.bonus,0),'wins',coalesce(q.wins,0),'losses',coalesce(q.losses,0),'returned',coalesce(q.returned,0),'staked',coalesce(q.staked,0)) order by coalesce(q.net,0)+coalesce(i.net,0)+coalesce(z.net,0) desc,a.nickname) from public.predictions_accounts a left join lateral(select sum(paid-stake) net,sum(paid-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('week',l)::date) w,sum(paid-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('month',l)::date) m,count(*) filter(where paid>stake) wins,count(*) filter(where paid<stake) losses,sum(paid) returned,sum(stake) staked from public.predictions_tickets t where t.account_id=a.id and settled_at is not null)q on true left join lateral(select sum(amount) net,sum(amount) filter(where (created_at at time zone 'Europe/Athens')::date>=date_trunc('week',now() at time zone 'Europe/Athens')::date) w,sum(amount) filter(where (created_at at time zone 'Europe/Athens')::date>=date_trunc('month',now() at time zone 'Europe/Athens')::date) m from public.predictions_ledger l where l.account_id=a.id and l.reason in ('interest_in','interest_out')) i on true left join lateral(select sum(paid+bonus-stake) net,sum(paid+bonus-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('week',l)::date) w,sum(paid+bonus-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('month',l)::date) m,sum(bonus) bonus from public.predictions_departure_picks p where p.account_id=a.id and p.settled_at is not null) z on true where a.status='approved'),'[]'::jsonb)
 ) into data from public.predictions_settings where singleton;
 return data;
end $function$;

CREATE OR REPLACE FUNCTION public.predictions_generate_market(p_day date, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare dest date:=public.predictions_next_day(p_day);seas text;w record;k record;opts jsonb;
begin
 perform pg_advisory_xact_lock(542602,1);
 if not public.predictions_workday(p_day) or (p_at at time zone 'Europe/Athens')::date<>p_day or (p_at at time zone 'Europe/Athens')::time<time '10:00' then return;end if;


 if exists(select 1 from public.predictions_rounds where open_date=p_day or target_date=dest) then return;end if;
 select work_season into strict seas from public.predictions_settings where singleton;
 insert into public.predictions_rounds(open_date,target_date,schedule_version) values(p_day,dest,2);
 for k in select * from (values ('potatoes','🥔 Νωπές πατάτες στην ώρα τους'),('statements','📋 Τελευταία κατάσταση'),('customers','🛒 Πελάτες στο διάλειμμα'),('departure_time','🏠 Ώρα αποχώρησης'),('supervisor_shout','📢 Θα φωνάξει σήμερα κάποιος προϊστάμενος;'))x(kind,name) loop
  opts:=public.predictions_market_odds(k.kind,null,seas,dest,p_at);
  insert into public.predictions_events(open_date,worker_id,name,source,odds_yes,odds_no,kind,season,options) values(p_day,null,k.name,'system',1.90,1.90,k.kind,seas,opts);
 end loop;
 for w in select s.id,s.name from public.predictions_staff s where public.predictions_eligible(s.id,dest) order by (select count(*) from public.predictions_events e where e.worker_id=s.id and e.open_date>=p_day-14 and e.open_date<p_day),random() limit 1 loop
  opts:=public.predictions_market_odds('attendance',w.id,seas,dest,p_at);
  insert into public.predictions_events(open_date,worker_id,name,source,odds_yes,odds_no,kind,season,options) values(p_day,w.id,w.name,'system',least(5,greatest(1.10,public.predictions_option_odds(opts,'yes'))),least(5,greatest(1.10,public.predictions_option_odds(opts,'no'))),'attendance',seas,opts);
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.predictions_place(p_actor uuid, p_ids uuid[], p_sides text[], p_stake integer, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l timestamp:=p_at at time zone 'Europe/Athens';d date:=l::date;n int:=coalesce(cardinality(p_ids),0);bal bigint;tid uuid;
begin
 perform pg_advisory_xact_lock(542602,1);
 perform public.predictions_guard(p_actor,p_at);
 perform public.predictions_weekly(p_at);
 if not public.predictions_workday(d) or not exists(select 1 from public.predictions_rounds r where r.open_date=d and l::time>=(time '12:00')) then raise exception 'Τα στοιχήματα είναι κλειστά.';end if;
 if p_stake is null or p_stake not between 10 and 1000 or n not between 1 and 6 or n<>coalesce(cardinality(p_sides),0) or (select count(distinct x) from unnest(p_ids)x)<>n or exists(select 1 from unnest(p_sides)x where x is null) then raise exception 'Άκυρο δελτίο.';end if;
 select chips into strict bal from public.predictions_accounts where id=p_actor and status='approved' for update;
 if bal-p_stake<public.predictions_reserve(d) then raise exception 'Δεν επαρκούν οι διαθέσιμες μάρκες.';end if;
 if (select count(*) from public.predictions_events e join public.predictions_rounds r using(open_date) where e.id=any(p_ids) and e.open_date=d and e.settled_at is null and (e.kind<>'attendance' or public.predictions_eligible(e.worker_id,r.target_date)))<>n then raise exception 'Κάποια επιλογή δεν είναι διαθέσιμη.';end if;
 if exists(select 1 from unnest(p_ids) with ordinality u(id,ord) join public.predictions_events e on e.id=u.id where public.predictions_option_odds(e.options,p_sides[u.ord::int]) is null) then raise exception 'Μη έγκυρη επιλογή.';end if;
 if exists(select 1 from public.predictions_picks where account_id=p_actor and event_id=any(p_ids)) then raise exception 'Έχεις ήδη ποντάρει σε αυτό το γεγονός.';end if;
 insert into public.predictions_tickets(account_id,open_date,stake,created_at) values(p_actor,d,p_stake,p_at) returning id into tid;
 insert into public.predictions_picks(ticket_id,account_id,event_id,side,odds) select tid,p_actor,u.id,p_sides[u.ord::int],public.predictions_option_odds(e.options,p_sides[u.ord::int]) from unnest(p_ids) with ordinality u(id,ord) join public.predictions_events e on e.id=u.id;
 update public.predictions_accounts set chips=chips-p_stake where id=p_actor;
 insert into public.predictions_ledger(account_id,amount,reason,reference) values(p_actor,-p_stake,'stake',tid::text);
 return tid;
end $function$;

CREATE OR REPLACE FUNCTION public.predictions_tick(p_staff jsonb, p_leaves jsonb, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare local_at timestamp:=p_at at time zone 'Europe/Athens'; d date:=local_at::date; dest date; w record; e record; t record; paidval bigint; weekval date:=date_trunc('week',local_at)::date; enabled bool; newround bool;
begin
 perform pg_advisory_xact_lock(542602,1);
 if jsonb_typeof(p_staff) is distinct from 'array' or jsonb_typeof(p_leaves) is distinct from 'array' or jsonb_array_length(p_staff)=0 or jsonb_array_length(p_staff)>999 or jsonb_array_length(p_leaves)>=1000 then raise exception 'Μη πλήρης συγχρονισμός.';end if;
 update public.predictions_staff set active=false;
 insert into public.predictions_staff(id,name,active,synced_at) select id,name,active,p_at from jsonb_to_recordset(p_staff) as x(id uuid,name text,active bool) on conflict(id) do update set name=excluded.name,active=excluded.active,synced_at=excluded.synced_at;
 delete from public.predictions_leave_ranges;
 insert into public.predictions_leave_ranges(staff_id,start_date,end_date) select distinct x.staff_id,x.start_date,x.end_date from jsonb_to_recordset(p_leaves) x(staff_id uuid,start_date date,end_date date) join public.predictions_staff s on s.id=x.staff_id;
 update public.predictions_settings set staff_synced_at=p_at where singleton returning economy_enabled into enabled;
 if not enabled then return jsonb_build_object('enabled',false);end if;
 -- Weekly credit independent of attendance; no backfill or duplicate credit.
 perform public.predictions_weekly(p_at);
 perform public.predictions_finish_ready(p_at);
 if (select market_v2 from public.predictions_settings where singleton) then
  if public.predictions_workday(d) and local_at::time>=time '10:00' then perform public.predictions_generate_market(d,p_at);end if;
 elsif public.predictions_workday(d) and local_at::time>=time '12:00' then
  dest:=public.predictions_next_day(d);
  insert into public.predictions_rounds(open_date,target_date) values(d,dest) on conflict do nothing;
  -- Fill up to five only, prioritising workers not selected recently.
  if exists(select 1 from public.predictions_rounds where open_date=d) then
   for w in select s.id from public.predictions_staff s where public.predictions_eligible(s.id,dest) and not exists(select 1 from public.predictions_events ev where ev.open_date=d and ev.worker_id=s.id) order by (select count(*) from public.predictions_events ev where ev.worker_id=s.id and ev.open_date>=d-14 and ev.open_date<d),random() limit greatest(0,5-(select count(*)::int from public.predictions_events where open_date=d and settled_at is null)) loop
    if (select count(*) from public.predictions_events where open_date=d)>=7 then exit;end if;
    perform public.predictions_insert_event(d,w.id,'system');
   end loop;
  end if;
 end if;
 return jsonb_build_object('enabled',true,'date',d);
end $function$;
COMMIT;
