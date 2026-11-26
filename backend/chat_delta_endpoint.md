# Incremental chat endpoint

Edge version 21. Replaces chat_list/chat_send after approved-session check. Legacy clients remain supported.

```ts
if(action==="chat_list"||action==="chat_send"){
 if(b.peer!=null&&!uid(b.peer))throw new E("Άκυρη συνομιλία.");
 const incremental=b.known!==undefined;
 if(incremental&&(!Array.isArray(b.known)||b.known.length>100||!b.known.every(uid)))throw new E("Μη έγκυρη ανανέωση.");
 if(action==="chat_send"){
  if(!uid(b.request_id)||typeof b.body!=="string"||!b.body.trim()||[...b.body.trim()].length>1000)throw new E("Άκυρο μήνυμα.");
  await rpc("predictions_message_send",{p_actor:a.id,p_recipient:b.peer??null,p_body:b.body,p_request:b.request_id,p_announcement:false});
 }
 return reply(await rpc(incremental?"predictions_message_delta":"predictions_message_list",incremental?{p_actor:a.id,p_peer:b.peer??null,p_known:b.known}:{p_actor:a.id,p_peer:b.peer??null}));
}
```
