
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=Deno.env.get("SUPABASE_URL")||"",SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const headers={"Access-Control-Allow-Origin":"https://seemsfunny21.github.io","Access-Control-Allow-Headers":"content-type,x-predictions-session","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin","Content-Type":"application/json; charset=utf-8"};
const enc=new TextEncoder(),hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join(""),random=(n:number)=>hex(crypto.getRandomValues(new Uint8Array(n)));
const sha=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
async function pinHash(pin:string,salt:string){const k=await crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveBits"]);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:180000},k,256)));}
function equal(a:string,b:string){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
class E extends Error{constructor(message:string,public status=400){super(message);}}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
async function rest(method:string,path:string,body?:unknown){const res=await fetch(BASE+"/rest/v1/"+path,{method,headers:{apikey:SECRET,Authorization:"Bearer "+SECRET,"Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});const raw=await res.text();let v:any;try{v=raw?JSON.parse(raw):null;}catch{throw Error("response");}if(!res.ok){console.error("predictions database",path.split("?")[0],res.status,String(v?.code||""));if(v?.code==="23505")throw new E("Το όνομα χρησιμοποιείται ήδη.",409);if(v?.code==="P0001")throw new E(String(v.message));throw Error("database");}return v;}
const rpc=(name:string,body:unknown)=>rest("POST","rpc/"+name,body);
const uid=(s:unknown)=>typeof s==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const validPin=(s:unknown)=>typeof s==="string"&&/^\d{4,8}$/.test(s);
const selfCols="id,nickname,status,is_admin,chips,created_at,approved_at,avatar";
async function limit(key:string,max:number,minutes:number){if(!await rpc("predictions_throttle",{p_key:key,p_max:max,p_minutes:minutes}))throw new E("Πολλές προσπάθειες. Δοκίμασε αργότερα.",429);}
async function newSession(id:string){const token=random(32);await rest("POST","predictions_sessions",{account_id:id,token_hash:await sha(token),expires_at:new Date(Date.now()+30*86400000).toISOString()});return token;}
async function session(req:Request){const token=req.headers.get("x-predictions-session")||"";if(!/^[a-f0-9]{64}$/.test(token))throw new E("Χρειάζεται σύνδεση.",401);const hash=await sha(token);const s=(await rest("GET","predictions_sessions?select=account_id&token_hash=eq."+hash+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1"))[0];if(!s)throw new E("Η σύνδεση έληξε.",401);const a=(await rest("GET","predictions_accounts?select="+selfCols+"&id=eq."+s.account_id+"&limit=1"))[0];if(!a||["rejected","suspended"].includes(a.status))throw new E("Ο λογαριασμός δεν είναι ενεργός.",403);if(a.status==="pending"&&Date.parse(a.created_at)+300000<=Date.now())throw new E("Η αίτηση έληξε. Κάνε νέα εγγραφή.",403);return {a,hash};}
async function state(a:any){const out:any={player:a,economy_enabled:false};if(a.status==="approved"){const settings=(await rest("GET","predictions_settings?select=economy_enabled,staff_synced_at&singleton=eq.true"))[0];
 out.economy_enabled=settings?.economy_enabled===true;
 out.game=await rpc("predictions_game_state",{p_actor:a.id});
 out.bank=await rpc("predictions_bank_state",{p_actor:a.id});
 out.departure=await rpc("predictions_departure_state",{p_actor:a.id});
 out.shop=await rpc("predictions_shop_state",{p_actor:a.id});
 out.casino=await rpc("predictions_casino_state",{p_actor:a.id});

 out.announcement=await rpc("predictions_announcement_latest",{p_actor:a.id});
 out.player=(await rest("GET","predictions_accounts?select="+selfCols+"&id=eq."+a.id+"&limit=1"))[0];out.players=await rest("GET","predictions_accounts?select=id,nickname,chips,avatar&status=eq.approved&order=nickname.asc&limit=500");if(a.is_admin)out.accounts=await rest("GET","predictions_accounts?select=id,nickname,status,created_at,is_admin,avatar&order=created_at.desc&limit=500");}return out;}
function stateParts(out:any){
 const parts:any=Object.create(null);
 function person(p:any){if(!p||typeof p!=="object")return p;const {avatar,...rest}=p;if(p.id&&typeof avatar==="string"&&avatar)parts["avatar:"+p.id]=avatar;return rest;}
 for(const [key,value] of Object.entries(out)){
  if(value===undefined)continue;
  if(key==="player")parts["root:"+key]=person(value);
  else if((key==="players"||key==="accounts")&&Array.isArray(value))parts["root:"+key]=value.map(person);
  else if(["game","bank","departure","shop","casino"].includes(key)&&value&&typeof value==="object"&&!Array.isArray(value)){
   parts["fields:"+key]=Object.keys(value);
   for(const [sub,v] of Object.entries(value))if(v!==undefined)parts[key+":"+sub]=v;
  }else parts["root:"+key]=value;
 }
 return parts;
}
async function compactState(a:any,known:any){
 const out=await state(a);
 if(known===undefined)return out;
 if(!known||typeof known!=="object"||Array.isArray(known)||Object.keys(known).length>1200)known={};
 const parts=stateParts(out),hashes:any=Object.create(null),changed:any=Object.create(null);
 for(const [key,value] of Object.entries(parts)){
  const digest=await sha(JSON.stringify(value));hashes[key]=digest;
  if(!Object.prototype.hasOwnProperty.call(known,key)||known[key]!==digest)changed[key]=value;
 }
 return {state_delta:1,hashes,changed};
}
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers});if(req.method!=="POST")return reply({error:"Method not allowed"},405);try{
const raw=await req.text();if(raw.length>140000)throw new E("Πολύ μεγάλο αίτημα.",413);const b=JSON.parse(raw),action=b.action;

if(action==="login_profiles"){
 const ip=await sha(String(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown"));
 await limit("profiles:"+ip,30,15);
 const profiles=await rest("GET","predictions_accounts?select=nickname&status=eq.approved&is_bot=eq.false&order=nickname.asc&limit=100");
 return reply({profiles});
}
if(action==="registration_options"){
 const ip=await sha(String(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown"));
 await limit("registration-options:"+ip,30,15);
 return reply({staff:await rpc("predictions_registration_options",{})});
}
if(action==="register"){
 if(!uid(b.staff_id)||!validPin(b.pin))throw new E("Επίλεξε το όνομά σου από το μητρώο και PIN 4–8 ψηφίων.");
 const ip=await sha(String(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown"));
 await limit("register:"+ip,10,60);await limit("register-staff:"+b.staff_id,5,60);
 const salt=random(16);
 const id=await rpc("predictions_register_staff",{p_staff:b.staff_id,p_salt:salt,p_hash:await pinHash(b.pin,salt)});
 return reply({token:await newSession(id)});
}
if(action==="login"){const name=String(b.nickname||"").normalize("NFKC").trim(),pin=b.pin;if(name.length<2||name.length>40||!validPin(pin))throw new E("Όνομα 2–40 χαρακτήρων και PIN 4–8 ψηφίων.");const ip=await sha(String(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown"));await limit("ip:"+ip,30,15);const loginKey="name:"+await sha(name.toLowerCase());const attempt=await rpc("predictions_login_reserve",{p_key:loginKey});if(!attempt)throw new E("Πολλές προσπάθειες. Περίμενε έως 15 λεπτά και δοκίμασε ξανά.",429);let id:string;{const p=(await rpc("predictions_lookup",{p_name:name}))[0];const hash=await pinHash(pin,p?.pin_salt||"0".repeat(32));if(!p||!equal(hash,p.pin_hash))throw new E("Λάθος όνομα ή PIN.",401);if(["rejected","suspended"].includes(p.status))throw new E("Ο λογαριασμός δεν είναι ενεργός.",403);id=p.id;}await rpc("predictions_login_complete",{p_attempt:attempt,p_key:loginKey});return reply({token:await newSession(id)});}
const {a,hash}=await session(req);if(action==="logout"){await rest("DELETE","predictions_sessions?token_hash=eq."+hash);return reply({ok:true});}if(action==="state")return reply(await compactState(a,b.state_known));if(a.status!=="approved")throw new E("Εκκρεμεί έγκριση.",403);
if(action==="work_access")return reply({approved:true,is_admin:a.is_admin===true});
if(action==="work_photos")return reply({photos:await rpc("predictions_work_photos",{}),login_index:await rpc("predictions_work_login_index",{})});
if(action==="place_batch"){
 const ts=b.tickets;
 if(!Array.isArray(ts)||ts.length<2||ts.length>3||!ts.every((t:any)=>t&&Array.isArray(t.ids)&&t.ids.length>=1&&t.ids.length<=6&&t.ids.every(uid)&&Array.isArray(t.sides)&&t.sides.length===t.ids.length&&t.sides.every((v:any)=>typeof v==="string"&&/^(yes|no|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus|before|after)$/.test(v))&&Number.isSafeInteger(t.stake)&&t.stake>=10&&t.stake<=1000))throw new E("Άκυρα δελτία.");
 const ids=ts.flatMap((t:any)=>t.ids.map((v:string)=>v.toLowerCase()));
 if(new Set(ids).size!==ids.length)throw new E("Η ίδια ερώτηση επιτρέπεται μόνο σε ένα δελτίο.");
 await rpc("predictions_place_batch",{p_actor:a.id,p_tickets:ts.map((t:any)=>({ids:t.ids,sides:t.sides,stake:t.stake}))});
 return reply(await compactState(a,b.state_known));
}
if(["add_event","place","vote"].includes(action)){
 if(action==="add_event"&&!uid(b.worker_id))throw new E("Άκυρος εργαζόμενος.");
 if(action==="place"&&(!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>6||!b.ids.every(uid)||!Array.isArray(b.sides)||b.sides.length!==b.ids.length||!b.sides.every((v:any)=>typeof v==="string"&&/^(yes|no|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus|before|after)$/.test(v))||!Number.isInteger(b.stake)))throw new E("Άκυρο δελτίο.");
 if(action==="vote"&&(!uid(b.event_id)||(typeof b.side!=="string"||! /^(yes|no|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus|before|after)$/.test(b.side))))throw new E("Άκυρη ψήφος.");
 if(action==="add_event")await rpc("predictions_add_event",{p_actor:a.id,p_worker:b.worker_id});
 if(action==="place")await rpc("predictions_place",{p_actor:a.id,p_ids:b.ids,p_sides:b.sides,p_stake:b.stake});
 if(action==="vote")await rpc("predictions_vote",{p_actor:a.id,p_event:b.event_id,p_side:b.side});
 return reply(await compactState(a,b.state_known));
}
if(action==="admin_economy"){
 if(!a.is_admin)throw new E("Μόνο για Admin.",403);
 const apply=b.apply===true;
 if(b.weekly!=null&&(!Number.isSafeInteger(b.weekly)||b.weekly<500||b.weekly>5000))throw new E("Εβδομαδιαία πίστωση 500–5.000.");
 if(b.pace!=null&&(!Number.isFinite(b.pace)||b.pace<1||b.pace>3))throw new E("Μη έγκυρη δυσκολία.");
 let h=null;
 if(apply){
  if(!validPin(b.admin_pin)||typeof b.expected!=="string"||! /^[a-f0-9]{32}$/.test(b.expected))throw new E("Απαιτείται PIN και προεπισκόπηση.",403);
  await limit("economy-admin:"+a.id,10,15);
  const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];if(!admin)throw new E("Δεν επιτρέπεται.",403);
  h=await pinHash(b.admin_pin,admin.pin_salt);if(!equal(h,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 }
 return reply(await rpc("predictions_admin_economy",{p_actor:a.id,p_weekly:b.weekly??null,p_pace:b.pace??null,p_apply:apply,p_expected:apply?b.expected:null,p_admin_hash:h}));
}
if(action==="admin_stats"){if(!a.is_admin)throw new E("Μόνο για Admin.",403);if(![0,7,30,90].includes(b.days)||!["all","winter","summer"].includes(b.season))throw new E("Άκυρο φίλτρο.");return reply(await rpc("predictions_admin_stats",{p_actor:a.id,p_days:b.days,p_season:b.season}));}
if(action==="bank"){
 if(!["request","accept","repay","cancel"].includes(b.operation)|| (b.operation!=="request"&&!uid(b.id))||(["request","repay"].includes(b.operation)&&!Number.isSafeInteger(b.amount)))throw new E("Μη έγκυρη τραπεζική ενέργεια.");
 await rpc("predictions_bank_action",{p_actor:a.id,p_operation:b.operation,p_id:b.id??null,p_amount:b.amount??null});
 return reply(await compactState(a,b.state_known));
}
if(action==="casino"){
 if(!["slots","start","roulette_red","roulette_black","dice_low","dice_high","coin_heads","coin_tails","scratch","hilo_low","hilo_high","wheel","hit","stand","double","split"].includes(b.operation)||!uid(b.request_id))throw new E("Άκυρη ενέργεια.");
 const fresh=["slots","start","roulette_red","roulette_black","dice_low","dice_high","coin_heads","coin_tails","scratch","hilo_low","hilo_high","wheel"].includes(b.operation);
 if(fresh?(!Number.isSafeInteger(b.stake)||b.stake<10||b.stake>100||b.round_id!=null||b.version!=null):(b.stake!=null||!uid(b.round_id)||!Number.isSafeInteger(b.version)||b.version<1))throw new E("Άκυρο αίτημα.");
 await rpc("predictions_casino_action",{p_actor:a.id,p_operation:b.operation,p_request:b.request_id,p_stake:b.stake??null,p_round:b.round_id??null,p_version:b.version??null});
 return reply(await compactState(a,b.state_known));
}
if(action==="custom_title"){
 if(typeof b.title!=="string"||b.title.length>120)throw new E("Άκυρος τίτλος.");
 const title=b.title.normalize("NFKC").trim().replace(/\s+/gu," ");
 if(title.length<2||title.length>60||/[\p{Cc}\p{Cf}<>]/u.test(title))throw new E("Γράψε 2–60 χαρακτήρες.");
 await limit("custom-title:"+a.id,20,15);
 await rpc("predictions_custom_title",{p_actor:a.id,p_title:title});
 return reply(await compactState(a,b.state_known));
}
if(action==="shop"){
 if(!["buy","gift","equip_frame","equip_trophy","equip_color","equip_background","equip_title","equip_effect"].includes(b.operation)|| (b.code!==null&&(typeof b.code!=="string"||! /^[a-z_]{1,40}$/.test(b.code))))throw new E("Άκυρο αντικείμενο.");
 if(["buy","gift"].includes(b.operation)&&!uid(b.request_id))throw new E("Άκυρο αίτημα αγοράς.");
 if(b.operation==="gift"&&!uid(b.recipient))throw new E("Άκυρος παραλήπτης.");
 if(b.expected_price!=null&&(!Number.isSafeInteger(b.expected_price)||b.expected_price<1))throw new E("Μη έγκυρη τιμή.");
 await rpc("predictions_shop_checked",{p_actor:a.id,p_operation:b.operation,p_code:b.code,p_recipient:b.operation==="gift"?b.recipient:null,p_request:["buy","gift"].includes(b.operation)?b.request_id:null,p_expected_price:b.expected_price??null});
 return reply(await compactState(a,b.state_known));
}
if(action==="departure"){
 if(!uid(b.worker_id)||!["place","enable","disable","confirm"].includes(b.operation))throw new E("Άκυρη ενέργεια.");
 let adminHash=null;
 if(b.operation==="place"){
  if(!Number.isInteger(b.bucket)||b.bucket<1||b.bucket>8||!Number.isInteger(b.stake)||b.stake<10||b.stake>100)throw new E("Άκυρη πρόβλεψη.");
 }else{
  if(!a.is_admin||!validPin(b.admin_pin))throw new E("Απαιτείται PIN διαχειριστή.",403);
  if(b.operation==="enable"&&b.consent!==true)throw new E("Απαιτείται συγκατάθεση.");
  if(b.operation==="confirm"&&(b.confirmed!==true||typeof b.departed_on!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(b.departed_on)))throw new E("Απαιτείται επιβεβαιωμένη αποχώρηση και ημερομηνία.");
  await limit("departure-admin:"+a.id,10,15);
  const p=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];
  adminHash=await pinHash(b.admin_pin,p.pin_salt);
  if(!equal(adminHash,p.pin_hash))throw new E("Λάθος PIN Admin.",403);
 }
 await rpc("predictions_departure_action",{p_actor:a.id,p_operation:b.operation,p_worker:b.worker_id,p_bucket:b.operation==="place"?b.bucket:null,p_stake:b.operation==="place"?b.stake:null,p_departed:b.operation==="confirm"?b.departed_on:null,p_admin_hash:adminHash});
 return reply(await compactState(a,b.state_known));
}
if(action==="season"){if(!a.is_admin||!["winter","summer"].includes(b.season))throw new E("Δεν επιτρέπεται.",403);await rpc("predictions_set_season",{p_actor:a.id,p_season:b.season});return reply(await compactState(a,b.state_known));}
if(action==="import_staff_photos"){
 if(!a.is_admin||!validPin(b.admin_pin))throw new E("Απαιτείται PIN Admin.",403);
 if(!Array.isArray(b.staff)||b.staff.length<1||b.staff.length>31||!b.staff.every((x:any)=>x&&typeof x.staff_name==="string"&&x.staff_name.length<=80&&typeof x.avatar==="string"&&x.avatar.length<=100000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x.avatar)))throw new E("Μη έγκυρο αρχείο φωτογραφιών.");
 await limit("staff-photos:"+a.id,5,15);
 const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];
 if(!admin)throw new E("Δεν επιτρέπεται.",403);
 const h=await pinHash(b.admin_pin,admin.pin_salt);
 if(!equal(h,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 return reply(await rpc("predictions_import_staff_photos",{p_actor:a.id,p_admin_hash:h,p_staff:b.staff}));
}
if(action==="member_manage"){
 if(!a.is_admin||!uid(b.target)||!["rename","archive"].includes(b.operation)||!validPin(b.admin_pin))throw new E("Απαιτείται PIN Admin.",403);
 const name=b.operation==="rename"?String(b.nickname||"").normalize("NFKC").trim():null;
 if(name!==null&&(name.length<2||name.length>40))throw new E("Όνομα 2–40 χαρακτήρων.");
 await limit("member-admin:"+a.id,10,15);
 const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];
 const adminHash=await pinHash(b.admin_pin,admin.pin_salt);
 if(!equal(adminHash,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 await rpc("predictions_member_manage",{p_actor:a.id,p_target:b.target,p_operation:b.operation,p_name:name,p_admin_hash:adminHash});
 return reply(await compactState(a,b.state_known));
}
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
 return reply(await compactState(a,b.state_known));
}
if(action==="admin_grant"){
 if(!a.is_admin||!uid(b.target)||!uid(b.request_id)||!validPin(b.admin_pin))throw new E("Απαιτείται PIN Admin.",403);
 if(!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>100000)throw new E("Ποσό 1–100.000 μαρκών.");
 await limit("admin-grant:"+a.id,10,15);
 const admin=(await rpc("predictions_lookup",{p_name:a.nickname}))[0];
 if(!admin)throw new E("Δεν επιτρέπεται.",403);
 const h=await pinHash(b.admin_pin,admin.pin_salt);
 if(!equal(h,admin.pin_hash))throw new E("Λάθος PIN Admin.",403);
 await rpc("predictions_admin_grant",{p_actor:a.id,p_target:b.target,p_amount:b.amount,p_request:b.request_id,p_admin_hash:h});
 return reply(await compactState(a,b.state_known));
}
if(action==="manage"){if(!a.is_admin||!uid(b.target)||!["approve","reject","suspend","reset_pin"].includes(b.operation))throw new E("Δεν επιτρέπεται.",403);let extra={};if(b.operation==="reset_pin"){if(!validPin(b.new_pin)||!validPin(b.admin_pin))throw new E("Άκυρο PIN.");await limit("reset:"+a.id,5,15);const p=(await rpc("predictions_lookup",{p_name:a.nickname}))[0],adminHash=await pinHash(b.admin_pin,p.pin_salt);if(!equal(adminHash,p.pin_hash))throw new E("Λάθος PIN Admin.",403);const salt=random(16);extra={p_salt:salt,p_hash:await pinHash(b.new_pin,salt),p_admin_hash:adminHash};}await rpc("predictions_manage",{p_actor:a.id,p_target:b.target,p_action:b.operation,...extra});return reply(await compactState(a,b.state_known));}
if(action==="avatar"){const avatar=b.avatar;if(avatar!==null&&(typeof avatar!=="string"||avatar.length>100000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar)))throw new E("Μη έγκυρη εικόνα.");await rest("PATCH","predictions_accounts?id=eq."+a.id,{avatar});return reply({ok:true});}
throw new E("Άγνωστη ενέργεια.");
}catch(e){if(!(e instanceof E))console.error("predictions internal",e instanceof Error?e.name+":"+e.message:"unknown");return reply({error:e instanceof E?e.message:"Η ενέργεια απέτυχε. Δοκίμασε ξανά."},e instanceof E?e.status:500);}});
