CREATE FUNCTION public.predictions_message_delta(p_actor uuid,p_peer uuid DEFAULT NULL,p_known uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE msgs jsonb; conv jsonb; ids uuid[]; known uuid[]:=coalesce(p_known,ARRAY[]::uuid[]);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.predictions_accounts WHERE id=p_actor AND status='approved') THEN RAISE EXCEPTION 'Απαιτείται εγκεκριμένος λογαριασμός.'; END IF;
 IF cardinality(known)>100 THEN RAISE EXCEPTION 'Μη έγκυρη ανανέωση.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]'::jsonb),coalesce(array_agg(x.id ORDER BY x.created_at,x.id),ARRAY[]::uuid[]) INTO msgs,ids
 FROM (SELECT m.id,m.sender_id,m.recipient_id,a.nickname,m.body,m.announcement,m.created_at FROM public.predictions_messages m JOIN public.predictions_accounts a ON a.id=m.sender_id
 WHERE (p_peer IS NULL AND m.recipient_id IS NULL) OR (p_peer IS NOT NULL AND ((m.sender_id=p_actor AND m.recipient_id=p_peer) OR (m.sender_id=p_peer AND m.recipient_id=p_actor)))
 ORDER BY m.created_at DESC,m.id DESC LIMIT (CASE WHEN p_peer IS NULL THEN 20 ELSE 100 END))x;
 SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.last_at DESC),'[]'::jsonb) INTO conv FROM
 (SELECT a.id,a.nickname,max(m.created_at) last_at FROM public.predictions_messages m JOIN public.predictions_accounts a ON a.id=CASE WHEN m.sender_id=p_actor THEN m.recipient_id ELSE m.sender_id END
 WHERE m.recipient_id IS NOT NULL AND (m.sender_id=p_actor OR m.recipient_id=p_actor) GROUP BY a.id,a.nickname ORDER BY max(m.created_at) DESC LIMIT 100)y;
 IF ids=known THEN RETURN jsonb_build_object('delta',true,'unchanged',true,'conversations',conv); END IF;
 RETURN jsonb_build_object('delta',true,'ids',ids,'messages',coalesce((SELECT jsonb_agg(v ORDER BY ord) FROM jsonb_array_elements(msgs) WITH ORDINALITY t(v,ord) WHERE NOT ((v->>'id')::uuid=ANY(known))),'[]'::jsonb),'conversations',conv);
END $fn$;
REVOKE ALL ON FUNCTION public.predictions_message_delta(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.predictions_message_delta(uuid,uuid,uuid[]) TO service_role;