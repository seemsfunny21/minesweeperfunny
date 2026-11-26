CREATE OR REPLACE FUNCTION public.predictions_place_batch(p_actor uuid, p_tickets jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE item jsonb; ids uuid[]; sides text[]; seen uuid[]:=ARRAY[]::uuid[];
  placed uuid[]:=ARRAY[]::uuid[]; existing_ids uuid[]:=ARRAY[]::uuid[];
  amount integer; n integer; at_time timestamptz; round_day date; existing_id uuid;
BEGIN
  IF jsonb_typeof(p_tickets) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Άκυρα δελτία.'; END IF;
  IF jsonb_array_length(p_tickets) NOT BETWEEN 2 AND 3 THEN RAISE EXCEPTION 'Επιτρέπονται 2 έως 3 δελτία ανά κοινή υποβολή.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_tickets) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'ids') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'sides') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'stake') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Άκυρο δελτίο.';
    END IF;
    n:=jsonb_array_length(item->'ids');
    IF n NOT BETWEEN 1 AND 6 OR jsonb_array_length(item->'sides')<>n OR (item->>'stake') !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'Άκυρο δελτίο.'; END IF;
    amount:=(item->>'stake')::integer;
    IF amount NOT BETWEEN 10 AND 1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'ids') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'sides') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x#>>'{}') !~ '^(yes|no|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus|before|after)$') THEN RAISE EXCEPTION 'Άκυρο δελτίο.'; END IF;
    ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'ids') WITH ORDINALITY t(value,ord) ORDER BY ord);
    IF (SELECT count(DISTINCT x) FROM unnest(ids) x)<>n OR seen && ids THEN RAISE EXCEPTION 'Η ίδια ερώτηση επιτρέπεται μόνο σε ένα δελτίο.'; END IF;
    seen:=seen||ids;
  END LOOP;
  PERFORM pg_advisory_xact_lock(542602,1);
  at_time:=clock_timestamp(); round_day:=(at_time AT TIME ZONE 'Europe/Athens')::date;
  PERFORM public.predictions_guard(p_actor,at_time);
  -- An exact replay on the same day returns the original ticket IDs, never a new debit.
  FOR item IN SELECT value FROM jsonb_array_elements(p_tickets) LOOP
    ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'ids') WITH ORDINALITY t(value,ord) ORDER BY ord);
    sides:=ARRAY(SELECT value FROM jsonb_array_elements_text(item->'sides') WITH ORDINALITY t(value,ord) ORDER BY ord);
    amount:=(item->>'stake')::integer;
    SELECT q.id INTO existing_id FROM public.predictions_tickets q
    WHERE q.account_id=p_actor AND q.open_date=round_day AND q.stake=amount
      AND (SELECT count(*) FROM public.predictions_picks p WHERE p.ticket_id=q.id)=cardinality(ids)
      AND NOT EXISTS(SELECT 1 FROM unnest(ids,sides) AS u(event_id,side)
        WHERE NOT EXISTS(SELECT 1 FROM public.predictions_picks p WHERE p.ticket_id=q.id AND p.event_id=u.event_id AND p.side=u.side))
    LIMIT 1;
    IF existing_id IS NOT NULL THEN existing_ids:=array_append(existing_ids,existing_id); END IF;
  END LOOP;
  IF cardinality(existing_ids)=jsonb_array_length(p_tickets) THEN RETURN existing_ids; END IF;
  IF cardinality(existing_ids)>0 THEN RAISE EXCEPTION 'Κάποιο δελτίο έχει ήδη καταχωριστεί. Έλεγξε το ιστορικό σου.'; END IF;
  -- Any exception from the existing placement routine rolls back the entire batch.
  FOR item IN SELECT value FROM jsonb_array_elements(p_tickets) LOOP
    ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'ids') WITH ORDINALITY t(value,ord) ORDER BY ord);
    sides:=ARRAY(SELECT value FROM jsonb_array_elements_text(item->'sides') WITH ORDINALITY t(value,ord) ORDER BY ord);
    amount:=(item->>'stake')::integer;
    placed:=array_append(placed,public.predictions_place(p_actor,ids,sides,amount,at_time));
  END LOOP;
  RETURN placed;
END;
$function$;
REVOKE ALL ON FUNCTION public.predictions_place_batch(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.predictions_place_batch(uuid,jsonb) TO service_role;
