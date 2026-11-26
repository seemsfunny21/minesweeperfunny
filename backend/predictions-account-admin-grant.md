# Admin virtual-chip grant endpoint

Insert after session/approved-account check, before existing manage branch. Deployed Edge version 19.

```ts
if(action==="admin_grant"){
 if(!a.is_admin||!uid(b.target)||!uid(b.request_id)||!validPin(b.admin_pin))throw new E("Απαιτείται PIN Admin.",403);
 if(!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>100000)throw new E("Ποσό 1–100.000 μαρκών.");
 await limit("admin-grant:"+a.id,10,15);
 const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];
 if(!admin)throw new E("Δεν επιτρέπεται.",403);
 const h=await pinHash(b.admin_pin,admin.pin_salt);
 if(!equal(h,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 await rpc("predictions_admin_grant",{p_actor:a.id,p_target:b.target,p_amount:b.amount,p_request:b.request_id,p_admin_hash:h});
 return reply(await state(a));
}
```
