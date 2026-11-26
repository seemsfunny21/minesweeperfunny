# Admin tools and chat endpoint

Edge version 20. Insert after approved-session check; add out.announcement RPC to state(a) for approved users.

```ts
if(action==="chat_list"){
 if(b.peer!=null&&!uid(b.peer))throw new E("Άκυρη συνομιλία.");
 return reply(await rpc("predictions_message_list",{p_actor:a.id,p_peer:b.peer??null}));
}
if(action==="chat_send"){
 if((b.peer!=null&&!uid(b.peer))||!uid(b.request_id)||typeof b.body!=="string"||!b.body.trim()||[...b.body.trim()].length>1000)throw new E("Άκυρο μήνυμα.");
 await rpc("predictions_message_send",{p_actor:a.id,p_recipient:b.peer??null,p_body:b.body,p_request:b.request_id,p_announcement:false});
 return reply(await rpc("predictions_message_list",{p_actor:a.id,p_peer:b.peer??null}));
}
if(action==="admin_overview"){
 if(!a.is_admin)throw new E("Μόνο για Admin.",403);
 return reply(await rpc("predictions_admin_overview",{p_actor:a.id}));
}
if(["admin_remove","admin_cancel","admin_announcement"].includes(action)){
 if(!a.is_admin||!uid(b.request_id)||!validPin(b.admin_pin))throw new E("Απαιτείται PIN Admin.",403);
 if(action==="admin_remove"&&(!uid(b.target)||!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>100000))throw new E("Άκυρο ποσό ή μέλος.");
 if(action==="admin_cancel"&&!uid(b.event_id))throw new E("Άκυρη ερώτηση.");
 if(action==="admin_announcement"&&(typeof b.body!=="string"||!b.body.trim()||[...b.body.trim()].length>1000))throw new E("Άκυρη ανακοίνωση.");
 await limit("admin-tools:"+a.id,10,15);
 const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];if(!admin)throw new E("Δεν επιτρέπεται.",403);
 const h=await pinHash(b.admin_pin,admin.pin_salt);if(!equal(h,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 if(action==="admin_remove")await rpc("predictions_admin_remove",{p_actor:a.id,p_target:b.target,p_amount:b.amount,p_request:b.request_id,p_admin_hash:h});
 if(action==="admin_cancel")await rpc("predictions_admin_cancel",{p_actor:a.id,p_event:b.event_id,p_request:b.request_id,p_admin_hash:h});
 if(action==="admin_announcement")await rpc("predictions_message_send",{p_actor:a.id,p_recipient:null,p_body:b.body,p_request:b.request_id,p_announcement:true,p_admin_hash:h});
 return reply(await state(a));
}
```
