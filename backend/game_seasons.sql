-- Lifetime history remains untouched. A new game season opens a new ranking period.
create table if not exists public.predictions_game_seasons(season_no integer primary key check(season_no>=1),started_at timestamptz not null,ended_at timestamptz,standings jsonb,check(ended_at is null or ended_at>started_at));
create unique index if not exists predictions_game_seasons_current on public.predictions_game_seasons((true)) where ended_at is null;
alter table public.predictions_game_seasons enable row level security;
revoke all on table public.predictions_game_seasons from public,anon,authenticated;
grant select,insert,update on table public.predictions_game_seasons to service_role;
insert into public.predictions_game_seasons(season_no,started_at) select 1,least(coalesce((select min(created_at) from public.predictions_accounts),now()),coalesce((select min(created_at) from public.predictions_tickets),now()),coalesce((select min(created_at) from public.predictions_ledger),now())) on conflict do nothing;
CREATE OR REPLACE FUNCTION public.predictions_game_state(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare l timestamp:=now() at time zone 'Europe/Athens'; d date:=l::date; data jsonb; game_season_no integer; game_season_start timestamptz;
begin
 if not exists(select 1 from public.predictions_accounts where id=p_actor and status='approved') then raise exception 'Απαιτείται εγκεκριμένος λογαριασμός.';end if;
 select season_no,started_at into strict game_season_no,game_season_start from public.predictions_game_seasons where ended_at is null;
 select jsonb_build_object('game_season',game_season_no,'game_season_start',game_season_start,'now',to_char(l,'YYYY-MM-DD HH24:MI'),'open_date',d,'target_date',public.predictions_next_day(d),'reserve',public.predictions_reserve(d),'sync_ok',coalesce(staff_synced_at>=now()-interval '5 minutes',false),'market_v2',market_v2,'season',work_season,'phase',case when not economy_enabled or not public.predictions_workday(d) then 'closed' when exists(select 1 from public.predictions_rounds rr where rr.open_date=d and l::time>=(time '12:00')) then 'open' when l::time>=time '09:00' and l::time<time '22:00' then 'vote' else 'locked' end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'source',e.source,'kind',e.kind,'season',e.season,'options',e.options,'worker_id',e.worker_id,'can_vote',r.target_date=d and e.settled_at is null and l::time>=public.predictions_vote_start(e.kind) and l::time<public.predictions_vote_end(e.kind),'can_bet',e.open_date=d and e.settled_at is null and l::time>=(time '12:00'),'open_date',e.open_date,'date',r.target_date,'odds_yes',e.odds_yes,'odds_no',e.odds_no,'result',e.result,'settled',e.settled_at is not null,'already_bet',exists(select 1 from public.predictions_picks p where p.account_id=p_actor and p.event_id=e.id),'voted',exists(select 1 from public.predictions_votes v where v.account_id=p_actor and v.event_id=e.id)) order by e.open_date desc,case e.kind when 'potatoes' then 1 when 'statements' then 2 when 'customers' then 3 when 'attendance' then 4 else 5 end,e.name) from public.predictions_events e join public.predictions_rounds r using(open_date) where e.open_date=d or r.target_date>=d and e.open_date<=d),'[]'::jsonb),
 'workers',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.predictions_staff s where public.predictions_eligible(s.id,public.predictions_next_day(d)) and not exists(select 1 from public.predictions_events e where e.open_date=d and e.worker_id=s.id)),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select q.id,q.stake,q.paid,q.created_at,q.settled_at,(select jsonb_agg(jsonb_build_object('name',e.name,'side',p.side,'label',coalesce((select x->>'label' from jsonb_array_elements(e.options)x where x->>'key'=p.side),p.side),'odds',p.odds,'result',e.result,'settled',e.settled_at is not null)) from public.predictions_picks p join public.predictions_events e on e.id=p.event_id where p.ticket_id=q.id) as picks from public.predictions_tickets q where q.account_id=p_actor order by created_at desc limit 100)t),'[]'::jsonb),
 'stats',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'net',coalesce(q.net,0)+coalesce(i.net,0)+coalesce(z.net,0),'season_net',coalesce(q.sn,0)+coalesce(i.sn,0)+coalesce(z.sn,0),'season_wins',coalesce(q.sw,0),'season_losses',coalesce(q.sl,0),'weekly_net',coalesce(q.w,0)+coalesce(i.w,0)+coalesce(z.w,0),'monthly_net',coalesce(q.m,0)+coalesce(i.m,0)+coalesce(z.m,0),'interest_net',coalesce(i.net,0),'resignation_net',coalesce(z.net,0),'resignation_bonus',coalesce(z.bonus,0),'wins',coalesce(q.wins,0),'losses',coalesce(q.losses,0),'returned',coalesce(q.returned,0),'staked',coalesce(q.staked,0)) order by coalesce(q.net,0)+coalesce(i.net,0)+coalesce(z.net,0) desc,a.nickname) from public.predictions_accounts a left join lateral(select sum(paid-stake) net,sum(paid-stake) filter(where settled_at>=game_season_start) sn,count(*) filter(where settled_at>=game_season_start and paid>stake) sw,count(*) filter(where settled_at>=game_season_start and paid<stake) sl,sum(paid-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('week',l)::date) w,sum(paid-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('month',l)::date) m,count(*) filter(where paid>stake) wins,count(*) filter(where paid<stake) losses,sum(paid) returned,sum(stake) staked from public.predictions_tickets t where t.account_id=a.id and settled_at is not null)q on true left join lateral(select sum(amount) net,sum(amount) filter(where created_at>=game_season_start) sn,sum(amount) filter(where (created_at at time zone 'Europe/Athens')::date>=date_trunc('week',now() at time zone 'Europe/Athens')::date) w,sum(amount) filter(where (created_at at time zone 'Europe/Athens')::date>=date_trunc('month',now() at time zone 'Europe/Athens')::date) m from public.predictions_ledger l where l.account_id=a.id and l.reason in ('interest_in','interest_out')) i on true left join lateral(select sum(paid+bonus-stake) net,sum(paid+bonus-stake) filter(where settled_at>=game_season_start) sn,sum(paid+bonus-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('week',l)::date) w,sum(paid+bonus-stake) filter(where (settled_at at time zone 'Europe/Athens')::date>=date_trunc('month',l)::date) m,sum(bonus) bonus from public.predictions_departure_picks p where p.account_id=a.id and p.settled_at is not null) z on true where a.status='approved'),'[]'::jsonb)
 ) into data from public.predictions_settings where singleton;

 return data || jsonb_build_object('private_inbox', coalesce((
  select jsonb_agg(to_jsonb(x) order by x.last_at desc,x.message_id desc) from (
   select distinct on (m.sender_id) m.sender_id as peer_id,a.nickname,m.id as message_id,m.created_at as last_at,left(m.body,120) as preview
   from public.predictions_messages m join public.predictions_accounts a on a.id=m.sender_id
   where m.recipient_id=p_actor and m.sender_id<>p_actor
   order by m.sender_id,m.created_at desc,m.id desc
  ) x
 ),'[]'::jsonb));

end $function$
;
create or replace function public.predictions_admin_game_season(p_actor uuid,p_apply boolean default false,p_expected integer default null,p_admin_hash text default null)
returns jsonb language plpgsql set search_path to '' as $season$
declare a public.predictions_accounts%rowtype; cur public.predictions_game_seasons%rowtype; cut timestamptz; snapshot_rows jsonb;
begin
 perform pg_advisory_xact_lock(542602,1);
 select * into a from public.predictions_accounts where id=p_actor and status='approved' and is_admin;
 if not found then raise exception 'Απαιτείται Admin.';end if;
 select * into strict cur from public.predictions_game_seasons where ended_at is null for update;
 if p_apply then
  if p_admin_hash is distinct from a.pin_hash then raise exception 'Απαιτείται επαλήθευση Admin.';end if;
  if p_expected is distinct from cur.season_no then raise exception 'Η σεζόν άλλαξε. Κάνε ανανέωση.';end if;
  cut:=clock_timestamp();
  if cut-cur.started_at<interval '1 day' then raise exception 'Μία νέα σεζόν ανά ημέρα.';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.net desc,x.nickname),'[]') into snapshot_rows from (
   select a2.id,a2.nickname,coalesce(t.net,0)+coalesce(i.net,0)+coalesce(z.net,0) net,coalesce(t.wins,0) wins,coalesce(t.losses,0) losses
   from public.predictions_accounts a2
   left join lateral(select sum(paid-stake) net,count(*) filter(where paid>stake) wins,count(*) filter(where paid<stake) losses from public.predictions_tickets where account_id=a2.id and settled_at>=cur.started_at and settled_at<cut)t on true
   left join lateral(select sum(amount) net from public.predictions_ledger where account_id=a2.id and reason in ('interest_in','interest_out') and created_at>=cur.started_at and created_at<cut)i on true
   left join lateral(select sum(paid+bonus-stake) net from public.predictions_departure_picks where account_id=a2.id and settled_at>=cur.started_at and settled_at<cut)z on true
   where a2.status='approved')x;
  update public.predictions_game_seasons set ended_at=cut,standings=snapshot_rows where season_no=cur.season_no;
  insert into public.predictions_game_seasons(season_no,started_at) values(cur.season_no+1,cut);
  insert into public.predictions_audit(actor_id,target_id,action,details) values(a.id,a.id,'game_season',jsonb_build_object('closed',cur.season_no,'opened',cur.season_no+1));
  select * into strict cur from public.predictions_game_seasons where ended_at is null;
 end if;
 return jsonb_build_object('ok',true,'current',to_jsonb(cur)-'standings','pending_tickets',(select count(*) from public.predictions_tickets where settled_at is null),'archives',coalesce((select jsonb_agg(to_jsonb(s) order by season_no desc) from public.predictions_game_seasons s where ended_at is not null),'[]'));
end $season$;
revoke all on function public.predictions_admin_game_season(uuid,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.predictions_admin_game_season(uuid,boolean,integer,text) to service_role;
