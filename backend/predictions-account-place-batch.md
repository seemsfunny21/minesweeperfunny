# Verified Edge Function addition: place_batch

Deployed in predictions-account version 18. Insert this branch after session authentication and approved-account check, before existing add_event/place/vote handling. Uses the existing rpc, state, reply, uid and E helpers. No credentials are included.

```ts
if(action==="place_batch"){
 const ts=b.tickets;
 if(!Array.isArray(ts)||ts.length<2||ts.length>3||!ts.every((t:any)=>t&&Array.isArray(t.ids)&&t.ids.length>=1&&t.ids.length<=6&&t.ids.every(uid)&&Array.isArray(t.sides)&&t.sides.length===t.ids.length&&t.sides.every((v:any)=>typeof v==="string"&&/^(yes|no|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus|before|after)$/.test(v))&&Number.isSafeInteger(t.stake)&&t.stake>=10&&t.stake<=1000))throw new E("Άκυρα δελτία.");
 const ids=ts.flatMap((t:any)=>t.ids.map((v:string)=>v.toLowerCase()));
 if(new Set(ids).size!==ids.length)throw new E("Η ίδια ερώτηση επιτρέπεται μόνο σε ένα δελτίο.");
 await rpc("predictions_place_batch",{p_actor:a.id,p_tickets:ts.map((t:any)=>({ids:t.ids,sides:t.sides,stake:t.stake}))});
 return reply(await state(a));
}
```
