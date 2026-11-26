-- Allow a single valid submitted vote; require strict majority of valid votes cast.
-- No votes, ties, or no strict majority leave the result NULL (void).
CREATE OR REPLACE FUNCTION public.predictions_majority(p_event uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO ''
AS $function$
WITH valid AS (
 SELECT v.side FROM public.predictions_votes v
 JOIN public.predictions_accounts a ON a.id=v.account_id
 JOIN public.predictions_events e ON e.id=v.event_id
 WHERE v.event_id=p_event AND a.status='approved'
 AND public.predictions_option_odds(e.options,v.side) IS NOT NULL
), counts AS (SELECT side,count(*) n FROM valid GROUP BY side)
SELECT side FROM counts WHERE n*2>(SELECT count(*) FROM valid)
ORDER BY n DESC LIMIT 1
$function$;
