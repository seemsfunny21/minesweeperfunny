-- Applied migration: predictions_private_inbox_summary.
-- Use current deployed game-state function; no change to messaging RLS or grants.
DO $inbox$
DECLARE d text; patched text;
BEGIN
 SELECT pg_get_functiondef('public.predictions_game_state(uuid)'::regprocedure) INTO d;
 IF position('private_inbox' in d)>0 THEN RETURN; END IF;
 patched:=replace(d,' return data;', $body$
 return data || jsonb_build_object('private_inbox', coalesce((
  select jsonb_agg(to_jsonb(x) order by x.last_at desc,x.message_id desc) from (
   select distinct on (m.sender_id) m.sender_id as peer_id,a.nickname,m.id as message_id,m.created_at as last_at,left(m.body,120) as preview
   from public.predictions_messages m join public.predictions_accounts a on a.id=m.sender_id
   where m.recipient_id=p_actor and m.sender_id<>p_actor
   order by m.sender_id,m.created_at desc,m.id desc
  ) x
 ),'[]'::jsonb));
$body$);
 IF patched=d THEN RAISE EXCEPTION 'Unexpected state function version'; END IF;
 EXECUTE patched;
END
$inbox$;
