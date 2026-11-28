"use strict";
const R=PredictionRules,$=id=>document.getElementById(id),screen=$("screen"),auth=$("authScreen");
const API="https://zrbmsziipzabnniqcpav.supabase.co/functions/v1/predictions-account",KEY="predictions-session-v1";
let token=localStorage.getItem(KEY)||"",state=null,tab="Γεγονότα",busy=false,date="",available=0,authMode="login",resetOpen=false,refreshing=false,revision=0,profileTarget=null,rankingPeriod="wealth";
const el=(tag,t,c)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=t;if(c)n.className=c;return n;};
const button=(t,fn,c)=>{const n=el("button",t,c);n.type="button";n.onclick=fn;return n;};
const fmt=n=>Number(n).toLocaleString("el-GR");
const pinField=(id,placeholder)=>{const n=el("input");n.id=id;n.type="password";n.inputMode="numeric";n.autocomplete="off";n.maxLength=8;n.placeholder=placeholder;return n;};
const validPin=x=>/^\d{4,8}$/.test(x);
const STATE_ACTIONS=new Set(["state","place_batch","add_event","place","vote","bank","casino","custom_title","shop","departure","season","member_manage","admin_remove","admin_cancel","admin_announcement","admin_grant","manage"]);
const AVATAR_CACHE="predictions-avatars-v1",AVATAR_PREFIX="./__avatar-cache/";
let statePartsCache=Object.create(null),stateHashes=Object.create(null),stateRequestId=0,stateAcceptedId=0,avatarCacheReady=null;
function resetStateCache(){statePartsCache=Object.create(null);stateHashes=Object.create(null);stateAcceptedId=++stateRequestId;avatarCacheReady=null;}
function setToken(t){const old=token;revision++;resetStateCache();token=t||"";if(token)localStorage.setItem(KEY,token);else if(localStorage.getItem(KEY)===old)localStorage.removeItem(KEY);}
function isAvatarPart(key){return /^avatar:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key);}
function avatarUrl(key){return new URL(AVATAR_PREFIX+key.slice(7),location.href).href;}
function validCachedAvatar(key,hash,data){return isAvatarPart(key)&&typeof hash==="string"&&/^[a-f0-9]{64}$/.test(hash)&&typeof data==="string"&&data.length<=100000&&/^data:image\/jpeg;base64,/.test(data);}
async function seedAvatars(){
 if(avatarCacheReady)return avatarCacheReady;
 const owner=token,epoch=stateAcceptedId;
 avatarCacheReady=(async()=>{try{if(!("caches" in globalThis))return;const cache=await caches.open(AVATAR_CACHE),keys=await cache.keys();
  for(const req of keys.slice(-100)){const key="avatar:"+new URL(req.url).pathname.split("/").pop(),res=await cache.match(req);if(!res)continue;const data=await res.json();if(token!==owner||stateAcceptedId!==epoch)return;if(validCachedAvatar(key,data.hash,data.data)&&!Object.hasOwn(statePartsCache,key)){statePartsCache[key]=data.data;stateHashes[key]=data.hash;}}
 }catch{}})();return avatarCacheReady;
}
async function persistAvatars(parts,hashes,changed,owner,seq){
 try{if(!("caches" in globalThis))return;const cache=await caches.open(AVATAR_CACHE);if(token!==owner||stateAcceptedId!==seq)return;
  for(const [key,data] of Object.entries(changed)){if(token!==owner||stateAcceptedId!==seq)return;if(validCachedAvatar(key,hashes[key],data))await cache.put(avatarUrl(key),new Response(JSON.stringify({hash:hashes[key],data}),{headers:{"Content-Type":"application/json"}}));}
  const keys=await cache.keys();for(const req of keys.slice(0,Math.max(0,keys.length-100))){if(token!==owner||stateAcceptedId!==seq)return;await cache.delete(req);}
 }catch{}
}
function mergeStateParts(previous,data){
 const parts=Object.create(null),hashes=Object.create(null);
 for(const [key,hash] of Object.entries(data.hashes||{})){const changed=Object.hasOwn(data.changed||{},key);if(!changed&&!Object.hasOwn(previous,key))throw Error("Απαιτείται πλήρης ανανέωση.");parts[key]=changed?data.changed[key]:previous[key];hashes[key]=hash;}
 const result={};
 function person(p){if(!p||typeof p!=="object")return p;return {...p,avatar:parts["avatar:"+p.id]??null};}
 for(const [key,value] of Object.entries(parts)){if(key.startsWith("root:")){const name=key.slice(5);if(name==="player")result[name]=person(value);else if((name==="players"||name==="accounts")&&Array.isArray(value))result[name]=value.map(person);else result[name]=value;}
  else if(key.startsWith("fields:")){const name=key.slice(7),obj={};for(const sub of value)obj[sub]=parts[name+":"+sub];result[name]=obj;}}
 return {parts,hashes,result};
}
async function api(action,extra={}){
 const owner=token,delta=!!owner&&STATE_ACTIONS.has(action);if(delta)await seedAvatars();if(owner!==token)throw Error("Η σύνδεση άλλαξε.");
 const seq=delta?++stateRequestId:0,previous=delta?{...statePartsCache}:null,known=delta?{...stateHashes}:null;
 const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",...(owner?{"x-predictions-session":owner}:{})},body:JSON.stringify({action,...extra,...(delta?{state_known:known}:{})}),cache:"no-store",signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok){const e=new Error(data.error||"Αποτυχία σύνδεσης.");e.status=response.status;throw e;}if(owner!==token)throw Error("Η σύνδεση άλλαξε.");
 if(delta&&data.state_delta===1){const next=mergeStateParts(previous,data);if(seq>=stateAcceptedId){stateAcceptedId=seq;statePartsCache=next.parts;stateHashes=next.hashes;void persistAvatars(next.parts,next.hashes,data.changed||{},owner,seq);}return next.result;}
 return data;
}
function toggleGame(yes){$("gameScreen").hidden=!yes;$("tabs").hidden=!yes;$("profileButton").hidden=!yes;auth.hidden=yes;if(yes){auth.replaceChildren();cancelAuthPin();}if(!yes){screen.replaceChildren();$("profileButton").replaceChildren();}}
function feedback(t){const f=$("feedback");if(f)f.textContent=t;}
let authPinTimer=null;
function cancelAuthPin(){if(authPinTimer!==null){clearTimeout(authPinTimer);authPinTimer=null;}}
const LOGIN_PHOTO_INDEX="predictions-login-photo-index-v1";
function rememberLoginProfiles(snapshot){
 if(snapshot?.player?.status!=="approved")return;
 try{const map=Object.create(null);for(const p of (snapshot.players||[]).slice(0,100))if(typeof p.nickname==="string"&&isAvatarPart("avatar:"+p.id)&&typeof p.avatar==="string")map[p.nickname]=p.id;
 localStorage.setItem(LOGIN_PHOTO_INDEX,JSON.stringify(map));}catch{}
}
function loginAvatar(p){
 const holder=el("span",String(p.nickname||"?").slice(0,1).toUpperCase(),"login-avatar login-initial");
 try{const map=JSON.parse(localStorage.getItem(LOGIN_PHOTO_INDEX)||"{}"),key="avatar:"+map[p.nickname];
 if(isAvatarPart(key)&&"caches" in globalThis)void (async()=>{try{const cache=await caches.open(AVATAR_CACHE),response=await cache.match(avatarUrl(key));if(!response)return;const data=await response.json();if(!validCachedAvatar(key,data.hash,data.data)||!holder.isConnected)return;const img=el("img",undefined,"login-avatar");img.src=data.data;img.alt="";holder.replaceWith(img);}catch{}})();
 }catch{}return holder;
}
function authForm(error=""){
 cancelAuthPin();toggleGame(false);auth.replaceChildren();
 const c=el("section",undefined,"card auth-card"),f=el("p",error,"feedback");f.id="feedback";
 auth.append(c);
 if(authMode==="register"){
  const name=el("select");name.id="nickname";name.setAttribute("aria-label","Εργαζόμενος");name.disabled=true;
  const placeholder=el("option","Φόρτωση προσωπικού…");placeholder.value="";name.append(placeholder);
  const pin=pinField("pin","Προσωπικό PIN 4–8 ψηφίων"),form=el("form"),submit=el("button","Αίτημα εγγραφής","primary");
  submit.type="submit";submit.disabled=true;
  form.append(el("label","Επίλεξε το όνομά σου"),name,el("label","PIN"),pin,submit,f);
  name.onchange=()=>{submit.disabled=!name.value||busy;};
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;if(!name.value||!validPin(pin.value)){f.textContent="Επίλεξε εργαζόμενο και PIN 4–8 ψηφίων.";return;}busy=true;submit.disabled=true;name.disabled=true;try{const data=await api("register",{staff_id:name.value,pin:pin.value});pin.value="";authMode="login";setToken(data.token);await refresh(true);}catch(err){f.textContent=err.message;}finally{busy=false;name.disabled=false;submit.disabled=!name.value;}};
  c.append(el("h2","Νέα εγγραφή"),form,button("Επιστροφή στη σύνδεση",()=>{if(!busy){authMode="login";authForm();}},"secondary"),el("small","Μία εγγραφή ανά εργαζόμενο. Ο λογαριασμός ενεργοποιείται μετά από έγκριση Admin.","safe-note"));
  void (async()=>{try{const data=await api("registration_options");if(!form.isConnected)return;name.replaceChildren();const blank=el("option","Επίλεξε το όνομά σου");blank.value="";name.append(blank);
   for(const p of data.staff||[]){const o=el("option",p.nickname);o.value=p.staff_id;name.append(o);}
   name.disabled=!(data.staff||[]).length;if(name.disabled)f.textContent="Δεν υπάρχουν διαθέσιμες εγγραφές. Επικοινώνησε με τον Admin.";
  }catch(err){if(form.isConnected)f.textContent=err.message;}})();return;
 }
 c.append(button("＋ Νέα εγγραφή",()=>{if(!busy){authMode="register";authForm();}},"primary"),el("h2","Επίλεξε προφίλ"));
 const grid=el("div",undefined,"login-profiles"),loading=el("p","Φόρτωση προφίλ…","muted"),panel=el("div",undefined,"login-pin-panel");grid.append(loading);
 c.append(grid,panel,f);
 let selected=null,manual=false;
 const sharedPinLengths="work-directory:pin-length-v1";
 function rememberedLength(nickname){try{const m=JSON.parse(localStorage.getItem(sharedPinLengths)||"{}");const n=m[nickname];return Number.isInteger(n)&&n>=4&&n<=8?n:0}catch{return 0}}
 function rememberLoginLength(nickname,n){try{const m=Object.assign(Object.create(null),JSON.parse(localStorage.getItem(sharedPinLengths)||"{}"));m[nickname]=n;localStorage.setItem(sharedPinLengths,JSON.stringify(m))}catch{}}
 function renderPin(p){
  cancelAuthPin();selected=p;manual=!p;panel.replaceChildren();f.textContent="";
  for(const b of grid.children)b.setAttribute("aria-pressed",String(!!p&&b.dataset?.profile===p.nickname));
  const form=el("form"),pin=pinField("loginPin","PIN"),submit=el("button","Σύνδεση","secondary");
  submit.type="submit";pin.setAttribute("aria-label","PIN");pin.autocomplete="off";
  let name=null;if(manual){name=el("input");name.placeholder="Το όνομά σου";name.maxLength=40;name.autocomplete="username";name.setAttribute("aria-label","Όνομα");form.append(name);}else form.append(el("h3",p.nickname));
  form.append(pin,submit);panel.append(form);
  async function login(){
   cancelAuthPin();if(busy||!form.isConnected||!validPin(pin.value))return;
   const nickname=manual?name.value.trim():p.nickname;if(nickname.length<2){f.textContent="Συμπλήρωσε το όνομά σου.";return;}
   const enteredPin=pin.value;busy=true;pin.disabled=true;submit.disabled=true;if(name)name.disabled=true;f.textContent="Σύνδεση…";
   try{const data=await api("login",{nickname,pin:enteredPin});rememberLoginLength(nickname,enteredPin.length);pin.value="";setToken(data.token);await refresh(true);}
   catch(err){pin.value="";f.textContent=err.message;}
   finally{busy=false;pin.disabled=false;submit.disabled=false;if(name)name.disabled=false;if(form.isConnected&&!token)pin.focus();}
  }
  form.onsubmit=e=>{e.preventDefault();if(!validPin(pin.value)){f.textContent="PIN 4–8 ψηφίων.";return;}login();};
  function queueLogin(e){cancelAuthPin();if(busy||e?.isComposing)return;pin.value=pin.value.replace(/[^0-9]/g,"").slice(0,8);f.textContent="";const value=pin.value,nickname=manual?name.value.trim():p.nickname;if(!validPin(value)||nickname.length<2||value.length!==8&&value.length!==rememberedLength(nickname))return;authPinTimer=setTimeout(()=>{authPinTimer=null;if(form.isConnected&&!busy&&pin.value===value&&(manual?name.value.trim():p.nickname)===nickname)void login()},700);}
  pin.oninput=queueLogin;pin.addEventListener("compositionend",queueLogin);
  if(manual)name.oninput=()=>cancelAuthPin();
  if(manual)name.focus();else pin.focus();
 }
 c.append(button("Σύνδεση με όνομα / αναμονή έγκρισης",()=>{if(!busy)renderPin(null);},"secondary"));
 async function load(){
  try{const result=await api("login_profiles");if(!grid.isConnected)return;grid.replaceChildren();
   const list=Array.isArray(result.profiles)?result.profiles:[];
   for(const p of list){if(typeof p.nickname!=="string")continue;const b=button("",()=>{if(!busy)renderPin(p);},"login-profile");b.dataset.profile=p.nickname;b.setAttribute("aria-pressed","false");b.append(loginAvatar(p),el("span",p.nickname));grid.append(b);}
   if(!grid.children.length)grid.append(el("p","Δεν υπάρχουν ακόμη εγκεκριμένα προφίλ.","muted"));
  }catch(err){if(!grid.isConnected)return;grid.replaceChildren(el("p","Δεν φορτώθηκαν τα προφίλ.","muted"),button("Επανάληψη",load,"secondary"));}
 }
 if(!token)load();else loading.textContent="Έλεγχος σύνδεσης…";
}
async function logout(){if(busy)return;busy=true;revision++;try{try{if(token)await disablePush();}catch{}try{if(token)await api("logout");}catch{}setToken("");state=null;chatView=null;picks.clear();ticketBatchDraft=null;menuHistory.length=0;predictionsNavReady=false;predictionsNavDepth=0;predictionsOverlay=null;predictionsClosingEntry=false;profileTarget=null;giftTarget=null;shopTab="menu";giftGroup="general";tab="Γεγονότα";authForm();}finally{busy=false;}}
function registrationCountdown(p,node,done){
 const deadline=Date.parse(p.created_at)+300000;
 let timer;
 function tick(){
  if(!node.isConnected){clearInterval(timer);return;}
  const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  node.textContent=seconds?"Απομένουν "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0"):"Η αίτηση έληξε.";
  if(!seconds){clearInterval(timer);done?.();}
 }
 timer=setInterval(tick,1000);tick();
}
function pending(){
 toggleGame(false);auth.replaceChildren();const c=el("section",undefined,"card auth-card"),remaining=el("strong","");
 c.append(el("div","⏳","pending-icon"),el("h2","Αναμονή έγκρισης"),el("p","Γεια σου, "+state.player.nickname+". Ζήτησε από τον Admin να εγκρίνει την εγγραφή σου μέσα σε 5 λεπτά."),remaining,button("Έλεγχος έγκρισης",()=>refresh(true),"primary"),button("Έξοδος",logout),el("p","","feedback"));c.lastChild.id="feedback";auth.append(c);
 registrationCountdown(state.player,remaining,()=>{void refresh(true);});notifications(c);
}
function section(title,sub){const h=el("div",undefined,"section-head");h.append(el("h2",title));if(sub)h.append(el("span",sub,"count"));screen.append(h);}
function card(){const c=el("article",undefined,"card");screen.append(c);return c;}
function rows(items){const c=card();for(const [a,b] of items){const r=el("div",undefined,"row");r.append(el("span",a),el("span",b));c.append(r);}return c;}
function notice(t){screen.append(el("p",t,"notice"));}
const picks=new Map();let stake=100;
const game=()=>state.game||{};
const day=()=>game().open_date;
const odds=(v)=>Number(v).toFixed(2).replace(".",",");
const dateFmt=(d)=>d?d.split("-").reverse().join("/"):"—";

function marketOptions(e){return Array.isArray(e.options)&&e.options.length?e.options:[{key:"yes",label:"Θα έρθει",odds:e.odds_yes},{key:"no",label:"Δεν θα έρθει",odds:e.odds_no}];}
function marketOption(e,key){return marketOptions(e).find(o=>o.key===key);}
function eligibleEvents(){return (game().events||[]).filter(e=>e.open_date===day()&&!e.settled&&!e.already_bet&&(e.can_bet??(game().phase==="open")));}
function prune(){const valid=new Map(eligibleEvents().map(e=>[e.id,e]));for(const [id,key] of picks)if(!valid.has(id)||!marketOption(valid.get(id),key))picks.delete(id);}
async function transact(action,data,next,success){if(busy)return;busy=true;revision++;try{state=await api(action,data);if(action==="place"||action==="place_batch"){picks.clear();ticketBatchDraft=null;}prune();clock();show(next);if(success)notice(success);}catch(e){notice(e.message);}finally{busy=false;}}
function choose(e,side){if(busy||!marketOption(e,side))return;if(picks.get(e.id)===side)picks.delete(e.id);else{if(!picks.has(e.id)&&picks.size>=6){notice("Μέχρι 6 επιλογές ανά δελτίο.");return;}picks.set(e.id,side);}show("Γεγονότα");}
function optionGrid(e,vote=false){const opts=marketOptions(e),a=el("div",undefined,"odds");if(opts.length>2){a.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";a.style.gap="6px";}for(const o of opts){const b=button("",()=>vote?transact("vote",{event_id:e.id,side:o.key},"Σημερινά αποτελέσματα","Η ψήφος καταχωρίστηκε."):choose(e,o.key),"pick "+(o.key==="no"?"no":"yes")+(!vote&&picks.get(e.id)===o.key?" selected":""));b.style.minWidth="0";b.style.padding="9px 4px";if(opts.length>2)b.style.fontSize="12px";if(!vote)b.setAttribute("aria-pressed",String(picks.get(e.id)===o.key));b.append(el("span",o.label));if(!vote)b.append(el("b",odds(o.odds)));a.append(b);}return a;}
function eventName(name){return String(name||"").replace("Νωπές πατάτες στην ώρα τους","Θα είναι οι νωπές πατάτες έτοιμες στην ώρα τους για τα δρομολόγια;").replace("Ώρα αποχώρησης","Ώρα λήξης εργασίας");}
let casinoMode="menu",casinoStake=10,casinoPending=null;
function drawPanel(){const c=card(),draws=state.casino?.draws||[];c.append(el("h3","🎁 Ημερήσια κλήρωση · 500 μάρκες"),el("p","Αυτόματα στις 12:00 · χωρίς ποντάρισμα","muted"));if(draws.length){c.append(el("p",draws[0].day+" · "+draws[0].winner_name));const d=el("details"),summary=el("summary","Ιστορικό νικητών");d.append(summary);for(const x of draws)d.append(el("p",x.day+" · "+x.winner_name+" · 500"));c.append(d);}}
async function casinoMove(operation,extra={}){if(busy)return;const payload={operation,...extra};const key=JSON.stringify(payload);if(casinoPending&&casinoPending.key!==key){notice("Επανάλαβε πρώτα την προηγούμενη ενέργεια.");return;}if(!casinoPending)casinoPending={key,id:crypto.randomUUID()};busy=true;revision++;const machine=operation==="slots"?screen.querySelector(".casino-machine"):null,spin=operation==="slots"?screen.querySelector(".casino-slots .casino-controls .primary"):null;if(machine){machine.classList.add("casino-spinning");machine.setAttribute("aria-busy","true");}if(spin){spin.disabled=true;spin.textContent="Περιστροφή…";}try{const oldRound=state.casino?.round?.id;state=await api("casino",{...payload,request_id:casinoPending.id});const updated=state.casino?.round;if(updated&&updated.id!==oldRound&&casinoExtraGames[updated.kind])casinoFreshRound=updated.id;casinoPending=null;busy=false;clock();show("Καζίνο");}catch(e){if(e.status&&e.status<500)casinoPending=null;notice(e.message);}finally{busy=false;if(machine){machine.classList.remove("casino-spinning");machine.removeAttribute("aria-busy");}if(spin){spin.disabled=false;spin.textContent="SPIN";}}}
const casinoRanks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],casinoSuits=["♠","♥","♦","♣"],casinoSymbols=["🍒","🍋","🍊","🍇","🍉","🔔","★","7"],casinoSymbolNames=["Κεράσια","Λεμόνι","Πορτοκάλι","Σταφύλι","Καρπούζι","Καμπάνα","Αστέρι","Επτά"];
function casinoCard(n){return casinoRanks[(n-1)%13]+casinoSuits[Math.floor((n-1)/13)];}
function casinoPlayingCard(n){const valid=Number.isInteger(n)&&n>=1&&n<=52,rank=valid?casinoRanks[(n-1)%13]:"",suit=valid?casinoSuits[Math.floor((n-1)/13)]:"",p=el("div",undefined,"casino-playing-card"+(!valid?" casino-card-back":(suit==="♥"||suit==="♦"?" casino-card-red":"")));p.setAttribute("role","img");p.setAttribute("aria-label",valid?casinoCard(n):"Κλειστό φύλλο");if(valid){p.append(el("span",rank+" "+suit,"casino-card-corner"),el("span",suit,"casino-card-suit"),el("span",rank+" "+suit,"casino-card-corner casino-card-bottom"));}else p.append(el("span","♠","casino-back-mark"));return p;}
function casinoHandTotal(cards){let total=0,aces=0;for(const n of cards){if(!Number.isInteger(n)||n<1||n>52)continue;const rank=(n-1)%13+1;total+=Math.min(rank,10);if(rank===1)aces++;}if(aces&&total+10<=21)total+=10;return total;}
function casinoHand(cards,hidden=false){const row=el("div",undefined,"casino-hand");for(const n of cards)row.append(casinoPlayingCard(n));if(hidden)row.append(casinoPlayingCard(null));if(!hidden&&cards.some(n=>Number.isInteger(n)&&n>=1&&n<=52)){const total=el("span","Σύνολο: "+casinoHandTotal(cards),"casino-hand-total");row.append(total);}return row;}
function casinoReels(reels=[]){const board=el("div",undefined,"casino-machine"),windows=el("div",undefined,"casino-reels");windows.setAttribute("aria-label","Τρεις κύλινδροι · μόνο η μεσαία γραμμή μετράει");for(let i=0;i<3;i++){const n=reels[i],valid=Number.isInteger(n)&&n>=1&&n<=8,column=el("div",undefined,"casino-reel-column"),strip=el("div",undefined,"casino-reel-strip");for(const offset of [-1,0,1]){const v=valid?((n-1+offset+8)%8)+1:null,cell=el("div",undefined,"casino-reel"+(offset===0?" casino-payline":" casino-decorative")),symbol=el("span",v?casinoSymbols[v-1]:"—","casino-symbol"+(v===8?" casino-seven":v===7?" casino-star":""));if(offset===0){cell.setAttribute("role","img");cell.setAttribute("aria-label",valid?casinoSymbolNames[n-1]:"Χωρίς αποτέλεσμα");}else cell.setAttribute("aria-hidden","true");cell.append(symbol);strip.append(cell);}column.append(strip);windows.append(column);}board.append(windows,el("small","Μόνο η μεσαία γραμμή μετράει · πάνω και κάτω διακοσμητικά","casino-payline-label"));return board;}
function casinoMetric(label,value){const m=el("div",undefined,"casino-metric");m.append(el("small",label),el("strong",value));return m;}

const casinoExtraGames={
 roulette:{icon:"🎡",title:"Ρουλέτα",subtitle:"Ευρωπαϊκός τροχός · 0–36",choices:[["roulette_red","Κόκκινο"],["roulette_black","Μαύρο"]],start:"Περιστροφή",rules:"37 ισοπίθανοι αριθμοί (0–36). Κόκκινο ή μαύρο: 18/37 πιθανότητα σωστής επιλογής, επιστροφή 2×. Το 0 και το αντίθετο χρώμα επιστρέφουν 0."},
 dice:{icon:"🎲",title:"Ζάρια",subtitle:"Δύο ζάρια · κάτω ή πάνω από 7",choices:[["dice_low","Κάτω από 7"],["dice_high","Πάνω από 7"]],start:"Ρίξε τα ζάρια",rules:"Δύο ανεξάρτητα δίκαια ζάρια. Άθροισμα 2–6 ή 8–12: 15/36 πιθανότητα ανά επιλογή, επιστροφή 2× αν είναι σωστή. Άθροισμα 7: 6/36, επιστροφή 1×. Αλλιώς 0."},
 coin:{icon:"🪙",title:"Κορώνα ή γράμματα",subtitle:"Δύο όψεις · 50/50",choices:[["coin_heads","Κορώνα"],["coin_tails","Γράμματα"]],start:"Ρίξε το νόμισμα",rules:"Οι δύο όψεις είναι ισοπίθανες (1/2). Σωστή επιλογή: επιστροφή 2×. Λανθασμένη: 0."},
 scratch:{icon:"🎫",title:"Ξυστό",subtitle:"Τρία σύμβολα · αποκάλυψη",choices:[],start:"Νέο ξυστό",rules:"Τρία ανεξάρτητα σύμβολα από τέσσερα ισοπίθανα. Τρία ίδια: 4/64, επιστροφή 6×. Ακριβώς δύο ίδια: 36/64, επιστροφή 1×. Όλα διαφορετικά: 24/64, επιστροφή 0. Η αποκάλυψη δεν επηρεάζει το αποτέλεσμα."},
 hilo:{icon:"🃏",title:"Hi-Lo",subtitle:"Μεγαλύτερο ή μικρότερο από 7",choices:[["hilo_low","Μικρότερο"],["hilo_high","Μεγαλύτερο"]],start:"Τράβηξε φύλλο",rules:"Σύγκριση με σταθερό φύλλο 7. Άσος χαμηλά, ρήγας ψηλά. Μικρότερο ή μεγαλύτερο: 6/13 πιθανότητα ανά επιλογή, επιστροφή 2× αν είναι σωστή. Ίση αξία: 1/13, επιστροφή 1×. Αλλιώς 0."},
 wheel:{icon:"🎯",title:"Τροχός της τύχης",subtitle:"Οκτώ ισοπίθανοι τομείς",choices:[],start:"Περιστροφή",rules:"Οκτώ ισοπίθανοι τομείς: τρεις με επιστροφή 0×, τρεις με 1×, ένας με 2× και ένας με 3×. Η επιστροφή περιλαμβάνει το αρχικό ποντάρισμα."}
};
let casinoExtraChoice={},casinoFreshRound=null,casinoScratchRound=null,casinoScratchRevealed=new Set();
const casinoRouletteNumbers=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26],casinoRedNumbers=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]),casinoWheelReturns=[0,0,0,1,1,1,2,3],casinoScratchSymbols=["★","◆","●","♣"];
function casinoWheelGraphic(mode,index,hasResult){
 const values=mode==="roulette"?casinoRouletteNumbers:casinoWheelReturns;
 const colors=values.map((n,i)=>mode==="roulette"?(n===0?"#197d58":casinoRedNumbers.has(n)?"#ad3340":"#20252f"):["#394b63","#50627e","#394b63","#1b735f","#267e77","#216454","#2861a0","#76568b"][i]);
 const board=el("div",undefined,"casino-wheel-board"),pointer=el("div","▼","casino-wheel-pointer"),disc=el("div",undefined,"casino-wheel-disc"),step=360/values.length;
 disc.style.background="conic-gradient(from "+(-step/2)+"deg,"+colors.map((c,i)=>c+" "+(i*step)+"deg "+((i+1)*step)+"deg").join(",")+")";
 const rotation=hasResult&&index>=0?-index*step:0;disc.style.setProperty("--wheel-rotation",rotation+"deg");disc.style.transform="rotate("+rotation+"deg)";
 for(let i=0;i<values.length;i++){const label=el("span",String(values[i])+(mode==="wheel"?"×":""),"casino-wheel-number");label.style.setProperty("--wheel-angle",(i*step)+"deg");disc.append(label);}
 const center=el("div",hasResult?String(values[index])+(mode==="wheel"?"×":""):"—","casino-wheel-center");center.setAttribute("aria-hidden","true");board.append(disc,center,pointer);board.setAttribute("aria-hidden","true");return board;
}
function casinoExtraVisual(mode,r){
 const v=r?.reels||[],ready=r?.kind===mode&&r.status==="settled",box=el("div",undefined,"casino-extra-visual casino-extra-"+mode);let label="Δεν υπάρχει αποτέλεσμα.";
 if(ready&&casinoFreshRound===r.id){box.classList.add("casino-fresh");casinoFreshRound=null;}
 if(mode==="roulette"){const n=ready?v[0]:null,i=casinoRouletteNumbers.indexOf(n);box.append(casinoWheelGraphic(mode,i,ready&&i>=0));if(ready)label=n===0?"0 · Πράσινο":n+" · "+(casinoRedNumbers.has(n)?"Κόκκινο":"Μαύρο");}
 else if(mode==="wheel"){const i=ready?v[0]-1:-1;box.append(casinoWheelGraphic(mode,i,ready&&i>=0&&i<8));if(ready)label="Επιστροφή "+v[1]+"×";}
 else if(mode==="dice"){const row=el("div",undefined,"casino-dice-row");for(let i=0;i<2;i++){const n=ready?v[i]:i+1;const die=el("div",Number.isInteger(n)&&n>=1&&n<=6?String.fromCodePoint(0x267f+n):"—","casino-die");die.setAttribute("aria-hidden","true");row.append(die);}box.append(row);if(ready)label="Άθροισμα: "+(v[0]+v[1]);}
 else if(mode==="coin"){const coin=el("div",undefined,"casino-coin-face casino-coin-bimetal");const face=el("div",undefined,"casino-coin-inner");face.append(el("strong",ready&&v[0]===1?"ΕΥΡΩΠΗ":"2"),el("small",ready&&v[0]===1?"ΚΟΡΩΝΑ":"EURO"));coin.append(face);box.append(coin,el("small","Σχηματική απεικόνιση κέρματος 2€ · μόνο εικονικές μάρκες","casino-scratch-note"));if(ready)label=v[0]===1?"Κορώνα":"Γράμματα";}
 else if(mode==="hilo"){const row=el("div",undefined,"casino-hilo-row");for(const [caption,value] of [["Σημείο αναφοράς",7],["Αποτέλεσμα",ready?v[0]:null]]){const cell=el("div",undefined,"casino-hilo-cell");cell.append(el("small",caption),casinoPlayingCard(value));row.append(cell);}box.append(row);if(ready){const rank=(v[0]-1)%13+1;label=casinoCard(v[0])+" · "+(rank===7?"Ίσο":rank<7?"Μικρότερο":"Μεγαλύτερο");}}
 else if(mode==="scratch"){
  const row=el("div",undefined,"casino-scratch-grid");
  if(ready&&casinoScratchRound!==r.id){casinoScratchRound=r.id;casinoScratchRevealed=new Set();}
  const cells=[];
  function reveal(i){if(!ready||casinoScratchRevealed.has(i))return;casinoScratchRevealed.add(i);const cell=cells[i];cell.classList.add("revealed");cell.querySelector("canvas")?.remove();cell.setAttribute("aria-label","Σύμβολο "+(i+1)+": "+(casinoScratchSymbols[v[i]-1]||"—"));}
  for(let i=0;i<3;i++){
   const shown=ready&&casinoScratchRevealed.has(i),cell=button("",e=>{if(e.detail===0)reveal(i);},"casino-scratch-cell"+(shown?" revealed":""));cell.disabled=!ready;cell.setAttribute("aria-label",shown?"Σύμβολο "+(i+1):"Ξύσε ή πάτησε Enter για αποκάλυψη "+(i+1));cell.dataset.scratchIndex=String(i);cell.append(el("span",ready?casinoScratchSymbols[v[i]-1]:"—","casino-scratch-symbol"));
   if(!shown){const foil=el("canvas",undefined,"casino-scratch-foil");foil.width=128;foil.height=128;const ctx=foil.getContext("2d");if(ctx){ctx.fillStyle="#aebbc9";ctx.fillRect(0,0,128,128);ctx.strokeStyle="#cdd6df";ctx.lineWidth=5;for(let x=-128;x<256;x+=12){ctx.beginPath();ctx.moveTo(x,128);ctx.lineTo(x+128,0);ctx.stroke();}ctx.fillStyle="#43576c";ctx.font="bold 20px sans-serif";ctx.textAlign="center";ctx.fillText("ΞΥΣΕ",64,70);}cell.append(foil);}
   cells.push(cell);row.append(cell);
  }
  let dragging=false,last=null;
  function scratch(e){const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-scratch-index]");if(!cell||!row.contains(cell)){last=null;return;}const i=Number(cell.dataset.scratchIndex),foil=cell.querySelector("canvas");if(!foil){last=null;return;}const ctx=foil.getContext("2d");if(!ctx){reveal(i);return;}const rect=foil.getBoundingClientRect();if(!rect.width||!rect.height)return;const x=(e.clientX-rect.left)*128/rect.width,y=(e.clientY-rect.top)*128/rect.height;ctx.globalCompositeOperation="destination-out";ctx.lineWidth=26;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(last?.i===i?last.x:x,last?.i===i?last.y:y);ctx.lineTo(x+.01,y);ctx.stroke();last={i,x,y};const pixels=ctx.getImageData(0,0,128,128).data;let cleared=0;for(let p=3;p<pixels.length;p+=64)if(pixels[p]===0)cleared++;if(cleared>=pixels.length/64*.48){reveal(i);last=null;}}
  row.addEventListener("pointerdown",e=>{if(!ready)return;dragging=true;last=null;scratch(e);try{row.setPointerCapture(e.pointerId);}catch{}});
  row.addEventListener("pointermove",e=>{if(dragging)scratch(e);});
  for(const event of ["pointerup","pointercancel","lostpointercapture"])row.addEventListener(event,()=>{dragging=false;last=null;});
  box.append(row,el("small",ready?"Τρίψε την ασημί επιφάνεια ή επίλεξε Αποκάλυψη όλων.":"Πάτησε Νέο ξυστό για να δημιουργηθεί το αποτέλεσμα.","casino-scratch-note"));const pay=el("div",undefined,"casino-scratch-pay");for(const [symbols,label] of [["★ ★ ★","3 ίδια · 6×"],["◆ ◆ ●","2 ίδια · 1×"],["★ ◆ ●","3 διαφορετικά · 0×"]]){const line=el("div",undefined,"casino-scratch-pay-row");line.append(el("strong",symbols),el("small",label));pay.append(line);}box.append(pay);
  if(ready){const revealAll=button("Αποκάλυψη όλων",()=>{for(let i=0;i<3;i++)reveal(i);},"secondary casino-reveal-all");box.append(revealAll);label="Το αποτέλεσμα έχει καταχωριστεί.";}
 }
 const outcome=el("p",label,"casino-extra-outcome");outcome.setAttribute("aria-live","polite");box.append(outcome);return box;
}
function casinoExtraPanel(mode,c,r,open){
 const def=casinoExtraGames[mode],panel=el("div",undefined,"casino-game-body");panel.append(casinoExtraVisual(mode,r));
 if(r?.kind===mode&&r.status==="settled"){const result=el("div",undefined,"casino-result");result.append(casinoMetric("Ποντάρισμα",fmt(r.stake)),casinoMetric("Επιστροφή",fmt(r.paid)));panel.append(result);}
 const remaining=Math.max(0,500-c.wagered),hasLimit=Number.isInteger(c.extra_count)&&c.extra_count<20;
 const controls=el("div",undefined,"casino-controls"),field=el("label","Ποντάρισμα 10–100","casino-stake"),input=el("input");input.type="number";input.min="10";input.max="100";input.step="1";input.inputMode="numeric";input.value=casinoStake;input.setAttribute("aria-label","Ποντάρισμα");field.append(input);
 const pick=()=>def.choices.length?casinoExtraChoice[mode]:mode;
 const valid=()=>!busy&&!open&&c.enabled&&hasLimit&&Number.isInteger(casinoStake)&&casinoStake>=10&&casinoStake<=Math.min(100,remaining,c.available)&&!!pick();
 const submit=button(def.start,async()=>{if(!valid())return;submit.disabled=true;await casinoMove(pick(),{stake:casinoStake});if(submit.isConnected)sync();},"primary");
 const sync=()=>{submit.disabled=!valid();};
 input.addEventListener("input",()=>{casinoStake=Number(input.value);sync();});
 if(def.choices.length){const choices=el("div",undefined,"casino-extra-choices");choices.setAttribute("role","group");choices.setAttribute("aria-label","Επιλογή αποτελέσματος");const buttons=[];for(const [op,title] of def.choices){const b=button(title,()=>{if(busy)return;casinoExtraChoice[mode]=op;for(const [key,btn] of buttons){const yes=key===op;btn.setAttribute("aria-pressed",String(yes));btn.classList.toggle("primary",yes);}sync();},casinoExtraChoice[mode]===op?"primary":"secondary");b.setAttribute("aria-pressed",String(casinoExtraChoice[mode]===op));buttons.push([op,b]);choices.append(b);}panel.append(choices);}
 controls.append(field,submit);panel.append(controls);sync();
 if(!hasLimit||remaining<10||c.available<10||!c.enabled)panel.append(el("small",!hasLimit?"Δεν υπάρχουν διαθέσιμοι γύροι ή ο συγχρονισμός εκκρεμεί.":"Μη διαθέσιμο ποντάρισμα ή ημερήσιο όριο.","muted"));
 const rules=el("details",undefined,"casino-rules");rules.append(el("summary","Κανόνες και πιθανότητες"),el("p",def.rules,"muted"),el("small","Μόνο εικονικές μάρκες. Η επιστροφή περιλαμβάνει το ποντάρισμα. Δεν απαιτείται να χρησιμοποιήσεις τα διαθέσιμα όρια.","muted"));rules.append(casinoChancePanel(mode));panel.append(rules);return panel;
}

const casinoChance={slots:["34,375%","0%","65,625%"],roulette:["48,65%","0%","51,35%"],dice:["41,67%","16,67%","41,67%"],coin:["50%","0%","50%"],scratch:["6,25%","56,25%","37,50%"],hilo:["46,15%","7,69%","46,15%"],wheel:["25%","37,50%","37,50%"]};
function casinoChancePanel(mode){const box=el("div",undefined,"casino-chance");box.append(el("small","Πιθανότητες ανά γύρο","casino-chance-title"));if(mode==="blackjack"){box.append(el("p","Η πιθανότητα νίκης μεταβάλλεται ανάλογα με τα φύλλα και τις αποφάσεις σου.","muted"));return box;}const row=el("div",undefined,"casino-chance-grid");["Καθαρό κέρδος","Ισοπαλία","Απώλεια"].forEach((label,i)=>row.append(casinoMetric(label,casinoChance[mode][i])));box.append(row);return box;}
function casinoCenter(mode){requestAnimationFrame(()=>{const active=screen.querySelector('.casino-game[data-game="'+mode+'"]');if(!active||!active.isConnected)return;const rect=active.getBoundingClientRect(),nav=$("tabs").getBoundingClientRect(),top=window.visualViewport?.offsetTop||0,bottom=Math.min(nav.top,top+(window.visualViewport?.height||window.innerHeight)),height=bottom-top;const delta=rect.height<=height-16?rect.top+rect.height/2-(top+bottom)/2:rect.top-top-8;window.scrollBy({top:delta,behavior:"instant"});});}
function casino(){section("Καζίνο");const c=state.casino;if(!c){notice("Το Καζίνο δεν είναι διαθέσιμο.");return;}const limits=card();limits.classList.add("casino-limits");limits.append(el("small","Διαθέσιμες εικονικές μάρκες"),el("strong",fmt(c.available),"casino-balance"));const metrics=el("div",undefined,"casino-metrics");metrics.classList.add("casino-four-limits");metrics.append(casinoMetric("Ποντάρισμα",Math.max(0,500-c.wagered)+"/500"),casinoMetric("Blackjack",Math.max(0,10-c.blackjack_count)+"/10"),casinoMetric("Φρουτάκια",Math.max(0,20-c.slot_count)+"/20"),casinoMetric("Λοιπά παιχνίδια",Number.isInteger(c.extra_count)?Math.max(0,20-c.extra_count)+"/20":"—"));limits.append(metrics,el("small","Εναπομείναντα όρια σήμερα · Ανανέωση 00:00 · Χωρίς πραγματικά χρήματα ή εξαργύρωση.","casino-note"));
const r=c.round,open=r?.status==="open";if(open)casinoMode="blackjack";
for(const mode of ["blackjack","slots",...Object.keys(casinoExtraGames)]){const bj=mode==="blackjack",active=casinoMode===mode,game=card();game.dataset.game=mode;game.classList.add("casino-game",bj?"casino-bj":mode==="slots"?"casino-slots":"casino-new-game");const def=casinoExtraGames[mode];if(def)game.classList.add("casino-game-"+mode);const toggle=button("",()=>{if(busy)return;menuGo("Καζίνο",()=>{casinoMode=active&&!open?"menu":mode;});if(casinoMode!=="menu")casinoCenter(casinoMode);},"casino-game-toggle");toggle.setAttribute("aria-expanded",String(active));toggle.disabled=open&&!bj;const art=el("div",undefined,"casino-menu-art");art.setAttribute("aria-hidden","true");if(bj){art.append(casinoPlayingCard(1),casinoPlayingCard(25));}else if(def){art.append(el("span",def.icon,"casino-extra-icon"));}else{art.append(el("span","7","casino-menu-seven"),el("span","★","casino-menu-star"));}const words=el("div",undefined,"casino-menu-words");words.append(el("strong",def?def.title:bj?"Blackjack":"Φρουτάκια"),el("small",def?def.subtitle:bj?"Τραπέζι 21 · Τράπουλα":"Τρεις κύλινδροι"));toggle.append(art,words,el("span",active?"⌃":"⌄","casino-chevron"));game.append(toggle);if(!active)continue;if(def){game.append(casinoExtraPanel(mode,c,r,open));continue;}
const panel=el("div",undefined,"casino-game-body"),same=r?.kind===mode;
if(bj){const table=el("div",undefined,"casino-table");table.append(el("div","ΤΡΑΠΕΖΑ","casino-table-label"));table.append(same?casinoHand(r.dealer,open):casinoHand([null,null]));table.append(el("div","BLACKJACK · 21","casino-table-mark"));if(same){r.hands.forEach((h,i)=>{const hand=el("div",undefined,"casino-player-hand"+(open&&i===r.active_hand?" casino-active-hand":""));hand.append(el("div",(r.hands.length>1?"Χέρι "+(i+1):"Τα φύλλα σου")+(open&&i===r.active_hand?" · Σειρά σου":""),"casino-table-label"),casinoHand(h.cards),el("small",fmt(h.bet)+" μάρκες","casino-hand-stake"));table.append(hand);});}else table.append(el("div","Τα φύλλα σου","casino-table-label"),casinoHand([null,null]));panel.append(table);}else panel.append(casinoReels(same?r.reels:[]));
if(same&&r.status==="settled"){const result=el("div",undefined,"casino-result");result.append(casinoMetric("Ποντάρισμα",fmt(r.stake)),casinoMetric("Επιστροφή",fmt(r.paid)));panel.append(result);}
if(open&&bj){const h=r.hands[r.active_hand],extra={round_id:r.id,version:r.version},actions=el("div",undefined,"casino-actions");for(const [op,label] of [["hit","Φύλλο"],["stand","Μένω"],["double","Double"],["split","Split"]]){const b=button(label,()=>casinoMove(op,extra));if(op==="double"||op==="split")b.disabled=h.cards.length!==2||r.day!==c.day||h.bet>Math.min(500-c.wagered,c.available)||(op==="split"&&(r.hands.length!==1||(h.cards[0]-1)%13!==(h.cards[1]-1)%13));actions.append(b);}panel.append(actions);}else{const controls=el("div",undefined,"casino-controls"),field=el("label","Ποντάρισμα 10–100","casino-stake"),input=el("input");input.type="number";input.min="10";input.max="100";input.step="1";input.inputMode="numeric";input.value=casinoStake;input.setAttribute("aria-label","Ποντάρισμα");input.addEventListener("input",()=>{casinoStake=Number(input.value);});field.append(input);const b=button(bj?"Νέα παρτίδα":"SPIN",()=>{if(!Number.isInteger(casinoStake)||casinoStake<10||casinoStake>Math.min(100,500-c.wagered,c.available)){notice("Μη διαθέσιμο ποντάρισμα.");return;}casinoMove(bj?"start":"slots",{stake:casinoStake});},"primary");b.disabled=!c.enabled||Math.min(500-c.wagered,c.available)<10||(bj?c.blackjack_count>=10:c.slot_count>=20);controls.append(field,b);panel.append(controls);}
const details=el("details",undefined,"casino-rules");details.append(el("summary","Κανόνες και αποδόσεις"),el("p",bj?"Η τράπεζα μένει στο 17. Νίκη 2×, ισοπαλία 1×, φυσικό 21 2,5× (στρογγυλοποίηση κάτω). Split μία φορά σε ίδια φύλλα, άσοι ένα φύλλο.":"8 ισοπίθανα σύμβολα ανά κύλινδρο. Δύο ίδια 2×, τρία ίδια 8×, τρία 7 16×. Διαφορετικά 0.","muted"));details.append(casinoChancePanel(mode));panel.append(details);game.append(panel);
}}

function predictionSelectionBar(current){
 const count=picks.size;
 if(!count)return;
 const bar=el("div",undefined,"prediction-selection-bar");
 bar.setAttribute("role","region");bar.setAttribute("aria-label","Επιλογές δελτίου");
 bar.style.bottom=($("tabs").offsetHeight||64)+"px";
 const summary=el("div",count===1?"1 επιλογή · Αρκεί μία":"Επιλογές: "+count,"prediction-selection-summary");
 const actions=el("div",undefined,"prediction-selection-actions");
 const review=button("Παίξε το δελτίο",()=>menuGo("Δελτίο"),"primary");
 const next=current.find(e=>!picks.has(e.id)&&!e.already_bet&&!e.settled&&(e.can_bet??true));
 const more=button(next&&count<6?"Επίλεξε περισσότερες":"Τροποποίηση επιλογών",()=>{
  const target=next&&count<6?next.id:[...picks.keys()][0];
  const cards=[...screen.querySelectorAll("[data-prediction-event]")];
  const item=cards.find(c=>c.dataset.predictionEvent===target);
  if(item){item.scrollIntoView({block:"center",behavior:"auto"});item.querySelector("button")?.focus({preventScroll:true});}
 },"prediction-more");
 actions.append(review,more);bar.append(summary,actions);screen.append(bar);
}
function events(){const g=game();prune();if(state.announcement?.body){const announcement=card();announcement.append(el("h3","📢 Ανακοίνωση Admin"),el("p",state.announcement.body),el("small",messageTime(state.announcement.created_at)));}const open=state.economy_enabled&&g.sync_ok&&g.phase==="open",ev=g.events||[],current=ev.filter(e=>e.open_date===day()),prior=ev.filter(e=>e.date===day()&&e.open_date!==day());
 section("Γεγονότα",g.market_v2?(g.season==="summer"?"Θερινή":"Χειμερινή"):undefined);drawPanel();
 if(!state.economy_enabled){notice("Η οικονομία δεν έχει ενεργοποιηθεί.");return;}
 if(!g.sync_ok)notice("Ο συγχρονισμός εκκρεμεί. Οι ενέργειες είναι προσωρινά κλειστές.");
 if(current.length){section("Προβλέψεις επόμενης εργάσιμης",dateFmt(current[0].date));if(!open)notice("Οι ερωτήσεις είναι διαθέσιμες. Ποντάρισμα 12:00–00:00.");screen.append(el("p","Επίλεξε μόνο όσα γεγονότα θέλεις. Αρκεί και μία απάντηση.","prediction-optional-hint"));for(const e of current){const c=card();c.classList.add("prediction-event");c.dataset.predictionEvent=e.id;c.append(el("h3",e.kind==="attendance"?"👤 "+e.name:eventName(e.kind==="customers"?"Πόσοι πελάτες θα έρθουν στο διάλειμμα (12:00–13:00);":e.kind==="statements"?"Πότε θα βγει η τελευταία κατάσταση;":e.kind==="supervisor_shout"?"Θα φωνάξει κάποιος προϊστάμενος μέχρι τη λήξη του ωραρίου;":e.name)));if(e.already_bet||e.settled){c.append(el("p",e.settled?"Ακυρώθηκε":"✓ Καταχωρίστηκε",e.settled?"event-status muted":"event-status profit"));continue;}if(e.kind==="statements")c.append(el("small","Μέχρι την αναγραφόμενη ώρα","event-hint"));if(open&&(e.can_bet??open))c.append(optionGrid(e));else{const preview=el("div",undefined,"odds");for(const o of marketOptions(e)){const x=button(o.label+" · "+odds(o.odds),()=>{},"pick");x.disabled=true;preview.append(x);}c.append(preview);}}if(open&&!g.market_v2&&current.length<7&&g.workers?.length){const c=card(),sel=el("select");for(const w of g.workers){const o=el("option",w.name);o.value=w.id;sel.append(o);}c.append(el("h3","Πρόσθεσε εργαζόμενο"),sel,button("Προσθήκη",()=>transact("add_event",{worker_id:sel.value},"Γεγονότα"),"primary"));}if(open)predictionSelectionBar(current);}
 else notice(g.phase==="closed"?"Δεν υπάρχουν στοιχήματα σήμερα.":g.market_v2?"Οι νέες ερωτήσεις εμφανίζονται στις 10:00 και τα στοιχήματα ανοίγουν στις 12:00.":"Τα νέα στοιχήματα ανοίγουν στις 12:00.");
 {const c=card(),n=prior.filter(e=>!e.voted&&!e.settled).length;c.append(el("h3","Τι έγινε σήμερα;"),el("small",n+" ερωτήσεις απομένουν για επιβεβαίωση"),button("Σημερινά αποτελέσματα",()=>menuGo("Σημερινά αποτελέσματα"),"primary"));}
 const gains=card(),settled=(g.tickets||[]).filter(t=>t.settled_at&&new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t.settled_at))===day()),net=settled.reduce((sum,t)=>sum+Number(t.paid||0)-Number(t.stake||0),0);gains.append(el("h3","Κέρδη ημέρας"),el("p",(net>0?"+":"")+fmt(net)+" 🪙",net>=0?"profit":"muted"),el("small",settled.length+" εκκαθαρισμένα δελτία · καθαρό αποτέλεσμα"));
}
function todayResults(){const g=game(),prior=(g.events||[]).filter(e=>e.date===day()&&e.open_date!==day()),done=prior.filter(e=>e.voted||e.settled).length;section("Τι έγινε σήμερα;",done+"/"+prior.length+" απαντημένες");if(!state.economy_enabled){notice("Η οικονομία δεν έχει ενεργοποιηθεί.");return;}const purpose=card();purpose.style.cssText="border:2px solid #6ce0ac;background:#163b32;color:#e5fff2;padding:14px;";const purposeTitle=el("h3","📢 Απάντησε τι πραγματικά έγινε");purposeTitle.style.cssText="color:#b4ffdb;font-size:16px;font-weight:800;margin:0 0 6px;";const purposeText=el("p","Οι απαντήσεις σου είναι απαραίτητες για να εκκαθαριστούν σωστά τα δελτία και να πληρωθούν οι νικητές.");purposeText.style.cssText="margin:0;line-height:1.45;font-weight:600;";purpose.append(purposeTitle,purposeText);screen.append(purpose);notice("12:00–17:30 · Πληρωμές 17:30 · Απάντησε μόνο όταν γνωρίζεις το αποτέλεσμα.");if(!prior.length){notice("Δεν υπάρχουν σημερινές ερωτήσεις.");return;}const questions={potatoes:"🥔 Ήρθαν οι νωπές πατάτες στην ώρα τους;",customers:"🛒 Πόσοι πελάτες ήρθαν στο διάλειμμα (12:00–13:00);",statements:"📋 Πότε βγήκε η τελευταία κατάσταση;",supervisor_shout:"📢 Φώναξε κάποιος προϊστάμενος μέχρι τη λήξη του ωραρίου;",departure_time:"🏠 Ποια ώρα τελείωσε η εργασία;"};const ordered=prior.slice().sort((a,b)=>Number(a.voted||a.settled)-Number(b.voted||b.settled));for(const e of ordered){const c=card();c.style.padding="12px";c.append(el("h3",e.kind==="attendance"?"👤 Ήρθε ο/η "+e.name+";":questions[e.kind]||e.name));if(e.settled)c.append(el("p",e.result===null?"Ακυρώθηκε":(e.kind==="attendance"?(e.result==="yes"?"Ήρθε":e.result==="no"?"Δεν ήρθε":e.result):(marketOption(e,e.result)?.label||e.result)),"muted"));else if(e.voted)c.append(el("small","✓ Απαντήθηκε","profit"));else if(g.sync_ok&&e.can_vote){const grid=el("div",undefined,"odds");grid.style.gridTemplateColumns="repeat(2,minmax(0,1fr))";grid.style.gap="8px";for(const o of marketOptions(e)){const label=e.kind==="attendance"?(o.key==="yes"?"Ήρθε":o.key==="no"?"Δεν ήρθε":o.label):o.label;const btn=button(label,async()=>{if(busy)return;for(const x of grid.querySelectorAll("button"))x.disabled=true;btn.textContent="Καταχώριση…";try{await transact("vote",{event_id:e.id,side:o.key},"Σημερινά αποτελέσματα","Η ψήφος καταχωρίστηκε.");}finally{if(grid.isConnected){btn.textContent=label;for(const x of grid.querySelectorAll("button"))x.disabled=false;}}},"pick "+(o.key==="no"?"no":"yes"));btn.style.minHeight="48px";btn.style.padding="10px 6px";btn.style.whiteSpace="normal";btn.style.overflowWrap="anywhere";btn.style.fontSize="14px";grid.append(btn);}c.append(grid);}else c.append(el("small",!g.sync_ok?"Ο συγχρονισμός εκκρεμεί.":"Ψηφοφορία 12:00–17:30."));}if(done===prior.length)notice("✓ Όλες οι ερωτήσεις ολοκληρώθηκαν.");}
function marketReturn(amount,chosen){let num=BigInt(amount),den=1n;for(const e of chosen){const o=marketOption(e,picks.get(e.id));if(!o)return 0;num*=BigInt(Math.round(Number(o.odds)*100));den*=100n;}return Math.min(10000,Number(num/den));}
let ticketBatchDraft=null;
function ticketDraftFor(chosen){
 const key=String(state.player.id)+":"+day()+":"+chosen.map(e=>e.id).sort().join("|");
 if(!ticketBatchDraft||ticketBatchDraft.key!==key)ticketBatchDraft={key,count:1,groupOf:new Map(),stakes:[10,10,10]};
 return ticketBatchDraft;
}
function ticketPlan(chosen,draft,limit,singleStake){
 const count=draft.count,groups=Array.from({length:count},()=>[]);
 for(const e of chosen){const index=count===1?0:draft.groupOf.get(e.id);if(!Number.isInteger(index)||index<0||index>=count)return {valid:false,groups,tickets:[],total:0};groups[index].push(e);}
 const tickets=groups.map((group,i)=>({ids:group.map(e=>e.id),sides:group.map(e=>picks.get(e.id)),stake:count===1?Number(singleStake):Number(draft.stakes[i])}));
 const total=tickets.reduce((sum,t)=>sum+t.stake,0),ids=tickets.flatMap(t=>t.ids);
 const valid=count>=1&&count<=3&&ids.length===new Set(ids).size&&tickets.every(t=>t.ids.length>=1&&t.ids.length<=6&&t.sides.every(v=>typeof v==="string")&&Number.isSafeInteger(t.stake)&&t.stake>=10&&t.stake<=1000)&&Number.isSafeInteger(total)&&total<=limit;
 return {valid,groups,tickets,total};
}
function ticket(){const g=game();prune();section("Το δελτίο μου",picks.size+" επιλογές");const chosen=eligibleEvents().filter(e=>picks.has(e.id));
 if(chosen.length){
  const draft=ticketDraftFor(chosen),c=card();
  c.append(button("← Επιστροφή στις επιλογές",()=>{if(predictionsNavDepth>0)moreBack();else menuGo("Γεγονότα");},"prediction-more"));
  if(chosen.length>=2){
   const choices=el("div",undefined,"actions");choices.setAttribute("role","group");choices.setAttribute("aria-label","Αριθμός δελτίων");
   for(let n=1;n<=Math.min(3,chosen.length);n++){const b=button(n===1?"1 δελτίο":n+" δελτία",()=>{if(busy||draft.count===n)return;draft.count=n;draft.groupOf=new Map(chosen.map((e,i)=>[e.id,i%n]));show("Δελτίο");},draft.count===n?"primary":"secondary");b.setAttribute("aria-pressed",String(draft.count===n));choices.append(b);}
   c.append(choices);if(draft.count>1)c.append(el("small","Μοίρασε τις επιλογές σου σε διαφορετικά δελτία. Κάθε ερώτηση χρησιμοποιείται μία φορά."));
  }
  let mult=1;const update=()=>calc();
  for(const e of chosen){
   const o=marketOption(e,picks.get(e.id));mult*=Number(o.odds);
   const r=el("div",undefined,"ticket-line"),info=el("div");info.style.minWidth="0";
   const name=eventName(e.kind==="customers"?"Πόσοι πελάτες θα έρθουν στο διάλειμμα (12:00–13:00);":e.kind==="statements"?"Πότε θα βγει η τελευταία κατάσταση;":e.kind==="supervisor_shout"?"Θα φωνάξει κάποιος προϊστάμενος μέχρι τη λήξη του ωραρίου;":e.name);
   info.append(el("h3",name),el("small",o.label+" · "+odds(o.odds)));
   if(draft.count>1){const sel=el("select");sel.setAttribute("aria-label","Δελτίο για "+name);sel.style.marginTop="6px";sel.style.maxWidth="100%";for(let i=0;i<draft.count;i++){const opt=el("option","Δελτίο "+(i+1));opt.value=String(i);sel.append(opt);}sel.value=String(draft.groupOf.get(e.id));sel.onchange=()=>{draft.groupOf.set(e.id,Number(sel.value));update();};info.append(sel);}
   const remove=button("×",()=>{if(busy)return;picks.delete(e.id);show("Δελτίο");});remove.setAttribute("aria-label","Αφαίρεση "+name);r.append(info,remove);c.append(r);
  }
  const inputs=[],details=[],status=el("small","","feedback"),totalText=el("p","","amount");
  const submit=button(draft.count===1?"Οριστικό ποντάρισμα":"Καταχώριση "+draft.count+" δελτίων",()=>{
   if(busy)return;const plan=calc();if(!plan.valid||!g.sync_ok||g.phase!=="open")return;
   if(draft.count===1)transact("place",plan.tickets[0],"Δελτίο","Το δελτίο καταχωρίστηκε οριστικά.");
   else transact("place_batch",{tickets:plan.tickets},"Δελτίο","Τα "+draft.count+" δελτία καταχωρίστηκαν οριστικά.");
  },"primary");
  if(draft.count===1)c.append(el("small","Συνολική απόδοση "+odds(mult)));
  const inputGrid=el("div");inputGrid.style.display="grid";inputGrid.style.gap="10px";
  for(let i=0;i<draft.count;i++){
   const box=el("div");if(draft.count>1){box.style.border="1px solid var(--line)";box.style.borderRadius="12px";box.style.padding="10px";box.append(el("h3","Δελτίο "+(i+1)));}
   const input=el("input");input.type="number";input.inputMode="numeric";input.min=10;input.max=Math.min(1000,available);input.step=1;input.value=draft.count===1?stake:(draft.stakes[i]??10);input.setAttribute("aria-label","Μάρκες για δελτίο "+(i+1));input.oninput=update;inputs.push(input);
   const detail=el("p","","amount");details.push(detail);box.append(el("label","Ποντάρισμα"),input,el("small","Πιθανή συνολική επιστροφή · μέγ. 10.000"),detail);inputGrid.append(box);
  }
  c.append(inputGrid);if(draft.count>1)c.append(totalText,status);c.append(submit);
  function calc(){
   if(draft.count===1)stake=Number(inputs[0].value);else inputs.forEach((input,i)=>{draft.stakes[i]=Number(input.value);});
   const plan=ticketPlan(chosen,draft,available,stake);
   for(let i=0;i<details.length;i++){const group=plan.groups[i],amount=plan.tickets[i]?.stake;details[i].textContent=group?.length&&Number.isSafeInteger(amount)&&amount>=10&&amount<=1000&&amount<=available?fmt(marketReturn(amount,group))+" 🪙":"—";}
   totalText.textContent="Συνολικό ποντάρισμα: "+(Number.isFinite(plan.total)?fmt(plan.total):"—")+" 🪙";
   status.textContent=plan.groups.some(group=>!group.length)?"Κάθε δελτίο χρειάζεται τουλάχιστον μία επιλογή.":plan.total>available?"Δεν επαρκούν οι διαθέσιμες μάρκες.":!plan.valid?"Έλεγξε τα πονταρίσματα (10–1.000 ανά δελτίο).":"";
   submit.disabled=!plan.valid||!g.sync_ok||g.phase!=="open";return plan;
  }
  calc();
 }else{ticketBatchDraft=null;notice("Επίλεξε τουλάχιστον μία απάντηση για το νέο δελτίο σου.");}
 section("Ιστορικό δελτίων");const history=g.tickets||[];for(let idx=0;idx<history.length;idx++){const t=history[idx],c=card(),profit=Number(t.paid)-Number(t.stake),status=t.settled_at?(profit>0?"Κερδισμένο":profit<0?"Χαμένο":"Επιστροφή"):"Εκκρεμεί",ps=t.picks||[];c.classList.add("history-ticket");const head=el("div",undefined,"history-head");head.append(el("h3","Δελτίο #"+(history.length-idx)),el("span",status,"ticket-status "+(t.settled_at?(profit>0?"profit":profit<0?"loss":"muted"):"pending-status")));c.append(head,el("small",dateFmt(t.created_at?.slice(0,10))));let product=1n,den=1n;for(const p of ps){product*=BigInt(Math.round(Number(p.odds)*100));den*=100n;const row=el("div",undefined,"history-pick"),info=el("div");info.append(el("strong",eventName(p.name)),el("small",p.label||(p.side==="yes"?"Ναι":p.side==="no"?"Όχι":p.side)));row.append(info,el("b",odds(p.odds)));c.append(row);}const summary=el("div",undefined,"history-summary");const total=Number(product)/Number(den),max=Math.min(10000,Number(BigInt(t.stake)*product/den));for(const [label,value] of [["Ποντάρισμα",fmt(t.stake)+" 🪙"],["Συνολική απόδοση",odds(total)],[t.settled_at?"Επιστροφή":"Μέγιστη επιστροφή",fmt(t.settled_at?t.paid:max)+" 🪙"]]){const row=el("div",undefined,"history-total");row.append(el("small",label),el("strong",value));summary.append(row);}c.append(summary);if(t.settled_at)c.append(el("strong",(profit>0?"+":"")+fmt(profit)+" καθαρό αποτέλεσμα",profit>0?"profit":profit<0?"loss":"muted"));}if(!history.length)notice("Δεν έχεις καταχωρίσει ακόμη δελτίο.");
}
function bank(){
 const b=state.bank,me=state.player.id;
 section("Τράπεζα");if(!b){notice("Τα τραπεζικά δεδομένα δεν είναι διαθέσιμα. Κάνε ανανέωση.");return;}
 rows([["Υπόλοιπο",fmt(state.player.chips)+" 🪙"],["Διαθέσιμες μάρκες",fmt(b.available)+" 🪙"],["Δεσμευμένες μάρκες",fmt(Number(state.player.chips)-Number(b.available))+" 🪙"],["Δανείστηκες αυτή την εβδομάδα",fmt(b.borrowed)+" / 300"],["Δάνεισες αυτή την εβδομάδα",fmt(b.lent)+" / 300"],["Επόμενη πίστωση",dateFmt(b.due_date)+" · 1.000 🪙"]]);
 const mine=(b.requests||[]).find(r=>r.borrower===me);
 section("Ζήτησε δάνειο");if(mine){const c=card();c.append(el("h3",fmt(mine.principal)+" 🪙 · Αναμονή αποδοχής"),button("Ακύρωση αιτήματος",()=>transact("bank",{operation:"cancel",id:mine.id},"Τράπεζα","Το αίτημα ακυρώθηκε.")));}else if(b.borrow_available&&300-Number(b.borrowed)>=50){const c=card(),input=el("input");input.type="number";input.min=50;input.max=300-Number(b.borrowed);input.value=Math.min(100,Number(input.max));input.inputMode="numeric";c.append(el("p","Ποσό 50–"+input.max+" μαρκών","muted"),input,button("Δημιουργία αιτήματος",()=>{const n=Number(input.value);if(!Number.isSafeInteger(n)||n<50||n>Number(input.max)){notice("Μη έγκυρο ποσό.");return;}transact("bank",{operation:"request",amount:n},"Τράπεζα","Το αίτημα δημοσιεύθηκε.");},"primary"));}else notice("Δάνειο όταν έχεις έως 100 διαθέσιμες μάρκες για ποντάρισμα και δεν έχεις εξαντλήσει το εβδομαδιαίο όριο των 300.");
 section("Αιτήματα παικτών");const other=(b.requests||[]).filter(r=>r.borrower!==me);if(!other.length)notice("Δεν υπάρχουν ανοιχτά αιτήματα.");for(const r of other){const c=card();c.append(el("h3",r.name),el("p",fmt(r.principal)+" 🪙","amount"));const btn=button("Δάνεισε "+fmt(r.principal)+" μάρκες",()=>{if(!confirm("Να δανείσεις "+r.principal+" μάρκες στον παίκτη "+r.name+";"))return;transact("bank",{operation:"accept",id:r.id},"Τράπεζα","Το δάνειο ολοκληρώθηκε.");},"primary");btn.disabled=Number(b.lend_available??b.available)<r.principal||Number(b.lent)+r.principal>300;c.append(btn);}
 section("Τα δάνειά μου");const loans=b.loans||[];if(!loans.length)notice("Δεν υπάρχουν δάνεια.");for(const l of loans){const c=card(),borrow=l.borrower===me;const outstanding=Number(l.outstanding),interest=Math.ceil(outstanding/10);c.append(el("h3",(borrow?"Οφείλεις στον/στην ":"Δάνεισες στον/στην ")+(borrow?l.lender_name:l.borrower_name)),el("p",l.status==="paid"?"Εξοφλήθηκε · Τόκος "+fmt(l.interest_paid):"Υπόλοιπο "+fmt(outstanding)+" 🪙","muted"));if(l.status==="active"){c.append(el("p","Λήξη "+dateFmt(l.due_date)+" · "+fmt(outstanding+interest)+" μάρκες αν δεν εξοφληθεί","muted"));if(borrow){const max=Math.min(outstanding,Number(b.available));if(max>=1){const input=el("input");input.type="number";input.inputMode="numeric";input.min=1;input.max=max;input.value=max;c.append(input,button("Εξόφληση χωρίς τόκο",()=>{const n=Number(input.value);if(!Number.isSafeInteger(n)||n<1||n>max){notice("Μη έγκυρο ποσό.");return;}if(confirm("Εξόφληση "+n+" μαρκών;"))transact("bank",{operation:"repay",id:l.id,amount:n},"Τράπεζα","Η εξόφληση καταχωρίστηκε.");},"primary"));}else c.append(el("small","Οι προστατευμένες μάρκες δεν χρησιμοποιούνται."));}}}
 notice("Εξόφληση πριν τη Δευτέρα: χωρίς τόκο. Στη λήξη αφαιρούνται από την εβδομαδιαία πίστωση η οφειλή και τόκος 10% (στρογγυλοποίηση προς τα πάνω ανά δάνειο). Μόνο ο τόκος μετρά στην κατάταξη.");
}
function avatar(p,selectedFrame=cosmetics(p.id).frame){let node;if(p.avatar&&/^data:image\/jpeg;base64,/.test(p.avatar)){node=el("img",undefined,"avatar-img");node.src=p.avatar;node.alt="";}else node=el("div",Array.from(p.nickname||"?")[0].toUpperCase(),"initial");const frame=selectedFrame;if(["frame_blue","frame_silver","frame_gold","frame_glow","frame_diamond","frame_legend","frame_fire","frame_electric","frame_galaxy"].includes(frame))node.classList.add(frame);return node;}
function stat(id){return (game().stats||[]).find(x=>x.id===id)||{net:0,wins:0,losses:0,returned:0,staked:0};}
function publicOwned(p){return [...new Set(cosmetics(p.id).collection||[])].map(item).filter(i=>i&&i.category!=="gift");}
function assetValue(p){return R.wealth(0,publicOwned(p)).assets;}
function wealthTotals(p){const t=R.wealth(Number(p.chips||0),publicOwned(p));const node=el("div",undefined,"member-rank-totals wealth-summary");for(const [label,val] of [["Μάρκες",t.chips],["Αποκτήματα",t.assets],["Περιουσία",t.total]]){const b=el("div");b.append(el("small",label),el("strong",fmt(val)+" 🪙"));node.append(b);}return node;}
function ranking(){section("Κατάταξη μελών",(state.players||[]).length+" μέλη");const filters=el("div",undefined,"actions");for(const [key,name] of [["wealth","Περιουσία"],["net","Κέρδη"],["weekly_net","Εβδομάδα"],["monthly_net","Μήνας"]]){const b=button(name,()=>{rankingPeriod=key;show("Κατάταξη");},rankingPeriod===key?"primary":"");filters.append(b);}screen.append(filters);
const owned=publicOwned,assets=assetValue;
const score=p=>rankingPeriod==="wealth"?Number(p.chips||0)+assets(p):Number(stat(p.id)[rankingPeriod]||0);
const players=[...(state.players||[])].sort((a,b)=>score(b)-score(a)||a.nickname.localeCompare(b.nickname,"el"));let rank=0,previous=null;
for(let idx=0;idx<players.length;idx++){const p=players[idx],value=score(p),cp=cosmetics(p.id),collection=owned(p),c=card(),r=el("div",undefined,"member-rank-head"),info=el("div",undefined,"member-rank-name"),v=stat(p.id);if(previous===null||value!==previous)rank=idx+1;previous=value;
const open=()=>menuGo("Προφίλ",()=>{profileTarget=p.id;});r.append(el("strong",rank<=3?["🥇","🥈","🥉"][rank-1]:"#"+rank,"member-rank-position"),avatar(p));info.append(button(p.nickname+(item(cp.trophy)?" "+item(cp.trophy).icon:""),open,"profile-link"),el("small","Επ. "+levelOf(cp)+" · "+(v.wins||0)+" νίκες · "+(v.losses||0)+" ήττες"));r.append(info);c.append(r);
c.classList.add("rank-card");if(rank<=3)c.dataset.rank=String(rank);c.append(wealthTotals(p));if(rankingPeriod!=="wealth")c.append(el("p","Καθαρά κέρδη: "+(value>0?"+":"")+fmt(value)+" 🪙",value>0?"profit":value<0?"loss":"muted"));
const sorted=collection.slice().sort((a,b)=>Number(b.price||0)-Number(a.price||0)||a.name.localeCompare(b.name,"el"));c.append(el("small","Αποκτήματα · "+sorted.length));if(sorted.length){const grid=el("div",undefined,"member-rank-items");for(const i of sorted.slice(0,6)){const b=button("",open,"member-rank-item");b.append((i.level||productPhoto(i.code))?lifePicture(i):el("div",i.icon,"member-rank-emblem"),el("small",i.name));grid.append(b);}c.append(grid);if(sorted.length>6)c.append(el("small","+"+(sorted.length-6)+" ακόμη στο προφίλ","muted"));}else c.append(el("p","Δεν έχει αγοράσει ακόμη αντικείμενα.","rank-empty muted"));c.append(button("Προβολή προφίλ",open));}
notice(rankingPeriod==="wealth"?"Περιουσία = τρέχουσες μάρκες + αξία καταλόγου των αποκτημάτων. Τα ιδιωτικά δώρα δεν εμφανίζονται.":"Οι αρχικές και εβδομαδιαίες πιστώσεις δεν υπολογίζονται ως κέρδη.");}
const premiumAccents={color_blue:"#69b7ff",color_green:"#6ee7a0",color_purple:"#d0a6ff",color_red:"#ff8888",color_pink:"#ffa8dc",color_orange:"#ffbf78",color_cyan:"#8ef1ff",color_silver:"#dce5f0",color_gold:"#ffda77",color_rainbow:"#c6abff"};
const rarityNames=["","Κοινό","Ασυνήθιστο","Σπάνιο","Επικό","Θρυλικό","Μυθικό"];
function profilePrefs(id){try{const v=JSON.parse(localStorage.getItem("profile-prefs:"+id)||"{}");return {favorites:Array.isArray(v.favorites)?v.favorites:[],presets:Array.isArray(v.presets)?v.presets:[]};}catch{return {favorites:[],presets:[]};}}
function saveProfilePrefs(id,v){try{localStorage.setItem("profile-prefs:"+id,JSON.stringify(v));return true;}catch{notice("Δεν είναι διαθέσιμη η τοπική αποθήκευση.");return false;}}
function premiumTier(i){return Math.max(1,Math.min(6,Number(i?.level)||([1000,3000,10000,25000,50000].filter(n=>Number(i?.price)>=n).length+1)));}
function premiumLook(c,ap){for(const k of ["background","effect"])if(item(ap[k])?.category===k)c.classList.add(ap[k]);c.style.setProperty("--profile-accent",premiumAccents[ap.color]||"#78baff");if(item(ap.color)?.category==="color")c.dataset.accent=ap.color;}
function premiumIdentity(p,cp,ap,frame=cp.frame,trophyCode=cp.trophy,candidate=false){
 const c=el("div",undefined,"premium-identity");const orbit=el("div",undefined,"premium-orbit");orbit.append(avatar(p,frame??null));if(frame&&item(frame)?.category==="frame")orbit.dataset.frame=frame;
 const trophy=item(trophyCode);if(trophy?.category==="trophy"){const medal=el("span",trophy.icon,"premium-medal");medal.title=trophy.name;medal.dataset.tier=String(premiumTier(trophy));orbit.append(medal);}
 const name=el("h3",p.nickname,"premium-name");if(item(ap.color)?.category==="color")name.classList.add(ap.color);
 c.append(orbit,name);const title=shownTitle(ap)||(candidate&&ap.title==="title_custom"?"✍️ Ο δικός σου τίτλος":"");if(title)c.append(el("p",title,"profile-title premium-ribbon"));c.append(el("small","Επίπεδο "+levelOf(cp)+" · "+titleOf(cp),"premium-level"));return c;
}
function premiumItem(i,label,large=false){
 const c=el("article",undefined,"premium-object");c.dataset.tier=String(premiumTier(i));if(large)c.classList.add("premium-object-feature");
 const art=(i.level||productPhoto(i.code))?lifePicture(i):el("div",i.icon||"✦","premium-object-emblem");c.append(art);
 const info=el("div",undefined,"premium-object-info");if(label)info.append(el("small",label,"premium-object-label"));info.append(el("strong",i.name),el("small",fmt(i.price)+" 🪙 · "+rarityNames[premiumTier(i)]));
 const rank=el("div",undefined,"premium-rank");rank.setAttribute("aria-label","Βαθμίδα "+premiumTier(i)+" από 6");for(let j=0;j<6;j++){const dot=el("span");if(j<premiumTier(i))dot.classList.add("lit");rank.append(dot);}info.append(rank);c.append(info);return c;
}
function premiumCollections(p,cp,own,all,root=screen,preview=false){
 const heading=(label,count)=>{const h=el("div",undefined,"section-head");h.append(el("h2",label));if(count)h.append(el("span",count,"count"));root.append(h);};
 const lifestyleItems=all.filter(i=>!appearanceKeys.includes(i.category));
 heading(own?"Η καθημερινότητά μου":"Καθημερινότητα",lifestyleItems.length+" αποκτήματα");
 const categories=el("div",undefined,"premium-category-grid");if(!preview)categories.id="lifeProfileGrid";
 for(const [key,icon,label] of lifeCategories){
  const items=lifestyleItems.filter(i=>i.category===key).sort((a,b)=>Number(b.price)-Number(a.price)),best=items[0];
  const b=preview?el("div",undefined,"premium-category"):button("",()=>lifeDetail(cp,key,label,own),"premium-category");b.setAttribute("aria-label",label+" · "+items.length+" αποκτήματα");b.dataset.tier=String(best?premiumTier(best):0);
  const caption=el("div",undefined,"premium-category-caption");caption.append(el("strong",label),el("small",best?best.name:"Δεν αποκτήθηκε ακόμη"));
  b.append(best?lifePicture(best):el("div",icon,"premium-empty-art"),caption);
  const progress=el("div",undefined,"premium-rank");const levels=new Set(items.map(i=>Number(i.level)).filter(n=>n>=1&&n<=6));for(let j=1;j<=6;j++){const d=el("span");if(levels.has(j))d.classList.add("lit");progress.append(d);}b.append(progress,el("small",items.length+" αποκτήματα"));categories.append(b);
 }root.append(categories);
 if(lifestyleItems.length){heading("Βιτρίνες συλλογής",String(lifestyleItems.length));const order=[["Κατοικία & ανέσεις",["home","amenity"]],["Γκαράζ",["car","motorcycle","bicycle","vehicle"]],["Τεχνολογία & ρολόγια",["phone","technology","watch"]],["Ταξίδια & πολυτέλεια",["travel","luxury"]],["Κατοικίδια & συλλεκτικά",["pet","art","seasonal","donation"]]];const seen=new Set();for(const [label,keys] of order){const owned=lifestyleItems.filter(i=>keys.includes(i.category));if(!owned.length)continue;const shelf=el("section",undefined,"premium-shelf card");shelf.append(el("h3",label));const grid=el("div",undefined,"premium-shelf-grid");for(const i of owned){seen.add(i.code);grid.append(premiumItem(i));}shelf.append(grid);root.append(shelf);}const rest=lifestyleItems.filter(i=>!seen.has(i.code));if(rest.length){const shelf=el("article",undefined,"card");root.append(shelf);shelf.append(el("h3","Λοιπά αποκτήματα"));const grid=el("div",undefined,"premium-shelf-grid");for(const i of rest)grid.append(premiumItem(i));shelf.append(grid);}}
}
function profile(p=state.player){screen.replaceChildren();section("Προφίλ");if(p.id!==state.player.id)screen.append(button("← Πίσω",moreBack,"secondary"));renderFullProfile(screen,p);}
function renderFullProfile(root,p,draft=null){
 const own=p.id===state.player.id,preview=!!draft;
 const heading=(label,count)=>{const h=el("div",undefined,"section-head");h.append(el("h2",label));if(count)h.append(el("span",count,"count"));root.append(h);};
 const makeCard=()=>{const c=el("article",undefined,"card");root.append(c);return c;};
 const actual=cosmetics(p.id),cp=draft?{...actual,frame:draft.frame,trophy:draft.trophy,appearance:{...draft.appearance}}:actual,ap=cp.appearance||{},all=publicOwned(p).sort((a,b)=>Number(b.price)-Number(a.price)),life=all.filter(i=>!appearanceKeys.includes(i.category)),home=life.find(i=>i.category==="home");
 const c=makeCard();c.classList.add("profile","premium-profile");premiumLook(c,ap);c.dataset.tier=String(all.length?Math.max(...all.map(premiumTier)):0);
 const cover=el("div",undefined,"premium-cover");if(home){cover.append(lifePicture(home));const label=el("div",undefined,"premium-cover-label");label.append(el("small","Η κατοικία"),el("strong",home.name));cover.append(label);}else cover.append(el("div",undefined,"premium-cover-lines"));c.append(cover,premiumIdentity(p,cp,ap,cp.frame,cp.trophy,preview));
 const xp=Number(cp.days||0)*10,progress=el("div",undefined,"xp-bar"),fill=el("div");fill.style.width=(xp%100)+"%";progress.append(fill);const experience=el("div",undefined,"premium-xp");experience.append(el("small",xp+" XP · "+(100-xp%100)+" XP για επόμενο επίπεδο"),progress);c.append(experience,wealthTotals(p));
 if(!preview){const actions=el("div",undefined,"premium-actions");
 if(own){const input=el("input");input.type="file";input.accept="image/*";input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file||file.size>15*1024*1024)throw Error("Επίλεξε εικόνα έως 15 MB.");const image=await createImageBitmap(file);const canvas=document.createElement("canvas");canvas.width=canvas.height=256;const s=Math.min(image.width,image.height);canvas.getContext("2d").drawImage(image,(image.width-s)/2,(image.height-s)/2,s,s,0,0,256,256);image.close();let data=canvas.toDataURL("image/jpeg",0.82);if(data.length>100000)data=canvas.toDataURL("image/jpeg",0.60);await api("avatar",{avatar:data});await refresh(true);show("Προφίλ");}catch(e){notice(e.message);}};actions.append(input,button("Αλλαγή φωτογραφίας",()=>input.click(),"primary"),button("Αφαίρεση φωτογραφίας",async()=>{try{await api("avatar",{avatar:null});await refresh(true);show("Προφίλ");}catch(e){notice(e.message);}}));actions.append(button("🎨 Η εμφάνισή μου",()=>menuGo("Η εμφάνισή μου"),"primary"),button("🛍️ Κατάστημα",()=>menuGo("Κατάστημα",()=>{shopTab="menu";})));}else{actions.append(button("🎁 Στείλε ιδιωτικό δώρο",()=>showGiftShop(p),"primary"));if(state.player.is_admin)actions.append(button("Νέο PIN",()=>resetPin(p)));}c.append(actions);}
 if(life.length){heading("Τα ξεχωριστά αποκτήματα");const highlights=el("div",undefined,"premium-highlights"),seen=new Set();for(const [label,keys] of [["Κατοικία",["home"]],["Όχημα",["car","motorcycle","bicycle","vehicle"]],["Τεχνολογία",["phone","technology"]],["Κατοικίδιο",["pet"]],["Άνεση",["amenity"]],["Πολυτέλεια",["luxury","travel","art","watch"]]]){const i=life.find(i=>keys.includes(i.category)&&!seen.has(i.code));if(i){seen.add(i.code);highlights.append(premiumItem(i,label,true));}}if(highlights.children.length)root.append(highlights);}
 if(own&&!preview&&all.length){
 const prefs=profilePrefs(p.id),favorites=new Set(prefs.favorites),box=makeCard();box.append(el("h3","Αγαπημένα αποκτήματα"),el("small","Ιδιωτική λίστα · αποθηκεύεται σε αυτή τη συσκευή."));
 const grid=el("div",undefined,"premium-shelf-grid");for(const i of all){const b=button((favorites.has(i.code)?"★ ":"☆ ")+i.name,()=>{if(favorites.has(i.code))favorites.delete(i.code);else favorites.add(i.code);if(saveProfilePrefs(p.id,{...prefs,favorites:[...favorites]})){b.textContent=(favorites.has(i.code)?"★ ":"☆ ")+i.name;b.setAttribute("aria-pressed",String(favorites.has(i.code)));}});b.setAttribute("aria-pressed",String(favorites.has(i.code)));grid.append(b);}box.append(grid);
 }
 const prestige=makeCard(),tiers=all.filter(i=>premiumTier(i)>=5).length;prestige.append(el("h3","Prestige συλλογής"),el("p",String(all.length)+" αποκτήματα · "+tiers+" θρυλικά ή μυθικά"),el("small","Βασίζεται αποκλειστικά στα δημόσια αποκτήματα, χωρίς οικονομική ανταμοιβή."));
 premiumCollections(p,cp,own,all,root,preview);
 const appearance=all.filter(i=>appearanceKeys.includes(i.category));if(appearance.length){heading("Συλλογή εξατομίκευσης",String(appearance.length));const grid=el("div",undefined,"premium-shelf-grid");for(const i of appearance){const node=premiumItem(i,shopCategories.find(x=>x[0]===i.category)?.[2]);if(equippedCode(cp,i.category)===i.code)node.classList.add("premium-equipped");grid.append(node);}root.append(grid);}
 const earned=el("div",undefined,"premium-achievements");for(const a of cp.achievements||[]){const x=achievementNames[a.code];if(x){const e=el("div",undefined,"premium-achievement");e.append(el("span",x[0]),el("strong",x[1]));earned.append(e);}}if(earned.children.length){heading("Επιτεύγματα");root.append(earned);}
 if(own&&!preview){const gc=makeCard();gc.classList.add("premium-gifts");privateGifts(gc);}
 heading("Στατιστικά");const stats=makeCard();const ps=stat(p.id);for(const [label,value] of [["Νίκες",ps.wins||0],["Ήττες",ps.losses||0],["Καθαρά κέρδη",fmt(ps.net||0)+" 🪙"],["Καθαροί τόκοι",fmt(ps.interest_net||0)+" 🪙"],["Μπόνους αποχωρήσεων",fmt(ps.resignation_bonus||0)+" 🪙"]]){const row=el("div",undefined,"row");row.append(el("span",label),el("strong",String(value)));stats.append(row);}
}
const achievementNames={first_win:["🎯","Πρώτη νίκη"],five_wins:["🔥","5 συνεχόμενες νίκες"],five_pick:["🚀","Κερδισμένο πενταπλό"],departure_win:["🔮","Σωστή μακροχρόνια πρόβλεψη"],ten_loans:["🤝","10 εξοφλημένα δάνεια ως δανειστής"],net_10000:["💰","10.000 καθαρά κέρδη"],five_days:["📅","Συμμετοχή 5 ημερών"],monthly_champion:["🏅","Πρωταθλητής μήνα"]};
const catalogLabels={"pet_fish":"Ψάρια ενυδρείου","home_studio":"Γκαρσονιέρα","car_sedan":"Toyota Corolla","car_cabrio":"Mazda MX-5","vehicle_sport":"Porsche 911","car_super":"Lamborghini Huracán","vehicle_scooter":"Honda PCX 125","vehicle_motorbike":"Honda CB500 Hornet","motor_adventure":"Honda Africa Twin","motor_sport":"Yamaha R7","motor_super":"BMW S 1000 RR","phone_basic":"Samsung Galaxy A16","phone_mid":"Xiaomi Redmi Note 14","phone_advanced":"Samsung Galaxy A56","phone_flagship":"Apple iPhone 16","phone_ultra":"Apple iPhone 16 Pro Max","phone_fold":"Samsung Galaxy Z Fold6","watch_casual":"Casio F-91W","watch_sport":"Casio G-Shock GA-2100","watch_smart":"Garmin Venu 3","watch_premium":"Tissot PRX","watch_luxury":"Omega Seamaster","art_watch":"Rolex Submariner","vehicle_bike":"Ideal Cityrun","bike_mountain":"Cube Aim","bike_gravel":"Cube Nuroad","vehicle_roadbike":"Cube Attain","bike_carbon":"Cube Agree C:62 Pro","bike_pro":"Specialized S-Works Tarmac SL8","tech_laptop":"Lenovo IdeaPad","tech_gaming":"ASUS ROG Gaming PC","tech_premium":"Alienware Gaming Setup","amenity_bbq":"Weber Spirit","amenity_spa":"Bestway Lay-Z-Spa","luxury_jetski":"Sea-Doo Spark","vehicle_jet":"Cessna Citation","color_rainbow":"Ουράνιο τόξο","frame_glow":"Νέον","gift_men_laptop":"Lenovo IdeaPad","gift_men_sneakers":"Nike Air Max","gift_women_spa":"Περιποίηση σπα","gift_women_jewel":"Κόσμημα Swarovski","gift_general_camera":"Canon EOS R50","gift_general_phone":"Samsung Galaxy A16","gift_general_tablet":"Samsung Galaxy Tab A9","gift_general_donut":"Ντόνατ","gift_general_plane":"Αεροπορικό ταξίδι","gift_general_game":"Monopoly","gift_general_music":"Μουσικό δώρο","gift_women_luxurybag":"Τσάντα Michael Kors","seasonal_halloween":"Χάλοουιν","donation_legend":"Μεγάλος υποστηρικτής","vehicle_citycar":"Toyota Yaris","vehicle_suv":"BMW X3","motor_moped":"Honda Super Cub","tech_tablet":"Samsung Galaxy Tab A9","amenity_console":"Sony PlayStation 5","amenity_cinema":"Sony Home Cinema","amenity_garden":"Κήπος με εξοπλισμό Gardena","amenity_gym":"Γυμναστήριο Technogym","amenity_pool":"Πισίνα Intex","amenity_sports":"Ιδιωτικό αθλητικό κέντρο","vehicle_boat":"Olympic 490","luxury_sail":"Beneteau Oceanis","vehicle_yacht":"Azimut Yacht","art_guitar":"Yamaha F310","art_camera":"Canon EOS R50","art_piano":"Yamaha U1","gift_men_watch":"Casio G-Shock","gift_men_car":"Μινιατούρα BMW","gift_men_motorbike":"Μινιατούρα Yamaha","gift_men_glasses":"Ray-Ban Aviator","gift_men_console":"PlayStation 5","gift_men_headphones":"JBL Tune","gift_men_ball":"Μπάλα Adidas","gift_men_bike":"Ποδήλατο Ideal","gift_men_guitar":"Κιθάρα Yamaha","gift_men_wallet":"Πορτοφόλι Tommy Hilfiger","gift_men_shoes":"Παπούτσια Geox","gift_men_backpack":"Σακίδιο Eastpak","gift_men_football":"Μπάλα Nike","gift_men_toolkit":"Εργαλεία Bosch","gift_men_gaming":"Χειριστήριο Xbox","gift_men_grill":"Ψησταριά Weber","gift_women_ring":"Δαχτυλίδι Pandora","gift_women_bag":"Τσάντα Guess","gift_women_heels":"Γόβες Migato","gift_women_perfume":"Chanel Coco Mademoiselle","gift_women_bracelet":"Βραχιόλι Pandora","gift_women_cosmetics":"Καλλυντικά Korres","gift_women_earrings":"Σκουλαρίκια Swarovski","gift_women_necklace":"Κολιέ Pandora","gift_women_makeup":"Maybelline","gift_women_sunglasses":"Γυαλιά Ray-Ban","gift_women_watch":"Ρολόι Michael Kors","gift_general_coffee":"Καφές Λουμίδης","gift_general_chocolate":"Σοκολάτα Lacta","gift_general_tea":"Τσάι Lipton","gift_general_puzzle":"Παζλ Ravensburger","gift_general_icecream":"Παγωτό Κρι Κρι","gift_general_pizza":"Pizza Fan"};
function displayItem(i){return i&&catalogLabels[i.code]?{...i,name:catalogLabels[i.code]}:i;}
const shop=()=>{const sh=state.shop||{};return sh.catalog?{...sh,catalog:sh.catalog.map(displayItem)}:sh;};
const cosmetics=id=>(shop().profiles||[]).find(x=>x.id===id)||{collection:[],achievements:[],days:0};
const item=code=>(shop().catalog||[]).find(x=>x.code===code);
const levelOf=p=>1+Math.floor(Number(p.days||0)/10);
function titleOf(p){const l=levelOf(p);return l>=20?"Θρύλος":l>=10?"Βετεράνος":l>=5?"Έμπειρος":l>=2?"Τακτικός":"Νέος παίκτης";}
let shopTab="menu",giftTarget=null,giftGroup="general";
const lifeCategories=[["home","🏠","Σπίτι"],["car","🚗","Αυτοκίνητο"],["motorcycle","🏍️","Μηχανή"],["pet","🐾","Κατοικίδιο"],["phone","📱","Κινητό"],["watch","⌚","Ρολόι"],["bicycle","🚲","Ποδήλατο"],["technology","💻","Τεχνολογία"],["travel","✈️","Ταξίδια"],["amenity","🏊","Ανέσεις σπιτιού"],["luxury","🛥️","Πολυτέλεια"],["art","🖼️","Συλλεκτικά"]];
const shopCategories=[["gift","🎁","Δώρα"],["trophy","🏆","Τρόπαια"],["color","🎨","Χρώματα"],["frame","⭕","Πλαίσια"],["background","🌅","Φόντα"],["title","👑","Τίτλοι"],["effect","✨","Εφέ"],...lifeCategories,["seasonal","🎄","Εποχιακά"],["donation","🤝","Προσφορές"],["achievements","🏅","Επιτεύγματα"]];
function lifeItems(key){return (shop().catalog||[]).filter(i=>i.category===key&&i.active!==false&&Number(i.level)>0).sort((a,b)=>Number(a.level)-Number(b.level));}
function lifeOwned(cp,key){const codes=new Set(cp.collection||[]);return lifeItems(key).filter(i=>codes.has(i.code)).sort((a,b)=>Number(b.price)-Number(a.price)||Number(b.level)-Number(a.level));}
function productPhoto(code){return typeof PRODUCT_PHOTOS!=="undefined"?PRODUCT_PHOTOS[code]:null;}
function lifePicture(i,icon="🔒"){const wrap=el("div",undefined,"life-picture");if(!i){wrap.append(el("span",icon,"life-lock"));return wrap;}const photo=productPhoto(i.code),fallback=typeof LIFE_ART!=="undefined"&&LIFE_ART[i.code]?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(LIFE_ART[i.code]):"";const img=el("img");img.alt=i.name;img.loading="lazy";img.decoding="async";if(photo){img.title=(photo.representative?"Ενδεικτική εικόνα · ":"")+photo.author+" / "+photo.license+" (Wikimedia Commons)";wrap.classList.add("real-photo");}const fail=()=>{if(fallback&&img.src!==fallback){img.src=fallback;wrap.classList.remove("real-photo");wrap.querySelector(".photo-representative")?.remove();}else{img.remove();wrap.append(el("span",i.icon,"life-lock"));}};img.onerror=fail;if(photo||fallback){img.src=photo?photo.src+"?v="+R.photoVersion(photo.source):fallback;wrap.append(img);if(photo?.representative)wrap.append(el("small","Ενδεικτική εικόνα","photo-representative"));}else wrap.append(el("span",i.icon,"life-lock"));return wrap;}
function photoCredits(){if(resetOpen)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);c.append(el("h2","Πηγές φωτογραφιών"));const photos=typeof PRODUCT_PHOTOS!=="undefined"?PRODUCT_PHOTOS:{};for(const [code,p] of Object.entries(photos)){const row=el("div",undefined,"photo-credit-row");row.append(el("strong",item(code)?.name||code),el("small",(p.representative?"Ενδεικτική εικόνα · ":"")+p.author+" · "+p.license+" · Προσαρμογή μεγέθους / WebP"));for(const [url,label] of [[p.source,"Πρωτότυπη φωτογραφία"],[p.licenseUrl,"Άδεια χρήσης"]]){if(!/^https?:\/\//.test(url||""))continue;const a=el("a",label);a.href=url;a.target="_blank";a.rel="noopener noreferrer";row.append(a);}c.append(row);}if(!Object.keys(photos).length)c.append(el("p","Δεν έχουν εισαχθεί φωτογραφίες ακόμη.","muted"));c.append(button("Κλείσιμο",()=>{m.remove();resetOpen=false;}));}
function lifeDetail(cp,key,label,own){if(resetOpen||busy)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card life-dialog");document.body.append(m);m.append(c);const close=()=>{resetOpen=false;m.remove();};c.append(el("h2",label));const owned=new Set(cp.collection||[]),grid=el("div",undefined,"life-detail-grid");for(const i of lifeItems(key)){const has=owned.has(i.code),b=el("div",undefined,"life-detail-item");b.append(lifePicture(i),el("strong",i.name),el("small",has?"✓ Αποκτήθηκε":fmt(i.price)+" 🪙"));grid.append(b);}c.append(grid);if(own)c.append(button("Στο κατάστημα",()=>{close();menuGo("Κατάστημα",()=>{shopTab=key;});},"primary"));c.append(button("Κλείσιμο",close));}
function lifestyle(cp,own){section(own?"Η καθημερινότητά μου":"Καθημερινότητα","12 κατηγορίες");const grid=el("div",undefined,"life-profile-grid");grid.id="lifeProfileGrid";for(const [key,icon,label] of lifeCategories){const owned=lifeOwned(cp,key),best=owned[0],b=button("",()=>lifeDetail(cp,key,label,own),"life-profile-card");b.append(el("strong",label),lifePicture(best,icon),el("small",best?best.name:"Δεν αποκτήθηκε ακόμη"));const bar=el("div",undefined,"life-progress"),fill=el("div");fill.style.width=(owned.length/6*100)+"%";bar.append(fill);b.append(bar,el("small",owned.length+"/6"));grid.append(b);}screen.append(grid);const legacy=(cp.collection||[]).map(item).filter(i=>i&&(!i.level&&["home","vehicle","amenity","travel","pet","art","seasonal","donation"].includes(i.category)));if(legacy.length){const c=card();c.append(el("h3","Πρόσθετα συλλεκτικά"));for(const i of legacy)c.append(el("p",i.icon+" "+i.name));}}
function privateGifts(parent){if(!shop().gifts)return;const wrap=el("section",undefined,"private-gifts");wrap.append(el("h3","🔒 Τα δώρα μου"),el("small","Τα δώρα και οι αποστολείς τους είναι ορατοί μόνο σε εσένα."));const gifts=shop().gifts||[];if(!gifts.length)wrap.append(el("p","Δεν έχεις λάβει ακόμη δώρα.","muted"));for(const g of gifts){const row=el("div",undefined,"gift-row"),icon=el("span",g.icon,"gift-icon"),info=el("div");info.append(el("strong",g.name),el("small","Από: "+g.sender_name),el("small",dateFmt(g.created_at?.slice(0,10))));row.append(icon,info);wrap.append(row);}parent.append(wrap);}
function purchaseSuccess(i,recipient){const c=el("div",undefined,"purchase-success");c.setAttribute("role","status");c.append(el("span",recipient?"🎁":"✓","purchase-check"),el("div",recipient?"Το δώρο στάλθηκε ιδιωτικά.":"Η αγορά ολοκληρώθηκε!"),el("small",i.name+" · "+fmt(i.price)+" 🪙"));screen.prepend(c);}
function purchaseDialog(i,recipient=null,next="Κατάστημα"){
 if(resetOpen||busy)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card shop-dialog");m.append(c);document.body.append(m);
 const pendingKey="predictions-purchase:"+state.player.id+":"+i.code+":"+(recipient?.id||"self");let req;try{req=localStorage.getItem(pendingKey)||crypto.randomUUID();}catch{req=crypto.randomUUID();}const err=el("p","","feedback");let inFlight=false;
 function close(){if(inFlight)return;resetOpen=false;m.remove();}
 c.append((i.level||productPhoto(i.code))?lifePicture(i):el("div",i.icon,"shop-emblem"),el("h2",recipient?"Στείλε δώρο":"Επιβεβαίωση αγοράς"),el("p",i.name+(recipient?" → "+recipient.nickname:"")),el("p",fmt(i.price)+" 🪙","amount"));
 if(!recipient&&appearanceKeys.includes(i.category)){const preview=appearancePreview(i);c.append(preview);if(i.code==="title_custom"){const draft=el("input");draft.maxLength=60;draft.placeholder="Δοκίμασε τον τίτλο σου";draft.setAttribute("aria-label","Δοκιμή προσωπικού τίτλου");draft.addEventListener("input",()=>{preview.querySelector(".profile-title").textContent="✍️ "+(draft.value.trim()||"Ο δικός σου τίτλος");});c.append(draft,el("small","Εφάπαξ ξεκλείδωμα. Μετά την αγορά, γράφεις και αλλάζεις τον τίτλο δωρεάν από την εμφάνισή σου."));}}
 if(recipient)c.append(el("small","Το δώρο και το όνομά σου θα εμφανιστούν μόνο στο ιδιωτικό προφίλ του παραλήπτη."));
 const send=button(recipient?"Αποστολή δώρου":"Αγορά",async()=>{if(inFlight)return;inFlight=true;busy=true;revision++;send.disabled=true;send.textContent="Καταχώριση…";try{try{localStorage.setItem(pendingKey,req);}catch{}state=await api("shop",{operation:recipient?"gift":"buy",code:i.code,recipient:recipient?.id||null,request_id:req});try{localStorage.removeItem(pendingKey);}catch{}inFlight=false;close();clock();show(next);purchaseSuccess(i,recipient);}catch(e){err.textContent=e.status&&e.status<500?e.message:"Η σύνδεση διακόπηκε ή η απάντηση χάθηκε. Πάτησε ξανά για ασφαλή επανάληψη της ίδιας συναλλαγής.";inFlight=false;send.disabled=false;send.textContent=recipient?"Αποστολή δώρου":"Αγορά";}finally{busy=false;}},"primary");send.disabled=Number(shop().available)<Number(i.price);if(send.disabled)err.textContent="Δεν επαρκούν οι διαθέσιμες μάρκες.";
 c.append(err,send,button("Ακύρωση",close));
}
function showGiftShop(p){menuGo("Κατάστημα",()=>{giftTarget=p.id;shopTab="gift";});}
const appearanceKeys=["color","frame","background","title","effect","trophy"];
let appearanceTab="color";
function equippedCode(cp,key){return key==="frame"?cp.frame:key==="trophy"?cp.trophy:cp.appearance?.[key];}
function shownTitle(ap){const t=item(ap?.title);if(t?.category!=="title")return "";if(t.code==="title_custom")return typeof ap.custom_title==="string"&&ap.custom_title.trim()?"✍️ "+ap.custom_title:"";return t.icon+" "+t.name;}
function customTitleEditor(next="Η εμφάνισή μου"){
 if(resetOpen||busy)return;
 if(!(shop().owned||[]).includes("title_custom")&&!(cosmetics(state.player.id).collection||[]).includes("title_custom"))return;
 resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card shop-dialog"),input=el("input"),err=el("p","","feedback"),preview=appearancePreview({code:"title_custom",category:"title"});
 m.append(c);document.body.append(m);input.maxLength=60;input.placeholder="Ο δικός σου τίτλος";input.setAttribute("aria-label","Προσωπικός τίτλος");input.value=cosmetics(state.player.id).appearance?.custom_title||"";
 const title=preview.querySelector(".profile-title");const update=()=>{title.textContent="✍️ "+(input.value.trim()||"Ο δικός σου τίτλος");};input.addEventListener("input",update);update();
 function close(){resetOpen=false;m.remove();}
 const save=button("Αποθήκευση και εφαρμογή",async()=>{if(busy)return;const value=input.value.normalize("NFKC").trim();if(value.length<2||value.length>60){err.textContent="Γράψε 2–60 χαρακτήρες.";return;}busy=true;revision++;save.disabled=true;try{state=await api("custom_title",{title:value});close();clock();show(next);notice("Ο τίτλος αποθηκεύτηκε δωρεάν.");}catch(e){err.textContent=e.message;}finally{busy=false;save.disabled=false;}},"primary");
 c.append(el("h2","Προσωπικός τίτλος"),preview,input,el("small","2–60 χαρακτήρες · Αλλαγές χωρίς χρέωση."),err,save,button("Ακύρωση",()=>{if(!busy)close();}));
}
function appearancePreview(candidate=null){
 const p=state.player,cp=cosmetics(p.id),ap={...(cp.appearance||{})};let frame=cp.frame,trophyCode=cp.trophy;
 if(candidate){if(candidate.category==="frame")frame=candidate.code;else if(candidate.category==="trophy")trophyCode=candidate.code;else if(appearanceKeys.includes(candidate.category))ap[candidate.category]=candidate.code;}
 const preview=el("div",undefined,"card profile appearance-preview premium-profile");premiumLook(preview,ap);preview.append(premiumIdentity(p,cp,ap,frame,trophyCode,!!candidate));preview.append(el("small",candidate?"Δοκιμή εμφάνισης · Δεν έχει γίνει αγορά.":"Η ενεργή εμφάνισή σου"));return preview;
}
let liveDraft=null;
function appearancePage(){
 const p=state.player,cp=cosmetics(p.id),sh=shop(),owned=new Set([...(sh.owned||[]),...(cp.collection||[])]);
 const baseline=()=>({frame:cp.frame??null,trophy:cp.trophy??null,appearance:{...(cp.appearance||{})}});
 const draft=liveDraft&&liveDraft.id===p.id?liveDraft:liveDraft={id:p.id,...baseline()};
 let category=appearanceTab;
 const editor=el("div",undefined,"live-editor"),controls=el("div",undefined,"card live-controls"),preview=el("div",undefined,"live-profile-preview"),choices=el("div",undefined,"live-choices"),tabs=el("div",undefined,"live-tabs"),action=el("div",undefined,"live-actions"),status=el("small","","live-status");
 section("Ζωντανή εξατομίκευση");screen.append(button("‹ Πίσω",moreBack,"secondary"),editor);controls.append(tabs,choices,action,status);editor.append(controls,preview);
 const get=key=>key==="frame"?draft.frame:key==="trophy"?draft.trophy:draft.appearance[key]??null;
 const set=(key,code)=>{if(key==="frame")draft.frame=code;else if(key==="trophy")draft.trophy=code;else draft.appearance[key]=code;};
 function drawPreview(){preview.replaceChildren();preview.append(el("small","ΠΡΟΣΩΡΙΝΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗ · ΧΩΡΙΣ ΧΡΕΩΣΗ","live-preview-label"));renderFullProfile(preview,p,draft);}
 function drawControls(){
  const scroll=choices.scrollLeft;tabs.replaceChildren();choices.replaceChildren();action.replaceChildren();
  for(const key of appearanceKeys){const cat=shopCategories.find(x=>x[0]===key),b=button(cat[1]+" "+cat[2],()=>{category=appearanceTab=key;drawControls();choices.scrollLeft=0;},key===category?"primary":"");b.setAttribute("aria-pressed",String(key===category));tabs.append(b);}
  const selected=get(category),choose=code=>{set(category,code);drawControls();drawPreview();};
  const def=button("Προεπιλογή",()=>choose(null),selected===null?"live-selected":"");def.setAttribute("aria-pressed",String(selected===null));choices.append(def);
  for(const i of (sh.catalog||[]).filter(i=>i.category===category&&(i.active!==false||owned.has(i.code))).sort((a,b)=>Number(a.price)-Number(b.price))){
   const b=button("",()=>choose(i.code),selected===i.code?"live-selected":"");b.setAttribute("aria-pressed",String(selected===i.code));const icon=el("span",i.icon||"✦","live-swatch");if(category==="color"||category==="frame")icon.classList.add(i.code);b.append(icon,el("strong",i.name),el("small",owned.has(i.code)?"✓ Δικό σου":fmt(i.price)+" 🪙"));choices.append(b);
  }
  choices.scrollLeft=scroll;
  const i=item(selected),saved=(equippedCode(cp,category)??null)===selected;
  if(selected==="title_custom"){const input=el("input");input.maxLength=60;input.placeholder="Γράψε τον τίτλο σου";input.setAttribute("aria-label","Δοκιμή προσωπικού τίτλου");input.value=draft.appearance.custom_title||"";input.addEventListener("input",()=>{draft.appearance.custom_title=input.value;const ribbon=preview.querySelector(".premium-identity .profile-title");if(ribbon)ribbon.textContent="✍️ "+(input.value.trim()||"Ο δικός σου τίτλος");});action.append(input);}
  const label=selected===null?"Επαναφορά προεπιλογής":owned.has(selected)?selected==="title_custom"?"Αποθήκευση τίτλου":saved?"✓ Ενεργό":"Εφαρμογή δωρεάν":"Αγορά · "+fmt(i?.price||0)+" 🪙";
  const apply=button(label,async()=>{
   if(busy)return;
   if(selected==="title_custom"&&owned.has(selected)){const title=String(draft.appearance.custom_title||"").normalize("NFKC").trim();if(title.length<2||title.length>60){status.textContent="Γράψε 2–60 χαρακτήρες.";return;}await transact("custom_title",{title},"Η εμφάνισή μου");}
   else if(selected===null||owned.has(selected))await transact("shop",{operation:"equip_"+category,code:selected},"Η εμφάνισή μου");
   else if(i)purchaseDialog(i,null,"Η εμφάνισή μου");
  },"primary");
  apply.disabled=(saved&&selected!=="title_custom")||(!!i&&!owned.has(selected)&&Number(sh.available)<Number(i.price));
  action.append(apply,button("Επαναφορά δοκιμής",()=>{Object.assign(draft,baseline());drawControls();drawPreview();},"secondary"));
  status.textContent=i&&!owned.has(selected)&&Number(sh.available)<Number(i.price)?"Δεν επαρκούν οι διαθέσιμες μάρκες. Η δοκιμή παραμένει δωρεάν.":"Μόνο η ρητή αγορά ή εφαρμογή αποθηκεύει αλλαγές.";
 }
 const presets=el("div",undefined,"live-actions"),prefs=profilePrefs(p.id);
 function drawPresets(){presets.replaceChildren();presets.append(el("small","Αποθηκευμένοι συνδυασμοί · τοπικά στη συσκευή · μόνο προεπισκόπηση"));
 for(const [idx,entry] of prefs.presets.entries()){const line=el("div",undefined,"row");line.append(button(entry.name,()=>{for(const key of appearanceKeys){const code=key==="frame"?entry.frame:key==="trophy"?entry.trophy:entry.appearance?.[key];set(key,item(code)?.category===key?code:null);}draft.appearance.custom_title=String(entry.appearance?.custom_title||"").slice(0,60);drawControls();drawPreview();}),button("Διαγραφή",()=>{prefs.presets.splice(idx,1);saveProfilePrefs(p.id,prefs);drawPresets();}));presets.append(line);}
 const name=el("input");name.maxLength=30;name.placeholder="Όνομα συνδυασμού";name.setAttribute("aria-label","Όνομα συνδυασμού");const save=button("Αποθήκευση δοκιμής",()=>{const label=name.value.trim();if(!label||prefs.presets.length>=8)return;prefs.presets.push({name:label,frame:draft.frame,trophy:draft.trophy,appearance:{...draft.appearance}});if(saveProfilePrefs(p.id,prefs))drawPresets();});save.disabled=prefs.presets.length>=8;presets.append(name,save);}
 controls.append(presets);drawPresets();drawControls();drawPreview();
}
function shopMenu(){
 const groups=[["👤","Εξατομίκευση",appearanceKeys],["🏡","Καθημερινότητα",lifeCategories.map(x=>x[0])],["🎁","Δώρα",["gift"]],["✦","Επιπλέον",["seasonal","donation","achievements"]]];
 for(const [icon,label,keys] of groups){
  const c=card();c.classList.add("shop-group");c.append(el("h3",icon+" "+label));
  if(label==="Εξατομίκευση")c.append(button("Η εμφάνισή μου",()=>menuGo("Η εμφάνισή μου"),"secondary"));
  const grid=el("div",undefined,"shop-menu");
  for(const key of keys){const cat=shopCategories.find(x=>x[0]===key);if(!cat)continue;const btn=button("",()=>menuGo("Κατάστημα",()=>{shopTab=key;}));btn.append(el("span",cat[1],"shop-menu-icon"),el("span",cat[2]));grid.append(btn);}c.append(grid);
 }
}
function trophies(){
 const sh=shop();section("Κατάστημα");if(typeof PRODUCT_PHOTOS!=="undefined"&&Object.keys(PRODUCT_PHOTOS).length)screen.append(button("Πηγές φωτογραφιών",photoCredits,"secondary"));if(!sh.catalog){notice("Το κατάστημα δεν είναι διαθέσιμο. Κάνε ανανέωση.");return;}
 const hero=card();hero.append(el("small","ΔΙΑΘΕΣΙΜΕΣ ΓΙΑ ΑΓΟΡΕΣ"),el("p",fmt(sh.available)+" 🪙","amount"),el("small","Οι δεσμευμένες και δανεικές μάρκες δεν χρησιμοποιούνται για αγορές."));
 if(shopTab==="menu"){shopMenu();return;}
 if(appearanceKeys.includes(shopTab)){appearanceTab=shopTab;tab="Η εμφάνισή μου";screen.replaceChildren();appearancePage();return;}
 const category=shopCategories.find(x=>x[0]===shopTab);screen.append(button("‹ Κατηγορίες",moreBack,"secondary"));section(category?category[1]+" "+category[2]:"Συλλεκτικά");
 if(shopTab==="achievements"){const cp=cosmetics(state.player.id);section("Τα επιτεύγματά μου",(cp.achievements||[]).length+"/"+Object.keys(achievementNames).length);for(const [code,[icon,name]] of Object.entries(achievementNames)){const has=(cp.achievements||[]).some(x=>x.code===code);const c=card(),r=el("div",undefined,"achievement-row");r.append(el("span",icon,"gift-icon"),el("span",name),el("small",has?"✓":"🔒"));c.append(r);if(!has)c.classList.add("locked-achievement");}return;}
 let recipient=null;
 if(shopTab==="gift"){const people=(state.players||[]).filter(x=>x.id!==state.player.id);const c=card();c.append(el("h3","Επίλεξε παραλήπτη"));if(!people.length){c.append(el("p","Δεν υπάρχει άλλος εγκεκριμένος παίκτης.","muted"));return;}const sel=el("select");for(const p of people){const o=el("option",p.nickname);o.value=p.id;sel.append(o);}if(people.some(p=>p.id===giftTarget))sel.value=giftTarget;giftTarget=sel.value;recipient=people.find(p=>p.id===giftTarget);sel.onchange=()=>{giftTarget=sel.value;show("Κατάστημα");};c.append(sel,el("small","Μόνο ο παραλήπτης βλέπει το δώρο και τον αποστολέα."));const groups=el("div",undefined,"gift-groups");for(const [key,label] of [["men","Ανδρικά"],["women","Γυναικεία"],["general","Γενικά"]]){const b=button(label,()=>{giftGroup=key;show("Κατάστημα");});b.classList.toggle("active",giftGroup===key);groups.append(b);}screen.append(groups);}
 const grid=el("div",undefined,"shop-grid"),cp=cosmetics(state.player.id);const equipable=["frame","trophy","color","background","title","effect"].includes(shopTab);
 for(const i of sh.catalog.filter(x=>x.active!==false&&x.category===shopTab&&(shopTab!=="gift"||(x.gift_group||"general")===giftGroup)).sort((a,b)=>Number(a.price)-Number(b.price))){const c=el("article",undefined,"card shop-item"),owned=(sh.owned||[]).includes(i.code),equipped=shopTab==="frame"?cp.frame===i.code:shopTab==="trophy"?cp.trophy===i.code:cp.appearance?.[shopTab]===i.code;c.append((i.level||productPhoto(i.code))?lifePicture(i):el("div",i.icon,"shop-emblem"),el("h3",i.name),el("p",owned?"✓ Αποκτήθηκε":fmt(i.price)+" 🪙","muted"));if(owned&&equipable){if(i.code==="title_custom"){c.append(button("Γράψε / άλλαξε τίτλο",()=>customTitleEditor("Κατάστημα"),"primary"));if(equipped)c.append(button("Αφαίρεση",()=>transact("shop",{operation:"equip_title",code:null},"Κατάστημα")));}else c.append(button(equipped?"Αφαίρεση":"Εμφάνιση",()=>transact("shop",{operation:"equip_"+shopTab,code:equipped?null:i.code},"Κατάστημα"),equipped?"":"primary"));}else if(!owned){const b=button(shopTab==="gift"?"Αποστολή":equipable?"Προεπισκόπηση":"Αγορά",()=>purchaseDialog(i,recipient),"primary");b.disabled=(!equipable&&Number(sh.available)<i.price)||shopTab==="gift"&&!recipient;c.append(b);}grid.append(c);}screen.append(grid);
 if(shopTab==="donation")notice("Εικονικές προσφορές μόνο μέσα στο παιχνίδι. Δεν αποτελούν πραγματικές φιλανθρωπικές δωρεές.");
 if(shopTab==="gift")notice("Τα δώρα είναι ψηφιακά, μη μεταβιβάσιμα και δεν ανταλλάσσονται με μάρκες ή χρήματα.");
}

function openMember(p){menuGo("Προφίλ",()=>{profileTarget=p.id;});}
function members(){
 const people=(state.players||[]).slice().sort((a,b)=>a.nickname.localeCompare(b.nickname,"el"));
 section("Μέλη",people.length+" μέλη");
 const search=el("input");search.type="search";search.placeholder="Αναζήτηση ονόματος";search.setAttribute("aria-label","Αναζήτηση μέλους");
 const list=el("div",undefined,"members-list");screen.append(search,list);
 const draw=()=>{
  list.replaceChildren();const term=search.value.trim().toLocaleLowerCase("el");
  for(const p of people.filter(p=>p.nickname.toLocaleLowerCase("el").includes(term))){
   const cp=cosmetics(p.id),ap=cp.appearance||{},trophy=item(cp.trophy),title=item(ap.title),name=el("strong",p.nickname+(trophy?.category==="trophy"?" "+trophy.icon:"")),b=button("",()=>openMember(p),"member-choice member-showcase"),head=el("div",undefined,"member-showcase-head"),info=el("div",undefined,"member-showcase-info");
   b.setAttribute("aria-label","Προβολή προφίλ "+p.nickname);
   for(const key of ["background","effect"])if(item(ap[key])?.category===key)b.classList.add(ap[key]);
   if(item(ap.color)?.category==="color")name.classList.add(ap.color);
   info.append(name);
   if(shownTitle(ap))info.append(el("span",shownTitle(ap),"member-custom-title"));
   info.append(el("small","Επίπεδο "+levelOf(cp)+" · "+titleOf(cp)+(p.id===state.player.id?" · Εγώ":"")));
   head.append(avatar(p),info,el("span","›","member-chevron"));b.append(head);
   list.append(b);
  }
  if(!list.children.length)list.append(el("p","Δεν βρέθηκαν μέλη.","muted"));
 };
 search.addEventListener("input",draw);draw();
}
function memberManage(p,operation){
 if(resetOpen||busy||!state.player.is_admin||p.is_admin)return;
 resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);
 const rename=operation==="rename",name=el("input"),pin=pinField("memberAdminPin","PIN Admin"),err=el("p","","feedback");
 c.append(el("h2",(rename?"Διόρθωση ονόματος":"Αφαίρεση μέλους")+" · "+p.nickname));
 if(rename){name.value=p.nickname;name.maxLength=40;name.setAttribute("aria-label","Νέο όνομα");c.append(name);}else c.append(el("p","Το μέλος θα χάσει την πρόσβαση και θα αφαιρεθεί από τη λίστα. Τα παλιά δελτία, δώρα και συναλλαγές του θα διατηρηθούν."));
 function close(){pin.value="";resetOpen=false;m.remove();}
 const submit=button(rename?"Αποθήκευση":"Αφαίρεση μέλους",async()=>{if(busy)return;const nickname=name.value.normalize("NFKC").trim();if(!validPin(pin.value)||(rename&&(nickname.length<2||nickname.length>40))){err.textContent="Έλεγξε το όνομα και το PIN Admin.";return;}busy=true;revision++;submit.disabled=true;try{state=await api("member_manage",{target:p.id,operation,nickname:rename?nickname:null,admin_pin:pin.value});close();clock();show("Διαχείριση");notice(rename?"Το όνομα διορθώθηκε.":"Το μέλος αφαιρέθηκε.");}catch(e){err.textContent=e.message;pin.value="";}finally{busy=false;submit.disabled=false;}},rename?"primary":"danger");
 c.append(pin,err,submit,button("Ακύρωση",()=>{if(!busy)close();}));
}

const firstHelpSeen=new Set();
const firstHelpTopics={
 "Γεγονότα":["Πώς επιλέγω απαντήσεις;",["Διάλεξε απάντηση μόνο στις ερωτήσεις που θέλεις. Αρκεί μία επιλογή.","Μπορείς να αλλάξεις ή να αφαιρέσεις επιλογές πριν την καταχώριση. Από την κάτω μπάρα ανοίγεις το δελτίο σου."]],
 "Δελτίο":["Πώς λειτουργεί το δελτίο;",["Μία επιλογή δημιουργεί μονό δελτίο. Από 2 έως 6 διαφορετικές ερωτήσεις δημιουργούν συνδυαστικό δελτίο στην τρέχουσα έκδοση.","Έλεγξε τις επιλογές, τις διαθέσιμες εικονικές μάρκες και την εμφανιζόμενη επιστροφή. Μπορείς να υποβάλεις έως τρία ξεχωριστά δελτία μαζί, μοιράζοντας τις επιλεγμένες ερωτήσεις. Η ίδια ερώτηση μπαίνει μόνο σε ένα δελτίο."]],
 "Σημερινά αποτελέσματα":["Πώς επιβεβαιώνω αποτελέσματα;",["Απάντησε μόνο όταν γνωρίζεις τι έγινε πραγματικά. Η ψήφος καταχωρίζεται μία φορά. Από Περισσότερα → Σημερινά αποτελέσματα βλέπεις τις ερωτήσεις της ημέρας και τον αριθμό των απαντήσεων που έχεις καταχωρίσει. Απάντησε μόνο όταν γνωρίζεις το πραγματικό αποτέλεσμα.","Παρακολούθησε την κατάσταση των αποτελεσμάτων και των δελτίων από τις αντίστοιχες καρτέλες."]],
 "Προφίλ":["Το προφίλ μου",["Εδώ βλέπεις την εμφάνιση, τα αποκτήματα, την περιουσία και τα επιτεύγματά σου.","Τα ιδιωτικά δώρα είναι ορατά μόνο σε εσένα."]],
 "Η εμφάνισή μου":["Προσαρμογή εμφάνισης",["Προεπισκόπησε τα διαθέσιμα χρώματα, πλαίσια, τίτλους, φόντα και εφέ πριν τα εφαρμόσεις."]],
 "Κατάστημα":["Το κατάστημα",["Άνοιξε μια κατηγορία για να δεις τα αντικείμενα και την τιμή τους.","Όλα τα αντικείμενα είναι εικονικά και οι αγορές χρησιμοποιούν μόνο τις επιτρεπόμενες διαθέσιμες μάρκες."]],
 "Τράπεζα":["Η τράπεζα",["Δες το διαθέσιμο και δεσμευμένο υπόλοιπο, τα δάνεια και την επόμενη πίστωση.","Έλεγξε τους όρους και τυχόν τόκους πριν επιβεβαιώσεις οποιαδήποτε ενέργεια."]],
 "Κατάταξη":["Η κατάταξη",["Εναλλάσσεις προβολές περιουσίας, κερδών, εβδομάδας και μήνα. Η περιουσία δεν είναι το ίδιο με το διαθέσιμο υπόλοιπο."]],
 "Μέλη":["Τα μέλη",["Επίλεξε ένα μέλος για να δεις το δημόσιο προφίλ του. Τα ιδιωτικά στοιχεία και δώρα δεν εμφανίζονται δημόσια."]],
 "Καζίνο":["Πληροφορίες και όρια",["Και τα οκτώ παιχνίδια χρησιμοποιούν αποκλειστικά δωρεάν εικονικές μάρκες χωρίς χρηματική αξία.","Τα ημερήσια όρια και οι κανόνες εμφανίζονται στην ενότητα. Δεν χρειάζεται να χρησιμοποιήσεις κανένα από τα διαθέσιμα όρια."]],
 "Παραιτήσεις":["Μακροχρόνιες προβλέψεις",["Εμφανίζονται μόνο οι επιλέξιμοι εργαζόμενοι με συγκατάθεση. Διάβασε την περίοδο και τους όρους επιβεβαίωσης."]],
 "Ρυθμίσεις":["Ειδοποιήσεις συσκευής",["Μπορείς να ενεργοποιήσεις, να απενεργοποιήσεις ή να δοκιμάσεις τις ειδοποιήσεις στη συσκευή σου."]],
 "Περισσότερα":["Οι υπόλοιπες λειτουργίες",["Εδώ θα βρεις τις πρόσθετες ενότητες και τον Οδηγό παιχνιδιού, με αναλυτικές πληροφορίες που μπορείς να διαβάσεις οποιαδήποτε στιγμή."]]
};
function firstHelpKey(k){return "predictions-help-v1:"+String(state.player.id)+":"+k;}
function firstHelpSuppressed(key){try{return localStorage.getItem(key)==="1";}catch{return false;}}
function openFirstHelp(k,trigger,automatic=false){
 const topic=firstHelpTopics[k];if(!topic||resetOpen||!state?.player?.id)return;
 const key=firstHelpKey(k),d=el("dialog"),c=el("div",undefined,"card");
 if(typeof d.showModal!=="function"){if(!automatic)menuGo("Οδηγός παιχνιδιού");return;}
 d.setAttribute("aria-label",topic[0]);
 Object.assign(d.style,{width:"min(92vw,440px)",maxHeight:"85dvh",overflow:"auto",padding:"0",border:"1px solid var(--line)",borderRadius:"16px",background:"var(--card)",color:"var(--text)"});
 c.style.margin="0";
 const check=el("input");check.type="checkbox";check.checked=firstHelpSuppressed(key);check.style.width="auto";check.style.minHeight="0";
 const label=el("label",undefined,"departure-consent");label.append(check,el("span","Να μην εμφανιστεί ξανά"));
 const msg=el("p","","feedback");
 c.append(el("h2",topic[0]));for(const p of topic[1])c.append(el("p",p));c.append(label,msg);
 let goGuide=false;
 function close(save,next=false){if(!d.open)return;if(save){try{if(check.checked)localStorage.setItem(key,"1");else localStorage.removeItem(key);}catch{msg.textContent="Δεν ήταν δυνατή η αποθήκευση. Μπορείς να κλείσεις χωρίς αποθήκευση.";return;}}goGuide=next;d.close();}
 c.append(button("Κατάλαβα",()=>close(true),"primary"),button("Αναλυτικός οδηγός",()=>close(true,true)),button("Κλείσιμο",()=>close(false),"secondary"));
 d.append(c);document.body.append(d);
 d.addEventListener("close",()=>{d.remove();resetOpen=false;if(goGuide){menuGo("Οδηγός παιχνιδιού");return;}if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
 try{d.showModal();resetOpen=true;firstHelpSeen.add(key);}catch{d.remove();}
}
function attachFirstHelp(k){
 if(!Object.prototype.hasOwnProperty.call(firstHelpTopics,k)||!state?.player?.id)return;
 const key=firstHelpKey(k),b=button("? Βοήθεια",()=>openFirstHelp(k,b),"secondary");
 b.style.fontSize="12px";b.style.minHeight="32px";b.style.width="auto";
 const heading=screen.querySelector(".section-head");if(heading)heading.append(b);else screen.prepend(b);
 if(k==="Δελτίο"&&!firstHelpSeen.has(key)&&!firstHelpSuppressed(key))openFirstHelp(k,b,true);
}

const guideCrops={"ticket-history":[[650,904],[[0,0,100,17,"Το δελτίο μου","Οι επιλογές συγκεντρώνονται εδώ πριν από την καταχώριση. Ο μετρητής δείχνει πόσες έχεις επιλέξει."],[0,18,100,15,"Ιστορικό και κατάσταση","Εδώ εμφανίζονται προηγούμενα δελτία και η κατάστασή τους."]]],"ticket-combined":[[650,805],[[0,0,100,35.4,"Συνδυαστικό δελτίο","Περιλαμβάνει 2–6 διαφορετικές ερωτήσεις. Στο παράδειγμα υπάρχουν δύο."],[0,35.4,100,5.9,"Ποντάρισμα","Οι εικονικές μάρκες που χρησιμοποιήθηκαν στο δελτίο."],[0,41.3,100,5.3,"Συνολική απόδοση","Η συνολική απόδοση που εμφανίζεται για το δελτίο."],[0,46.6,100,7.6,"Μέγιστη επιστροφή","Το πιθανό συνολικό ποσό επιστροφής, μαζί με το ποντάρισμα."]]],"ticket-settled":[[650,1082],[[0,0,100,33,"Κερδισμένο δελτίο","Στο παράδειγμα επιστράφηκαν 190 μάρκες από ποντάρισμα 100. Καθαρό αποτέλεσμα: +90."],[0,34,100,8,"Χαμένο δελτίο","Το δελτίο δεν επαληθεύτηκε."],[0,83,100,17,"Τελική επιστροφή και αποτέλεσμα","Η επιστροφή αφαιρουμένου του πονταρίσματος δίνει το καθαρό αποτέλεσμα."]]],"casino-menu":[[650,737],[[0,9,100,17,"Διαθέσιμες μάρκες","Το ποσό που εμφανίζεται ως διαθέσιμο στη συγκεκριμένη ενότητα."],[0,26,100,26,"Ημερήσια όρια","Εδώ εμφανίζονται τα εναπομείναντα όρια. Ανανεώνονται στις 00:00 ώρα Ελλάδας."],[0,52,100,25,"Blackjack","Η καρτέλα του παιχνιδιού."],[0,77,100,23,"Φρουτάκια","Η καρτέλα του παιχνιδιού."]]],"blackjack":[[650,844],[[3,22,94,55,"Το τραπέζι","Η επάνω σειρά αφορά την τράπεζα και η κάτω τον παίκτη."],[0,77,100,16,"Ποντάρισμα και νέα παρτίδα","Εδώ εμφανίζεται το ποσό και το κουμπί έναρξης. Το αρχικό εύρος είναι 10–100 εικονικές μάρκες."],[0,93,100,7,"Κανόνες και αποδόσεις","Η ενσωματωμένη επεξήγηση των κανόνων."]]],"slots":[[650,903],[[1,19,98,49,"Οι τρεις κύλινδροι","Μόνο τα σύμβολα της μεσαίας γραμμής καθορίζουν το αποτέλεσμα. Οι πάνω και κάτω θέσεις είναι διακοσμητικές."],[0,68,100,12,"Ποντάρισμα και επιστροφή","Οι ενδείξεις εμφανίζουν το ποσό και τη συνολική επιστροφή."],[0,80,100,20,"Χειριστήρια και κανόνες","Το πεδίο ποσού, το SPIN και η ενσωματωμένη επεξήγηση."]]],"ranking-wealth":[[650,519],[[0,12,100,19,"Επιλογή κατάταξης","Περιουσία, κέρδη, εβδομάδα ή μήνας."],[0,56,100,22,"Μάρκες, αποκτήματα και περιουσία","Η περιουσία περιλαμβάνει την αξία των αποκτημάτων, δεν είναι απαραίτητα διαθέσιμες μάρκες."]]],"ranking-profit":[[650,559],[[0,12,100,17,"Κατάταξη κερδών","Ταξινόμηση βάσει καθαρού αποτελέσματος."],[0,69,100,14,"Καθαρά κέρδη","Το συνολικό καθαρό αποτέλεσμα του μέλους."],[0,84,100,16,"Προβολή προφίλ","Ανοίγει τα δημόσια στοιχεία του μέλους."]]],"profile":[[650,893],[[0,53,100,13,"Επίπεδο και XP","Η μπάρα δείχνει την πρόοδο μέχρι το επόμενο επίπεδο."],[0,66,100,13,"Περιουσία","Τα βασικά στοιχεία του λογαριασμού."],[0,79,100,10,"Φωτογραφία προφίλ","Αλλαγή ή αφαίρεση της φωτογραφίας."],[0,89,100,11,"Εμφάνιση και κατάστημα","Πρόσβαση στην εξατομίκευση και στις κατηγορίες αντικειμένων."]]],"collection":[[650,1124],[[0,0,100,21,"Prestige συλλογής","Δείκτης συλλογής που δεν προσφέρει οικονομική ανταμοιβή."],[0,21,100,28,"Καθημερινότητα","Οι κατηγορίες δείχνουν ποια εικονικά αντικείμενα έχεις αποκτήσει."]]],"achievements":[[650,731],[[0,0,100,20,"Επιτεύγματα","Εδώ εμφανίζονται όσα έχεις ξεκλειδώσει."],[0,20,100,20,"Τα δώρα μου","Ιδιωτική προβολή των δώρων και των αποστολέων τους."],[0,40,100,60,"Στατιστικά","Νίκες, ήττες, καθαρά κέρδη, τόκοι και μπόνους."]]],"appearance":[[650,767],[[0,20,100,21,"Κατηγορίες εμφάνισης","Χρώματα, πλαίσια, φόντα, τίτλοι, εφέ και τρόπαια."],[0,41,100,15,"Προεπισκόπηση","Δοκιμή εμφάνισης χωρίς χρέωση πριν από αγορά ή εφαρμογή."],[0,56,100,11,"Επαναφορά","Επαναφέρει την εμφάνιση ή την προσωρινή δοκιμή."],[0,67,100,33,"Αποθήκευση δοκιμής","Ο συνδυασμός αποθηκεύεται τοπικά στη συσκευή."]]],"shop":[[650,867],[[0,18,100,30,"Διαθέσιμες για αγορές","Το ποσό που επιτρέπεται να χρησιμοποιηθεί για αγορές. Δεσμευμένες και δανεικές μάρκες εξαιρούνται."],[0,49,100,51,"Εξατομίκευση","Οι κατηγορίες εμφάνισης και η πρόσβαση στη ζωντανή δοκιμή."]]],"shop-categories":[[650,1070],[[0,0,100,58,"Κατηγορίες αντικειμένων","Τα αποκτήματα οργανώνονται ανά κατηγορία."],[0,58,100,21,"Δώρα","Η ειδική κατηγορία δώρων."],[0,79,100,21,"Επιπλέον","Εποχιακά, προσφορές και επιτεύγματα."]]],"members":[[650,904],[[0,0,100,17,"Αναζήτηση μέλους","Βρες ένα μέλος με βάση το όνομά του."],[0,17,100,15,"Κάρτα μέλους","Πάτησε την κάρτα για να δεις το δημόσιο προφίλ."]]],"bank":[[650,843],[[0,10,100,24,"Υπόλοιπο και διαθέσιμες μάρκες","Η Τράπεζα εμφανίζει το υπόλοιπο, τις διαθέσιμες και τις δεσμευμένες μάρκες."],[0,34,100,15,"Όρια δανείων","Εμφανίζονται χωριστά ο εβδομαδιαίος δανεισμός και η χορήγηση."],[0,49,100,10,"Επόμενη πίστωση","Η ημερομηνία της επόμενης εβδομαδιαίας πίστωσης."]]],"bank-loans":[[650,789],[[0,0,100,40,"Ζήτησε δάνειο","Συμπλήρωσε το ποσό και δημιούργησε αίτημα όταν πληρούνται οι προϋποθέσεις."],[0,42,100,17,"Αιτήματα παικτών","Εδώ εμφανίζονται τα ανοικτά αιτήματα άλλων μελών."],[0,60,100,18,"Τα δάνειά μου","Εδώ εμφανίζονται τα δικά σου δάνεια."],[0,79,100,21,"Εξόφληση","Εδώ αναφέρονται οι όροι προθεσμίας και τόκου."]]],"results-locked":[[650,905],[[0,0,100,20,"Ώρες επιβεβαίωσης","Ο μετρητής δείχνει πόσες ερωτήσεις απάντησες. Οι ώρες ψηφοφορίας και πληρωμών εμφανίζονται στην εφαρμογή."],[0,21,100,26,"Ερωτήσεις ημέρας","Απάντησε μόνο όταν γνωρίζεις το πραγματικό αποτέλεσμα. Η φωτογραφία δείχνει την κλειδωμένη κατάσταση."]]],"long-term":[[650,796],[[0,9,100,35,"Μακροχρόνιες προβλέψεις","Η ενότητα εμφανίζει τους κανόνες και τη διαθεσιμότητα."],[0,45,100,28,"Οι προβλέψεις μου","Εδώ εμφανίζονται οι καταχωρίσεις σου."],[0,75,100,19,"Προθεσμίες","Η περίοδος και το περιθώριο επιβεβαίωσης αναγράφονται στην εφαρμογή."]]],"consent":[[650,445],[[0,0,100,51,"Συγκατάθεση εργαζομένου","Η ενεργοποίηση επιτρέπεται μόνο αφού έχει δοθεί πραγματική συγκατάθεση."]]],"notifications":[[650,428],[[0,0,100,39,"Κατάσταση ειδοποιήσεων","Εμφανίζεται η κατάσταση άδειας της συσκευής."],[0,40,100,20,"Ενεργοποίηση ή απενεργοποίηση","Διαχείριση των ειδοποιήσεων της συσκευής."],[0,60,100,21,"Δοκιμαστική ειδοποίηση","Έλεγχος παραλαβής όταν είναι διαθέσιμη."]]],"chat":[[650,632],[[0,12,100,15,"Shoutbox ή Προσωπικά","Επιλέγεις κοινή συνομιλία ή ιδιωτικά μηνύματα."],[0,27,100,12,"Ανανέωση","Χειροκίνητος έλεγχος νέων μηνυμάτων."],[0,39,100,43,"Συνομιλία","Εδώ εμφανίζεται το ιστορικό των μηνυμάτων."],[0,82,100,18,"Γράψε και στείλε","Το πεδίο μηνύματος και το κουμπί αποστολής."]]],"private-chat":[[650,716],[[0,23,100,14,"Επίλεξε μέλος","Πρώτα επιλέγεις τον παραλήπτη της ιδιωτικής συνομιλίας."],[0,47,100,36,"Ιδιωτική συνομιλία","Εδώ εμφανίζεται το ιστορικό της επιλεγμένης συνομιλίας."],[0,84,100,16,"Αποστολή","Ενεργοποιείται όταν υπάρχει επιλεγμένος παραλήπτης και έγκυρο μήνυμα."]]],"more":[[650,839],[[0,8,100,31,"Αποτελέσματα, εμφάνιση, μέλη και κατάστημα","Οι βασικές πρόσθετες ενότητες."],[0,39,100,31,"Τράπεζα, προβλέψεις, ρυθμίσεις και οδηγός","Πρόσβαση στα οικονομικά στοιχεία, τις ρυθμίσεις και τη βοήθεια."],[0,70,100,30,"Chat, διαχείριση και λογαριασμός","Η διαχείριση εμφανίζεται μόνο στον διαχειριστή."]]]};
function annotatedGuideFigure(name,title){
 const wrap=el("div",undefined,"guide-excerpts"),entry=guideCrops[name];if(!entry)return wrap;
 const [[iw,ih],parts]=entry;const url="./images/help/"+name+".webp";
 for(const [x,y,w,h,heading,desc] of parts){
  const fig=el("figure",undefined,"guide-excerpt"),explain=el("figcaption",undefined,"guide-explain"),label=el("strong",heading),copy=el("span",desc),crop=el("div",undefined,"guide-crop"),img=el("img");
  explain.append(label,copy);crop.style.aspectRatio=(iw*w)+"/"+(ih*h);
  img.style.width=(10000/w)+"%";img.style.left=(-100*x/w)+"%";img.style.top=(-100*y/h)+"%";
  img.alt="Απόσπασμα: "+heading;img.loading="lazy";img.decoding="async";img.draggable=false;
  img.addEventListener("error",()=>{crop.replaceChildren(el("span","Η εικόνα δεν είναι διαθέσιμη. Η επεξήγηση παραμένει παραπάνω.","muted"));crop.classList.add("guide-crop-error");},{once:true});
  crop.append(img);fig.append(explain,crop);wrap.append(fig);img.src=url;
 }return wrap;
}
function helpGuide(){section("Οδηγός παιχνιδιού");screen.append(button("‹ Πίσω",moreBack,"secondary"));const intro=card();intro.classList.add("guide-intro");intro.append(el("h3","Πώς λειτουργούν οι Προβλέψεις"),el("p","Ιδιωτικό παιχνίδι με δωρεάν εικονικές μάρκες. Δεν αγοράζονται, δεν εξαργυρώνονται και δεν έχουν χρηματική αξία. Άνοιξε μία ενότητα: κάθε επεξήγηση συνοδεύεται από πραγματικό απόσπασμα της εφαρμογής. Οι εικόνες είναι παραδείγματα, όχι ενεργά κουμπιά.","muted"));const groups=[
["🎯","Γεγονότα και ψηφοφορία",["Επίλεξε αποτέλεσμα σε διαθέσιμο γεγονός. Οι ώρες ανοίγματος και επιβεβαίωσης εμφανίζονται στην εφαρμογή και εξαρτώνται από το είδος γεγονότος.","Όταν ανοίξει η επιβεβαίωση, δήλωσε το πραγματικό αποτέλεσμα. Η ψήφος καταχωρίζεται μία φορά."]],
["💬","Chat και προσωπικά μηνύματα",["Στα Περισσότερα → Chat επιλέγεις κοινή συνομιλία ή Προσωπικά και το μέλος που θέλεις. Τα προσωπικά μηνύματα εμφανίζονται μόνο στους δύο συμμετέχοντες. Δεν είναι κρυπτογραφημένα από άκρο σε άκρο. Το Shoutbox δείχνει τα τελευταία 20 μηνύματα και οι προσωπικές συνομιλίες έως 100. Η εφαρμογή λαμβάνει μόνο νέα μηνύματα ανά λεπτό όσο τη χρησιμοποιείς. Η αυτόματη ανανέωση σταματά μετά από 10 λεπτά αδράνειας ή 60 αυτόματους ελέγχους ανά ημέρα/συσκευή· παραμένουν η χειροκίνητη ανανέωση και η αποστολή."]],
["🎟️","Δελτίο και αποδόσεις",["Οι επιλογές συγκεντρώνονται στο Δελτίο. Μία απάντηση αποτελεί μονό δελτίο· 2–6 διαφορετικές ερωτήσεις αποτελούν συνδυαστικό δελτίο. Μπορείς να αφαιρέσεις επιλογές πριν από την οριστική καταχώριση. Μπορείς να υποβάλεις έως τρία ξεχωριστά δελτία μαζί, μοιράζοντας τις επιλεγμένες ερωτήσεις. Η ίδια ερώτηση μπαίνει μόνο σε ένα δελτίο. Μια λανθασμένη επιλογή μηδενίζει την επιστροφή του συνδυαστικού δελτίου· οι ακυρωμένες επιλογές αντιμετωπίζονται σύμφωνα με τους κανόνες πληρωμής.","Ποντάρισμα 10–1.000 διαθέσιμες μάρκες. Η πιθανή συνολική επιστροφή εμφανίζεται πριν την καταχώριση, με ανώτατο όριο 10.000. Το ιστορικό δείχνει εκκρεμή, κερδισμένα και χαμένα δελτία. Η επιστροφή περιλαμβάνει το ποντάρισμα· το καθαρό αποτέλεσμα είναι η επιστροφή μείον το ποντάρισμα."]],
["👤","Προφίλ και συλλογή",["Το προφίλ παρουσιάζει την ταυτότητα, την περιουσία, την εμφάνιση και τα αποκτημένα αντικείμενα. Τα αντικείμενα είναι εικονικά.","Η εμπειρία εμφανίζεται ως XP (10 ανά καταγεγραμμένη ημέρα δραστηριότητας). Από την εμφάνισή μου μπορείς να προεπισκοπήσεις και να εφαρμόσεις διαθέσιμα χρώματα, τίτλους, πλαίσια, φόντα, εφέ και τρόπαια.","Οι κατηγορίες περιουσίας δείχνουν τα αντικείμενα που απέκτησες. Τα ιδιωτικά δώρα δεν εμφανίζονται δημόσια."]],
["🛍️","Κατάστημα και δώρα",["Δες τις κατηγορίες, την τιμή και την περιγραφή κάθε αντικειμένου. Οι αγορές χρησιμοποιούν μόνο διαθέσιμες μάρκες που επιτρέπονται για αγορές, όχι δεσμευμένες ή δανεικές.","Τα ιδιωτικά δώρα εμφανίζονται μόνο στον παραλήπτη μαζί με τον αποστολέα. Στη ζωντανή εξατομίκευση η δοκιμή εμφάνισης δεν χρεώνει μάρκες· μόνο η ρητή αγορά ή εφαρμογή αποθηκεύει αλλαγές. Οι αποθηκευμένοι δοκιμαστικοί συνδυασμοί μένουν τοπικά στη συσκευή. Τα επιτεύγματα δείχνουν τι έχει ήδη ξεκλειδωθεί."]],
["🏆","Κατάταξη και μέλη",["Η κατάταξη έχει προβολές περιουσίας, κερδών, εβδομάδας και μήνα. Μπορείς να ανοίξεις το δημόσιο προφίλ άλλου μέλους από τη λίστα Μελών.","Η περιουσία και τα διαθέσιμα δεν είναι απαραίτητα το ίδιο ποσό."]],
["🏦","Τράπεζα",["Στα Περισσότερα → Τράπεζα φαίνονται διαθέσιμες και δεσμευμένες μάρκες, δάνεια και επόμενη πίστωση 1.000 μαρκών.","Αιτήματα δανείου 50–300 μάρκες, όταν υπάρχουν έως 100 διαθέσιμες για ποντάρισμα και επιτρέπεται από το εβδομαδιαίο όριο. Το εβδομαδιαίο όριο δανεισμού και χορήγησης είναι 300 αντίστοιχα.","Εξόφληση πριν τη Δευτέρα χωρίς τόκο. Στη λήξη εφαρμόζεται 10% τόκος, με στρογγυλοποίηση προς τα πάνω ανά δάνειο."]],
["🃏","Blackjack",["Στόχος: σύνολο κοντά στο 21 χωρίς υπέρβαση. Οι φιγούρες αξίζουν 10, ο άσος 1 ή 11. Η τράπεζα μένει στο 17.","Φύλλο: παίρνεις φύλλο. Μένω: ολοκληρώνεις το χέρι. Double: διπλασιάζεις το ποντάρισμα και παίρνεις ένα φύλλο. Split: χωρίζεις δύο ίδια φύλλα μία φορά. Οι άσοι μετά από Split παίρνουν ένα φύλλο.","Συνολική επιστροφή: νίκη 2×, ισοπαλία 1×, φυσικό 21 2,5× με στρογγυλοποίηση προς τα κάτω."]],
["🎰","Φρουτάκια",["Τρεις κύλινδροι και εννέα ορατές θέσεις. Μόνο τα τρία σύμβολα στη μεσαία γραμμή καθορίζουν το αποτέλεσμα. Οι πάνω και κάτω θέσεις είναι διακοσμητικές.","Οκτώ ισοπίθανα σύμβολα ανά κύλινδρο. Συνολική επιστροφή: δύο ίδια 2×, τρία ίδια 8×, τρία 7 16×, διαφορετικά 0."]],
...Object.values(casinoExtraGames).map(def=>[def.icon,def.title,[def.rules,"Το αποτέλεσμα και η επιστροφή καθορίζονται στον server. Μόνο εικονικές μάρκες."]]),
["🛡️","Όρια Καζίνο",["Κοινό ημερήσιο όριο 500 μαρκών σε όλα τα οκτώ παιχνίδια, έως 10 παρτίδες Blackjack, 20 περιστροφές στα Φρουτάκια και 20 γύροι συνολικά στα έξι λοιπά παιχνίδια. Αρχικό ποντάρισμα 10–100. Double και Split μετρούν στο κοινό όριο.","Ανανέωση στις 00:00 ώρα Ελλάδας. Τα αποτελέσματα καθορίζονται από τον server και δεν απαιτείται να χρησιμοποιήσεις όλο το διαθέσιμο όριο."]],
["🎁","Ημερήσια κλήρωση",["Κάθε ημέρα στις 12:00 ώρα Ελλάδας προβλέπεται αυτόματη κλήρωση 500 μαρκών για τα εγκεκριμένα μέλη, με ίσες πιθανότητες, χωρίς σύνδεση ή ποντάρισμα.","Ο νικητής και το ιστορικό εμφανίζονται στα Γεγονότα."]],
["📅","Μακροχρόνιες προβλέψεις",["Στις Παραιτήσεις επιλέγεις εργαζόμενο και διαθέσιμη περίοδο. Ποντάρισμα 10–100 μάρκες. Για σωστή πρόβλεψη προβλέπεται διπλάσια επιστροφή και μπόνους 2.000 μαρκών, σύμφωνα με τους κανόνες της ενότητας. Μόνο εργαζόμενοι με πραγματική συγκατάθεση μπορούν να συμμετέχουν σε αυτή την κατηγορία. Μία ενεργή πρόβλεψη ανά εργαζόμενο και περιθώριο επιβεβαίωσης 7 ημερών μετά τη λήξη."]],
["⚙️","Ρυθμίσεις και λογαριασμός",["Οι ρυθμίσεις περιλαμβάνουν τις διαθέσιμες επιλογές ειδοποιήσεων. Η πρόσβαση απαιτεί εγκεκριμένο λογαριασμό και προσωπικό PIN.","Το Περισσότερα επιστρέφει ένα επίπεδο πίσω όταν βρίσκεσαι σε υποενότητα. Για πρόβλημα σύνδεσης ή λογαριασμού επικοινώνησε με τον διαχειριστή. Από Ρυθμίσεις μπορείς να ενεργοποιήσεις ή να απενεργοποιήσεις ειδοποιήσεις και να κάνεις δοκιμαστική αποστολή. Η άδεια ειδοποιήσεων της συσκευής πρέπει επίσης να είναι ενεργή."]],
["🔐","Διαχείριση (Admin)",["Μόνο ο διαχειριστής έχει πρόσβαση στις εγκρίσεις μελών, στις ενέργειες λογαριασμών και στα εργαλεία Admin. Οι ευαίσθητες ενέργειες απαιτούν το προβλεπόμενο PIN. Μην κοινοποιείς PIN ή στοιχεία άλλων μελών."]]
];for(const [icon,title,paragraphs] of groups){const d=el("details",undefined,"card guide-section"),s=el("summary"),label=el("span",icon,"guide-icon");label.setAttribute("aria-hidden","true");s.append(label,el("strong",title),el("span","⌄","guide-arrow"));d.setAttribute("name","predictions-guide");d.append(s);const body=el("div",undefined,"guide-body");const rules=el("div",undefined,"guide-full-rules");for(const p of paragraphs)rules.append(el("p",p));d.append(body);screen.append(d);const imageNames=({"Γεγονότα και ψηφοφορία":["results-locked"],"Chat και προσωπικά μηνύματα":["chat","private-chat"],"Δελτίο και αποδόσεις":["ticket-history","ticket-combined","ticket-settled"],"Προφίλ και συλλογή":["profile","collection","achievements","appearance"],"Κατάστημα και δώρα":["shop","shop-categories"],"Κατάταξη και μέλη":["ranking-wealth","ranking-profit","members"],"Τράπεζα":["bank","bank-loans"],"Blackjack":["blackjack"],"Φρουτάκια":["slots"],"Όρια Καζίνο":["casino-menu"],"Μακροχρόνιες προβλέψεις":["long-term","consent"],"Ρυθμίσεις και λογαριασμός":["notifications","more"]})[title];if(imageNames){const details=el("details",undefined,"guide-rule-details");details.append(el("summary","Αναλυτικές οδηγίες και κανόνες"),rules);body.append(details);d.addEventListener("toggle",async()=>{if(!d.open||d.dataset.guideImages)return;d.dataset.guideImages="loading";try{const response=await fetch("./images/help/manifest.json",{cache:"no-cache"});if(!response.ok)throw Error("Images not published");const manifest=await response.json();if(!Array.isArray(manifest.images))throw Error("Invalid manifest");if(!d.isConnected)return;for(const name of imageNames){if(!manifest.images.includes(name+".webp"))continue;body.insertBefore(annotatedGuideFigure(name,title),details);}d.dataset.guideImages="ready";}catch{delete d.dataset.guideImages;details.open=true;}});}else body.append(rules);}}

function more(){section("Περισσότερα");const grid=el("div",undefined,"menu");const list=[["✅","Σημερινά αποτελέσματα"],["🎨","Η εμφάνισή μου"],["👥","Μέλη"],["🛍️","Κατάστημα"],["🏦","Τράπεζα"],["📅","Παραιτήσεις"],["⚙️","Ρυθμίσεις"],["📖","Οδηγός παιχνιδιού"],["💬","Chat"]];if(state.player.is_admin)list.push(["🔐","Διαχείριση"]);for(const [icon,name] of list){const b=button("",()=>{menuGo(name,()=>{if(name==="Προφίλ")profileTarget=null;if(name==="Κατάστημα")shopTab="menu";});});b.append(el("i",icon),el("span",name));if(name==="Chat")b.dataset.chatMenu="1";grid.append(b);}const update=button("",()=>refresh(true));update.append(el("i","↻"),el("span","Ανανέωση"));grid.append(update);const exit=button("",logout);exit.append(el("i","🚪"),el("span","Έξοδος"));grid.append(exit);screen.append(grid);}
async function manage(p,operation){if(busy)return;busy=true;revision++;try{state=await api("manage",{target:p.id,operation});show("Διαχείριση");}catch(e){notice(e.message);}finally{busy=false;}}
function resetPin(p){if(resetOpen)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);let newPin="";function close(){newPin="";resetOpen=false;m.remove();}function cancel(){close();show("Γεγονότα");}c.append(el("h2","Νέο PIN · "+p.nickname),el("p","Δώσε το κινητό στον παίκτη."));const a=pinField("newPin","Νέο PIN"),b=pinField("repeatPin","Επανάληψη PIN"),error=el("p","","feedback");c.append(a,b,error,button("Συνέχεια",()=>{if(!validPin(a.value)||a.value!==b.value){error.textContent="Τα PIN πρέπει να ταιριάζουν (4–8 ψηφία).";return;}newPin=a.value;a.value=b.value="";c.replaceChildren(el("h2","Έγκριση Admin"),el("p","Επίστρεψε το κινητό στον διαχειριστή."));const admin=pinField("adminPin","PIN Admin"),err=el("p","","feedback"),confirm=button("Επιβεβαίωση",async()=>{if(!validPin(admin.value)){err.textContent="Πληκτρολόγησε το PIN Admin.";return;}confirm.disabled=true;try{state=await api("manage",{target:p.id,operation:"reset_pin",new_pin:newPin,admin_pin:admin.value});admin.value="";close();show("Γεγονότα");notice("Το PIN άλλαξε επιτυχώς.");}catch(e){err.textContent=e.message;admin.value="";}finally{confirm.disabled=false;}},"primary");c.append(admin,err,confirm,button("Ακύρωση",cancel));},"primary"),button("Ακύρωση",cancel));}
function adminStats(){if(!state?.player?.is_admin||resetOpen)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card admin-stat-panel");m.append(c);document.body.append(m);let days=30,season="all",group=0,seq=0;const body=el("div"),filters=el("div",undefined,"admin-stat-grid"),tabs=el("div",undefined,"admin-stat-grid");const names=["Εργασία","Προβλέψεις","Οικονομία","Κατάστημα","Δραστηριότητα"],kinds={statements:"Τελευταία κατάσταση",customers:"Πελάτες 12:00–13:00",potatoes:"Πατάτες στην ώρα τους",attendance:"Παρουσία εργαζομένου",departure_time:"Λήξη πριν τις 17:30",supervisor_shout:"Φώναξε προϊστάμενος μέχρι τη λήξη"};let data=null;const number=v=>v==null?"—":Number(v).toLocaleString("el-GR",{maximumFractionDigits:2}),pct=(a,b)=>b?number(100*a/b)+"%":"—",time=v=>v==null?"—":String(Math.floor(Math.round(v)/60)).padStart(2,"0")+":"+String(Math.round(v)%60).padStart(2,"0");function row(label,value){const x=el("div",undefined,"admin-stat-row");x.append(el("span",label),el("strong",String(value)));body.append(x);}function heading(t){body.append(el("h3",t));}function render(){body.replaceChildren();if(!data)return;const w=data.work||{},p=data.predictions||{},e=data.economy||{},sh=data.shop||{},a=data.activity||{};if(group===0){heading("Οριστικοποιημένα αποτελέσματα");row("Ημέρες",number(data.days));row("Μέση ώρα τελευταίας κατάστασης (εκτίμηση)",time(w.statements?.statement_minutes));row("Μέσος αριθμός πελατών 12:00–13:00 (κατώτατη εκτίμηση)",number(w.customers?.customers_lower_bound));row("Λήξη πριν τις 17:30",pct(w.departure_time?.before_count,w.departure_time?.n));for(const k of ["potatoes","supervisor_shout","attendance"])row(kinds[k],pct(w[k]?.yes,w[k]?.n));body.append(el("small","Οι ώρες υπολογίζονται από τα διαστήματα, με 15:00 και 17:00 ως σημεία αναφοράς στα ανοικτά άκρα. Το 5+ μετρά ως 5. Δεν είναι ακριβείς μετρήσεις."));heading("Ανά ημέρα εβδομάδας");for(const x of data.weekdays||[])row(["","Δευτέρα","Τρίτη","Τετάρτη","Πέμπτη","Παρασκευή","Σάββατο","Κυριακή"][x.weekday],time(x.minutes)+" · "+x.n+" δείγματα");heading("Κατανομή αποτελεσμάτων");for(const x of data.distributions||[])row((kinds[x.kind]||x.kind)+" · "+({yes:"Ναι",no:"Όχι",before:"Πριν",after:"Μετά",s1500:"≤15:00",s1530:"15:00–15:30",s1600:"15:30–16:00",s1630:"16:00–16:30",s1700:"16:30–17:00",s1700plus:"17:00+",c5plus:"5+"}[x.result]||x.result.replace(/^c/,"")),number(x.n));}else if(group===1){heading("Δελτία");for(const [l,k] of [["Σύνολο","tickets"],["Εκκρεμή","pending"],["Κερδισμένα","wins"],["Χαμένα","losses"],["Ίση επιστροφή","returned"],["Μέσο ποντάρισμα","avg_stake"],["Μεγαλύτερη επιστροφή","max_paid"],["Σύνολο πονταρισμάτων","staked"],["Επιστροφές","paid"]])row(l,number(p[k]));row("Ποσοστό κερδισμένων",pct(p.wins,p.wins+p.losses+p.returned));heading("Επιτυχία ανά ερώτηση");for(const x of data.markets||[])row(kinds[x.kind]||x.kind,pct(x.correct,x.resolved)+" · "+x.picks+" επιλογές · μ.ό. απόδοσης "+number(x.avg_odds));}else if(group===2){heading("Οικονομία · τρέχον υπόλοιπο");row("Σύνολο μαρκών",number(e.balance));row("Μέσο υπόλοιπο",number(e.avg_balance));heading("Κινήσεις περιόδου · όλες οι εποχές");for(const [k,l] of Object.entries({welcome:"Αρχικές πιστώσεις",weekly:"Εβδομαδιαίες πιστώσεις",admin_grant:"Πιστώσεις Admin",admin_remove:"Αφαιρέσεις Admin",stake:"Πονταρίσματα",settlement:"Επιστροφές",trophy:"Αγορές και δώρα",interest_in:"Τόκοι εισόδου",interest_out:"Τόκοι εξόδου",resignation_bonus:"Μπόνους"}))row(l,number(e.ledger?.[k]??0));}else if(group===3){heading("Κατάστημα · όλες οι εποχές");for(const [l,k] of [["Αγορές","purchases"],["Δώρα (μόνο σύνολο)","gifts"],["Μάρκες για δώρα","gift_spend"],["Αντικείμενα ποτέ αγορασμένα (αντίστροφα: χωρίς αγορά)","never_bought"]])row(l,number(sh[k]));row("Ακριβότερο αντικείμενο περιόδου",sh.max_item||"—");heading("Δημοφιλέστερα αντικείμενα");for(const x of sh.popular||[])row(x.name,number(x.n));}else{heading("Δραστηριότητα");row("Εγγεγραμμένοι συνολικά",number(a.registered));row("Εγκεκριμένοι τώρα",number(a.approved));row("Παίκτες με δελτίο",number(p.players));row("Παίκτες που ψήφισαν",number(a.voters));row("Σύνολο ψήφων",number(a.votes));heading("Ανά ημέρα");for(const x of (a.daily||[]).slice().reverse())row(dateFmt(x.dt),x.players+" παίκτες · "+x.tickets+" δελτία");}}async function load(){const id=++seq;body.replaceChildren(el("p","Φόρτωση στατιστικών…"));try{const x=await api("admin_stats",{days,season});if(id!==seq||!m.isConnected)return;data=x;render();}catch(err){if(id===seq)body.replaceChildren(el("p",err.message,"feedback"));}}function filter(label,opts,value,change){const w=el("div");w.append(el("small",label));const sel=el("select");for(const [v,t] of opts){const o=el("option",t);o.value=v;sel.append(o);}sel.value=value;sel.onchange=()=>{change(sel.value);load();};w.append(sel);filters.append(w);}filter("Περίοδος",[[7,"7 ημέρες"],[30,"30 ημέρες"],[90,"90 ημέρες"],[0,"Όλα"]],days,v=>days=Number(v));filter("Εποχή",[["all","Όλες"],["winter","Χειμερινή"],["summer","Θερινή"]],season,v=>season=v);names.forEach((n,i)=>tabs.append(button(n,()=>{group=i;render();})));c.append(el("h2","Κέντρο Στατιστικών"),filters,tabs,body,button("Ανανέωση",load),button("Κλείσιμο",()=>{seq++;resetOpen=false;m.remove();}));load();}
let chatView=null;
const CHAT_REFRESH_MS=60000,STATE_REFRESH_MS=300000,IDLE_AFTER_MS=600000,CHAT_DAILY_AUTO_LIMIT=60,STATE_DAILY_AUTO_LIMIT=30;
let lastInteraction=Date.now(),lastStateRequest=0,lastBoundary="";
function pollingActive(){return document.visibilityState==="visible"&&Date.now()-lastInteraction<IDLE_AFTER_MS;}
const volatilePollCounts=new Map();
function autoBudget(kind,limit,consume=false){if(!state?.player?.id)return false;const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const key="predictions-"+kind+"-poll:"+state.player.id;let old;try{old=JSON.parse(localStorage.getItem(key)||"null");}catch{old=volatilePollCounts.get(key);}const n=old?.day===today&&Number.isInteger(old.count)?Math.max(0,old.count):0;if(n>=limit)return false;if(consume){const next={day:today,count:n+1};volatilePollCounts.set(key,next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}}return true;}
function chatAutoBudget(consume=false){return autoBudget("chat",CHAT_DAILY_AUTO_LIMIT,consume);}
function stateAutoBudget(consume=false){return !state?.player?.id||autoBudget("state",STATE_DAILY_AUTO_LIMIT,consume);}
function mergeChatDelta(previous,data,limit){if(!data?.delta)return Array.isArray(data?.messages)?data.messages.slice(-limit):[];if(data.unchanged)return previous;const byId=new Map(previous.map(m=>[m.id,m]));for(const m of data.messages||[])byId.set(m.id,m);return (data.ids||[]).map(id=>byId.get(id)).filter(Boolean).slice(-limit);}

const inboxReadMemory=new Map();
function inboxRows(){return Array.isArray(state?.game?.private_inbox)?state.game.private_inbox:[];}
function inboxReadKey(peer){return "predictions-private-read:"+state.player.id+":"+peer;}
function inboxRead(peer){const key=inboxReadKey(peer);let v=inboxReadMemory.get(key);try{const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved&&(!v||Date.parse(saved.at)>=Date.parse(v.at)))v=saved;}catch{}return v;}
function inboxUnread(row){const seen=inboxRead(row.peer_id);return !seen||((Date.parse(row.last_at)>=Date.parse(seen.at))&&row.message_id!==seen.id);}
function markInboxRead(peer,messages){if(!peer||document.visibilityState!=="visible")return;const latest=messages.filter(m=>m.sender_id===peer&&m.recipient_id===state.player.id).at(-1);if(!latest)return;const key=inboxReadKey(peer),old=inboxRead(peer);if(old&&Date.parse(old.at)>Date.parse(latest.created_at))return;const val={at:latest.created_at,id:latest.id};inboxReadMemory.set(key,val);try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
function updateInboxBadges(){if(!state?.player?.id)return;const count=inboxRows().filter(inboxUnread).length;for(const b of document.querySelectorAll('[data-tab="Περισσότερα"],[data-chat-menu]')){let mark=b.querySelector(".private-inbox-badge");if(!count){mark?.remove();continue;}if(!mark){mark=el("span",undefined,"private-inbox-badge");Object.assign(mark.style,{position:"absolute",top:"2px",right:"4px",background:"#b91c1c",color:"#fff",fontSize:"11px",fontWeight:"800",padding:"2px 6px",borderRadius:"12px",minWidth:"18px",zIndex:"2",pointerEvents:"none"});b.style.position="relative";b.append(mark);}mark.textContent=String(count);mark.setAttribute("aria-label",count+" συνομιλίες με νέα μηνύματα");}}
function messageTime(t){if(!t)return "—";const date=new Date(t);return Number.isFinite(date.getTime())?date.toLocaleString("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";}
function chatPage(){
 section("Μηνύματα");const viewer=state.player.id,sessionToken=token,root=card();
 const top=el("div");Object.assign(top.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"});
 const mode=el("div",undefined,"odds"),select=el("select"),list=el("div"),composer=el("textarea"),err=el("p","","feedback");
 list.setAttribute("role","log");list.setAttribute("aria-label","Μηνύματα");Object.assign(list.style,{maxHeight:"48dvh",minHeight:"160px",overflowY:"auto",display:"grid",alignContent:"start",gap:"8px",padding:"10px",borderRadius:"16px",border:"1px solid var(--line)",background:"var(--bg)"});
 select.setAttribute("aria-label","Επιλογή μέλους");select.hidden=true;composer.placeholder="Γράψε μήνυμα…";composer.rows=2;composer.maxLength=1000;composer.setAttribute("aria-label","Κείμενο μηνύματος");
 let peer=null,privateMode=false,seq=0,reading=false,sending=false,pending=null,lastKey=null,lastRendered=null,conversations=[],messagesCache=[],lastChatRequest=0;
 const alive=()=>root.isConnected&&token===sessionToken&&state?.player?.id===viewer&&tab==="Chat";
 const send=button("Αποστολή",async()=>{
  if(!alive()||sending||privateMode&&!peer)return;
  const body=composer.value.trim();if(!body||[...body].length>1000){err.textContent="Γράψε μήνυμα 1–1.000 χαρακτήρων.";return;}
  if(pending&&(pending.body!==body||pending.peer!==peer)){err.textContent="Επανάλαβε το προηγούμενο μήνυμα πριν το αλλάξεις.";return;}
  if(!pending)pending={body,peer,request_id:crypto.randomUUID()};
  sending=true;seq++;reading=false;lock();err.textContent="";
  try{lastChatRequest=Date.now();const data=await api("chat_send",{...pending,known:messagesCache.map(m=>m.id)});if(!alive())return;pending=null;composer.value="";render(data,true);}
  catch(e){if(!alive())return;if(e.status&&e.status<500)pending=null;err.textContent=e.message+(pending?" · Δοκίμασε ξανά το ίδιο μήνυμα.":"");}
  finally{sending=false;if(alive())lock();}
 },"primary");
 const common=button("💬 Shoutbox",()=>switchMode(false),"primary"),priv=button("🔒 Προσωπικά",()=>switchMode(true),"secondary");
 const info=el("small","Κοινή συνομιλία · ανανέωση ανά λεπτό.","muted"),reload=button("↻ Ανανέωση",()=>load(true),"secondary");reload.textContent="↻";reload.setAttribute("aria-label","Ανανέωση μηνυμάτων");Object.assign(reload.style,{minHeight:"40px",width:"40px",flex:"0 0 40px",padding:"0",fontSize:"22px"});
 Object.assign(mode.style,{alignItems:"stretch",margin:"8px 0"});for(const btn of [common,priv])Object.assign(btn.style,{height:"44px",minHeight:"44px",margin:"0",padding:"6px",fontSize:"14px"});mode.append(common,priv);const status=el("div"),compose=el("div");Object.assign(status.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",margin:"8px 0"});Object.assign(compose.style,{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",gap:"8px",marginTop:"10px"});Object.assign(composer.style,{width:"100%",resize:"none",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--line)",borderRadius:"22px",padding:"11px 14px",font:"inherit",fontSize:"16px",minHeight:"48px",height:"48px",margin:"0",outlineOffset:"2px"});send.style.width="auto";send.style.margin="0";send.style.minHeight="48px";send.style.borderRadius="24px";send.style.maxWidth="125px";send.style.whiteSpace="normal";status.append(info,reload);compose.append(composer,send);err.style.margin="0";err.style.minHeight="0";const inbox=el("div");root.append(inbox,mode,select,status,list,compose,err);
 let inboxSignature="";
 function updateInbox(){if(!alive())return;const rows=inboxRows().slice().sort((a,b)=>Number(inboxUnread(b))-Number(inboxUnread(a))||Date.parse(b.last_at)-Date.parse(a.last_at));const sig=JSON.stringify(rows.map(r=>[r.peer_id,r.message_id,inboxUnread(r),r.peer_id===peer]));if(sig===inboxSignature)return;inboxSignature=sig;inbox.replaceChildren();if(!rows.length)return;inbox.append(el("h3","Προσωπικά μηνύματα"));for(const row of rows){const unread=inboxUnread(row),b=button("",()=>{if(sending||pending)return;if(!privateMode)switchMode(true);if(!Array.from(select.options).some(o=>o.value===row.peer_id)){const opt=el("option",row.nickname);opt.value=row.peer_id;select.append(opt);}select.value=row.peer_id;select.onchange();},"secondary");Object.assign(b.style,{display:"block",width:"100%",textAlign:"left",margin:"0 0 6px",padding:"10px",whiteSpace:"normal",border:unread?"2px solid #ff8088":"1px solid var(--line)"});b.append(el("strong",(unread?"🔴 Νέο · ":"")+row.nickname),el("p",row.preview||"Προσωπικό μήνυμα","muted"));b.lastChild.style.margin="4px 0 0";inbox.append(b);}}
 function lock(){common.disabled=priv.disabled=select.disabled=sending||!!pending;composer.disabled=sending||!!pending;send.disabled=sending||privateMode&&!peer;send.textContent=pending&&!sending?"Επανάληψη αποστολής":sending?"Αποστολή…":"Αποστολή";}
 function fillPeers(){
  const map=new Map((state.players||[]).filter(p=>p.id!==viewer).map(p=>[p.id,p.nickname]));for(const row of inboxRows())if(!map.has(row.peer_id))map.set(row.peer_id,row.nickname);
  for(const p of conversations)if(p.id!==viewer&&!map.has(p.id))map.set(p.id,p.nickname+" (παλιά συνομιλία)");
  select.replaceChildren();const blank=el("option","Επίλεξε μέλος");blank.value="";select.append(blank);
  for(const [id,name] of map){const opt=el("option",name);opt.value=id;select.append(opt);}
  select.value=peer||"";
 }
 function switchMode(next){if(sending||pending||privateMode===next)return;privateMode=next;peer=null;seq++;reading=false;lastKey=null;lastRendered=null;messagesCache=[];lastChatRequest=0;list.replaceChildren();select.hidden=!next;common.className=next?"secondary":"primary";priv.className=next?"primary":"secondary";info.textContent=next?"Προσωπική συνομιλία · ανανέωση ανά λεπτό.":"Κοινή συνομιλία · ανανέωση ανά λεπτό.";Object.assign(list.style,{maxHeight:next?"52dvh":"48dvh",gap:"8px"});if(next){fillPeers();list.append(el("p","Επίλεξε μέλος για ιδιωτική συνομιλία.","muted"));}else load(true);lock();}
 select.onchange=()=>{if(sending||pending)return;peer=select.value||null;seq++;reading=false;lastKey=null;lastRendered=null;messagesCache=[];lastChatRequest=0;list.replaceChildren();if(peer)load(true);else list.append(el("p","Επίλεξε μέλος.","muted"));lock();};
 function render(data,forceScroll=false){
  if(!alive())return;const nextConversations=Array.isArray(data.conversations)?data.conversations:[];if(JSON.stringify(nextConversations)!==JSON.stringify(conversations)){conversations=nextConversations;if(privateMode)fillPeers();}
  messagesCache=mergeChatDelta(messagesCache,data,privateMode?100:20);const messages=messagesCache,key=String(peer||"public"),sig=JSON.stringify(messages);if(privateMode&&peer){markInboxRead(peer,messages);updateInboxBadges();}updateInbox();
  if(lastKey===key&&lastRendered===sig)return;
  const bottom=forceScroll||lastKey!==key||list.scrollHeight-list.scrollTop-list.clientHeight<60;lastKey=key;lastRendered=sig;list.replaceChildren();
  if(!messages.length)list.append(el("p","Δεν υπάρχουν μηνύματα ακόμη.","muted"));
  for(const msg of messages){const item=el("div"),mine=msg.sender_id===viewer;
   const name=msg.announcement?"📢 Admin":mine?"Εσύ":msg.nickname||"Μέλος";
   const wrap=el("div"),avatar=el("span",msg.announcement?"📢":String(msg.nickname||name).slice(0,1).toUpperCase()),bubble=el("div"),header=el("div"),body=el("div",msg.body),time=el("small",messageTime(msg.created_at));
   Object.assign(item.style,{display:"flex",justifyContent:mine&&!msg.announcement?"flex-end":"flex-start",minWidth:"0"});
   Object.assign(wrap.style,{display:"flex",flexDirection:mine&&!msg.announcement?"row-reverse":"row",alignItems:"flex-end",gap:"6px",maxWidth:"94%",minWidth:"0"});
   Object.assign(avatar.style,{display:"grid",placeItems:"center",width:"30px",height:"30px",flex:"0 0 30px",borderRadius:"50%",background:"var(--card)",border:"1px solid var(--line)",fontWeight:"800",color:"var(--green)"});
   Object.assign(bubble.style,{minWidth:"0",padding:"8px 11px",border:"1px solid var(--line)",borderRadius:mine?"16px 16px 4px 16px":"16px 16px 16px 4px",background:mine?"color-mix(in srgb,var(--green) 15%,var(--card))":"var(--card)",overflowWrap:"anywhere"});
   if(msg.announcement){bubble.style.borderColor="var(--green)";bubble.style.background="color-mix(in srgb,var(--green) 9%,var(--card))";}
   Object.assign(header.style,{display:"flex",flexWrap:"wrap",alignItems:"baseline",gap:"4px 10px",justifyContent:"space-between",fontSize:"12px"});const author=el("strong",name);author.style.color="var(--green)";header.append(author,time);body.style.whiteSpace="pre-wrap";body.style.marginTop="4px";body.style.lineHeight="1.45";bubble.append(header,body);wrap.append(avatar,bubble);item.append(wrap);list.append(item);
  }if(bottom)list.scrollTop=list.scrollHeight;
 }
 async function load(force=false){
  if(!alive()||sending||reading||privateMode&&!peer)return;
  if(!force){if(!pollingActive()||Date.now()-lastChatRequest<CHAT_REFRESH_MS)return;if(!chatAutoBudget(true)){info.textContent="Η αυτόματη ανανέωση έφτασε το ημερήσιο όριο. Πάτησε Ανανέωση ή στείλε μήνυμα.";return;}}
  if(force&&Date.now()-lastChatRequest<3000)return;
  const stamp=++seq,p=peer,known=messagesCache.map(m=>m.id);reading=true;lastChatRequest=Date.now();reload.disabled=true;
  try{const data=await api("chat_list",{peer:p,known});if(alive()&&stamp===seq&&p===peer&&!sending){render(data,force);if(!pending)err.textContent="";}}
  catch(e){if(alive()&&stamp===seq)err.textContent=e.message;}
  finally{if(stamp===seq){reading=false;reload.disabled=false;}}
 }
 chatView={alive,load,updateInbox};lock();updateInbox();load(true);
}
function adminActionDialog(action,label,description,payload,withBody=false){
 if(resetOpen||busy||!state?.player?.is_admin)return;
 const key="predictions-admin-action:"+state.player.id+":"+action+":"+(payload.event_id||"global");let pending=null;
 try{const saved=localStorage.getItem(key);if(saved)pending=JSON.parse(saved);}catch{notice("Δεν είναι διαθέσιμη η ασφαλής αποθήκευση αιτήματος.");return;}
 resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card"),pin=pinField("adminActionPin","PIN Admin"),err=el("p","","feedback"),body=el("textarea");document.body.append(m);m.append(c);
 body.rows=4;body.maxLength=1000;body.placeholder="Κείμενο ανακοίνωσης";body.value=pending?.body||"";body.disabled=!!pending;
 let inFlight=false;
 function close(){if(inFlight)return;pin.value="";resetOpen=false;m.remove();}
 const cancel=button("Κλείσιμο",close),submit=button(pending?"Επανάληψη ίδιου αιτήματος":"Επιβεβαίωση",async()=>{
  if(inFlight||busy)return;if(!validPin(pin.value)){err.textContent="Πληκτρολόγησε το PIN Admin.";return;}
  const value=body.value.trim();if(withBody&&(!value||[...value].length>1000)){err.textContent="Γράψε ανακοίνωση 1–1.000 χαρακτήρων.";return;}
  const existing=!!pending;
  if(!pending){try{pending={...payload,request_id:crypto.randomUUID(),...(withBody?{body:value}:{})};localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;err.textContent="Αδυναμία ασφαλούς αποθήκευσης αιτήματος.";return;}}
  inFlight=true;busy=true;revision++;submit.disabled=cancel.disabled=body.disabled=true;
  try{state=await api(action,{...pending,admin_pin:pin.value});try{localStorage.removeItem(key);}catch{}inFlight=false;close();clock();show("Εργαλεία Admin");notice("Η ενέργεια ολοκληρώθηκε.");}
  catch(e){if(!existing&&e.status&&e.status<500){try{localStorage.removeItem(key);pending=null;}catch{}}err.textContent=e.message+(pending?" · Επανάλαβε το ίδιο αίτημα.":"");submit.textContent=pending?"Επανάληψη ίδιου αιτήματος":"Επιβεβαίωση";}
  finally{pin.value="";inFlight=false;busy=false;submit.disabled=cancel.disabled=false;body.disabled=!!pending;}
 },"primary");
 c.append(el("h2",label),el("p",description));if(withBody)c.append(body);c.append(pin,err,submit,cancel);
}
function importStaffPhotos(){
 if(resetOpen||busy||!state?.player?.is_admin)return;
 resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card"),file=el("input"),pin=pinField("staffPhotoAdminPin","PIN Admin"),err=el("p","","feedback"),info=el("p","Επίλεξε το αρχείο JSON με τα κοινά avatar.","muted");
 m.append(c);document.body.append(m);file.type="file";file.accept=".json,application/json";let list=null,inFlight=false;
 function close(){if(inFlight)return;pin.value="";list=null;resetOpen=false;m.remove();}
 const cancel=button("Κλείσιμο",close),submit=button("Εισαγωγή φωτογραφιών",async()=>{
  if(inFlight||busy||!list||!validPin(pin.value)){err.textContent="Επίλεξε έγκυρο αρχείο και πληκτρολόγησε το PIN Admin.";return;}
  inFlight=true;busy=true;submit.disabled=cancel.disabled=file.disabled=pin.disabled=true;err.textContent="";
  try{const result=await api("import_staff_photos",{staff:list,admin_pin:pin.value});
   inFlight=false;close();await refresh(true);notice("Αποθηκεύτηκαν "+result.saved+" φωτογραφίες · "+result.linked+" υπάρχοντες λογαριασμοί ενημερώθηκαν.");
  }catch(e){err.textContent=e.message;}finally{inFlight=false;busy=false;pin.value="";submit.disabled=cancel.disabled=file.disabled=pin.disabled=false;}
 },"primary");
 submit.disabled=true;
 file.onchange=async()=>{list=null;submit.disabled=true;err.textContent="";try{const f=file.files?.[0];if(!f||f.size>125000)throw Error("Άκυρο αρχείο.");
  const x=JSON.parse(await f.text());if(x.version!==1||!Array.isArray(x.staff)||x.staff.length<1||x.staff.length>31||new Set(x.staff.map(p=>p.staff_name)).size!==x.staff.length||!x.staff.every(p=>typeof p.staff_name==="string"&&typeof p.avatar==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.avatar)))throw Error("Μη έγκυρο αρχείο φωτογραφιών.");
  list=x.staff;info.textContent=list.length+" φωτογραφίες: "+list.map(p=>p.staff_name).join(", ");submit.disabled=false;
 }catch(e){err.textContent=e.message;}};
 c.append(el("h2","Κοινές φωτογραφίες προσωπικού"),el("small","Μόνο με έγκριση των εργαζομένων. Ενημερώνονται οι ήδη συνδεδεμένοι λογαριασμοί χωρίς αλλαγή PIN ή υπολοίπου."),file,info,pin,err,submit,cancel);
}
function adminToolsPage(){
 if(!state?.player?.is_admin)return show("Γεγονότα");
 section("Εργαλεία Admin");screen.append(button("‹ Πίσω",moreBack,"secondary"));
 const c=card(),viewer=state.player.id,sessionToken=token;let seq=0;
 c.append(button("🖼️ Εισαγωγή κοινών avatar",importStaffPhotos,"secondary"));
 c.append(button("📢 Νέα ανακοίνωση",()=>adminActionDialog("admin_announcement","Νέα ανακοίνωση","Εμφανίζεται στα Γεγονότα και στο κοινό Chat όλων των εγκεκριμένων μελών.",{},true),"primary"));
 const output=el("div"),refreshButton=button("Ανανέωση",load,"secondary");c.append(refreshButton,output);
 function alive(){return c.isConnected&&token===sessionToken&&state?.player?.id===viewer&&tab==="Εργαλεία Admin";}
 function row(parent,label,value){const r=el("div",undefined,"admin-stat-row");r.append(el("span",label),el("strong",String(value??"—")));parent.append(r);}
 async function load(){const stamp=++seq;refreshButton.disabled=true;output.replaceChildren(el("p","Φόρτωση…","muted"));
  try{const data=await api("admin_overview");if(!alive()||stamp!==seq)return;output.replaceChildren();
   const sys=data.system||{};output.append(el("h3","Κατάσταση συστήματος"));row(output,"Οικονομία",sys.economy_enabled?"Ενεργή":"Ανενεργή");row(output,"Συγχρονισμός",sys.sync_ok?"Εντάξει":"Εκκρεμεί");row(output,"Τελευταίος συγχρονισμός",messageTime(sys.staff_synced_at));row(output,"Συσκευές push",sys.enabled_devices);row(output,"Αποστολές 24ωρου",sys.push_sent_24h);row(output,"Διακοπές αποστολής",sys.push_stopped_24h);row(output,"Εκκρεμή δελτία",sys.pending_tickets);output.append(el("small","Η καταγραφή αποστολής δεν αποδεικνύει παραλαβή στο κινητό."));
   output.append(el("h3","Ακύρωση εκκρεμούς ερώτησης"));for(const e of data.events||[]){const item=el("div",undefined,"card");item.append(el("strong",e.name),el("small",e.target_date+" · "+e.picks+" επιλογές"),button("Ακύρωση ερώτησης",()=>adminActionDialog("admin_cancel","Ακύρωση ερώτησης",e.name+" · Η επιλογή αποκτά απόδοση 1,00. Μονό δελτίο επιστρέφεται· συνδυαστικό εκκαθαρίζεται όταν κλείσουν οι υπόλοιπες επιλογές.",{event_id:e.id}),"danger"));output.append(item);}
   if(!(data.events||[]).length)output.append(el("p","Δεν υπάρχουν εκκρεμείς ερωτήσεις.","muted"));
   output.append(el("h3","Ιστορικό ενεργειών (τελευταίες 100)"));const labels={approve:"Έγκριση",reject:"Απόρριψη",suspend:"Αναστολή",reset_pin:"Αλλαγή PIN",rename:"Διόρθωση ονόματος",archive:"Αφαίρεση μέλους",admin_grant:"Πίστωση μαρκών",admin_remove:"Αφαίρεση μαρκών",cancel_event:"Ακύρωση ερώτησης",announcement:"Ανακοίνωση"};
   for(const a of data.history||[]){const item=el("div",undefined,"card");item.append(el("strong",labels[a.action]||a.action),el("small",[messageTime(a.created_at),a.actor,a.target].filter(Boolean).join(" · ")));if(a.details?.amount!=null)item.append(el("p",fmt(a.details.amount)+" 🪙"));if(a.details?.name)item.append(el("p",a.details.name));output.append(item);}
   if(!(data.history||[]).length)output.append(el("p","Δεν υπάρχουν καταχωρίσεις.","muted"));
  }catch(e){if(alive()&&stamp===seq)output.replaceChildren(el("p",e.message,"feedback"));}finally{if(alive()&&stamp===seq)refreshButton.disabled=false;}
 }load();
}
function adminGrant(p,remove=false){
 const action=remove?"admin_remove":"admin_grant",verb=remove?"Αφαίρεση":"Πίστωση",confirmLabel=remove?"Επιβεβαίωση αφαίρεσης":"Επιβεβαίωση πίστωσης",retryLabel="Επανάληψη ίδιου αιτήματος";
 if(resetOpen||busy||!state?.player?.is_admin||(remove&&p.is_admin)||p.status!=="approved")return;
 const key=(remove?"predictions-admin-remove:":"predictions-admin-grant:")+state.player.id+":"+p.id;let pending=null;
 try{const saved=localStorage.getItem(key);if(saved)pending=JSON.parse(saved);}catch{notice("Δεν είναι διαθέσιμη η ασφαλής αποθήκευση αιτήματος.");return;}
 resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);
 const amount=el("input"),pin=pinField("grantAdminPin","PIN Admin"),err=el("p","","feedback");
 amount.type="number";amount.inputMode="numeric";amount.min=1;amount.max=100000;amount.step=1;amount.value=pending?.amount??"";amount.placeholder="Ποσό μαρκών";amount.setAttribute("aria-label","Ποσό μαρκών");amount.disabled=!!pending;
 const current=(state.players||[]).find(x=>x.id===p.id)?.chips;
 let inFlight=false;
 function close(){if(inFlight)return;pin.value="";resetOpen=false;m.remove();}
 const cancel=button("Κλείσιμο",close);
 const submit=button(pending?retryLabel:confirmLabel,async()=>{
  if(inFlight||busy)return;
  const n=Number(amount.value);
  if(!Number.isSafeInteger(n)||n<1||n>100000){err.textContent="Πληκτρολόγησε ακέραιο ποσό 1–100.000 μαρκών.";return;}
  if(!validPin(pin.value)){err.textContent="Πληκτρολόγησε το PIN Admin.";return;}
  const existing=!!pending;
  if(!pending){try{pending={amount:n,request_id:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;err.textContent="Αδυναμία ασφαλούς αποθήκευσης αιτήματος.";return;}}
  inFlight=true;busy=true;revision++;amount.disabled=true;submit.disabled=true;cancel.disabled=true;
  try{
   state=await api(action,{target:p.id,amount:pending.amount,request_id:pending.request_id,admin_pin:pin.value});
   try{localStorage.removeItem(key);}catch{}
   inFlight=false;close();clock();show("Διαχείριση");notice((remove?"Αφαιρέθηκαν ":"Πιστώθηκαν ")+fmt(n)+" μάρκες.");
  }catch(e){
   if(!existing&&e.status&&e.status<500){try{localStorage.removeItem(key);pending=null;}catch{}}
   amount.disabled=!!pending;submit.textContent=pending?retryLabel:confirmLabel;
   err.textContent=e.message+(pending?" · Επανάλαβε το ίδιο αίτημα χωρίς κίνδυνο δεύτερης πίστωσης.":"");
  }finally{pin.value="";inFlight=false;busy=false;submit.disabled=false;cancel.disabled=false;}
 },"primary");
 c.append(el("h2",verb+" μαρκών · "+p.nickname));
 if(current!=null)c.append(el("p","Τρέχον υπόλοιπο: "+fmt(current)+" 🪙"));
 c.append(el("small",remove?"Αφαιρούνται μόνο μη δεσμευμένες εικονικές μάρκες. Δεν αλλάζουν τα καθαρά κέρδη.":"Δωρεάν εικονικές μάρκες, χωρίς χρηματική αξία. Δεν προσμετρώνται στα καθαρά κέρδη."),el("label","Ποσό μαρκών (1–100.000)"),amount,pin,err,submit,cancel);
 if(pending)err.textContent="Εκκρεμεί προηγούμενο αίτημα. Η επανάληψη δεν δημιουργεί δεύτερη πίστωση.";
}
function admin(){if(!state.player.is_admin)return show("Γεγονότα");const accounts=state.accounts||[];section("Διαχείριση",accounts.filter(x=>x.status==="pending").length+" αιτήματα");screen.append(button("📊 Κέντρο Στατιστικών",adminStats,"primary"),button("🛠️ Εργαλεία Admin",()=>menuGo("Εργαλεία Admin"),"secondary"));const season=card();season.append(el("h3","Εποχή εργασίας"),el("small","Επηρεάζει τις αποδόσεις των επόμενων γύρων, όχι τα ήδη ανοιχτά δελτία."));const grid=el("div",undefined,"odds");for(const [key,label] of [["winter","Χειμερινή"],["summer","Θερινή"]]){const b=button(label,()=>transact("season",{season:key},"Διαχείριση","Η εποχή ενημερώθηκε."),game().season===key?"primary":"");grid.append(b);}season.append(grid);section("Λογαριασμοί",String(accounts.filter(p=>p.status!=="rejected").length));for(const p of accounts.filter(p=>p.status!=="rejected")){const c=card(),head=el("div",undefined,"admin-member-head"),info=el("div");info.append(el("h3",p.nickname),el("small",({pending:"Αναμονή",approved:"Εγκεκριμένος",suspended:"Σε αναστολή"})[p.status]));head.append(avatar(p),info);c.append(head);if(p.is_admin){if(p.status==="approved"){const own=el("div",undefined,"actions");own.append(button("🪙 Πίστωση μαρκών στον Admin",()=>adminGrant(p),"primary"));c.append(own);}continue;}const a=el("div",undefined,"actions");if(p.status==="pending"){const remaining=el("small",""),accept=button("Αποδοχή",()=>manage(p,"approve"));info.append(remaining);a.append(accept,button("Απόρριψη",()=>manage(p,"reject")));c.append(a);registrationCountdown(p,remaining,()=>{accept.disabled=true;});continue;}if(p.status==="suspended")a.append(button("Αποδοχή",()=>manage(p,"approve")));if(p.status==="approved")a.append(button("🪙 Πίστωση μαρκών",()=>adminGrant(p),"primary"),button("Αφαίρεση μαρκών",()=>adminGrant(p,true),"danger"),button("Αναστολή",()=>manage(p,"suspend")));a.append(button("Διόρθωση ονόματος",()=>memberManage(p,"rename")),button("Διαγραφή",()=>memberManage(p,"archive"),"danger"),button("Νέο PIN",()=>resetPin(p)));c.append(a);}}

function departureAdmin(w,operation){
 if(resetOpen||busy)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);
 const title=operation==="enable"?"Ενεργοποίηση με συγκατάθεση":operation==="disable"?"Ανάκληση συγκατάθεσης":"Επιβεβαίωση παραίτησης";
 c.append(el("h2",title),el("p",w.name));let input=null;
 if(operation==="confirm"){input=el("input");input.type="date";input.max=game().open_date||date;input.value=input.max;c.append(el("p","Η πραγματική ημερομηνία αποχώρησης"),input);}
 const check=el("input");check.type="checkbox";check.className="departure-check";
 const label=el("label",undefined,"departure-consent");label.append(check,el("span",operation==="enable"?"Ο εργαζόμενος έχει συμφωνήσει ρητά να συμμετέχει.":operation==="disable"?"Επιστρέφονται τα εκκρεμή πονταρίσματα.":"Επιβεβαιώνω ότι η παραίτηση είναι πραγματική και γνωστή με τη συγκατάθεση του εργαζομένου."));
 const pin=pinField("departureAdminPin","PIN Admin"),err=el("p","","feedback");
 function close(){pin.value="";resetOpen=false;m.remove();}
 const submit=button("Επιβεβαίωση",async()=>{if(!check.checked||!validPin(pin.value)||(input&&!input.value)){err.textContent="Συμπλήρωσε όλα τα στοιχεία.";return;}submit.disabled=true;busy=true;try{const payload={operation,worker_id:w.id,admin_pin:pin.value,consent:operation==="enable",confirmed:operation==="confirm"};if(input)payload.departed_on=input.value;state=await api("departure",payload);close();clock();show("Παραιτήσεις");notice("Η ενέργεια καταχωρίστηκε.");}catch(e){err.textContent=e.message;pin.value="";}finally{busy=false;submit.disabled=false;}},"primary");
 c.append(label,pin,err,submit,button("Ακύρωση",()=>{if(!busy)close();}));
}
function departures(){
 const d=state.departure;section("Μακροχρόνιες προβλέψεις");
 if(!d){notice("Τα δεδομένα δεν είναι διαθέσιμα. Κάνε ανανέωση.");return;}
 const hero=card();hero.append(el("small","ΜΠΟΝΟΥΣ ΣΩΣΤΗΣ ΠΡΟΒΛΕΨΗΣ"),el("p","+2.000 🪙","amount"),el("p","Διπλάσιο ποντάρισμα ως επιστροφή, συν το μπόνους.","muted"),el("small","Διαθέσιμες μάρκες: "+fmt(d.available)));
 const choices=(d.subjects||[]).filter(w=>!w.already);
 if(choices.length){const c=card(),worker=el("select"),windowSelect=el("select"),stakeInput=el("input"),preview=el("p","","amount");c.append(el("h3","Νέα πρόβλεψη"));
 for(const w of choices){const o=el("option",w.name);o.value=w.id;worker.append(o);}
 for(const w of d.windows||[]){const b=w.bucket,label=b<=4?b+"η εβδομάδα":(b-3)+"ος μήνας";const o=el("option",label+" · "+dateFmt(w.start)+" – "+dateFmt(w.end));o.value=b;windowSelect.append(o);}
 stakeInput.type="number";stakeInput.inputMode="numeric";stakeInput.min=10;stakeInput.max=Math.min(100,Number(d.available));stakeInput.value=Math.min(50,Math.max(10,Number(stakeInput.max)));
 const submit=button("Οριστική πρόβλεψη",()=>{const n=Number(stakeInput.value);if(!Number.isInteger(n)||n<10||n>Number(stakeInput.max))return;const m=el("div",undefined,"modal"),box=el("div",undefined,"card");m.append(box);document.body.append(m);resetOpen=true;const name=choices.find(x=>x.id===worker.value)?.name||"";const period=windowSelect.selectedOptions[0]?.textContent||"";function close(){m.remove();resetOpen=false;}box.append(el("h2","Επιβεβαίωση πρόβλεψης"),el("p",name+" · "+period),el("p",fmt(n)+" μάρκες"),button("Καταχώριση",()=>{close();transact("departure",{operation:"place",worker_id:worker.value,bucket:Number(windowSelect.value),stake:n},"Παραιτήσεις","Η πρόβλεψη καταχωρίστηκε οριστικά.");},"primary"),button("Ακύρωση",close));},"primary");
 function update(){const n=Number(stakeInput.value),ok=Number.isInteger(n)&&n>=10&&n<=Number(stakeInput.max);preview.textContent=ok?fmt(n*2+2000)+" 🪙":"—";submit.disabled=!ok;}stakeInput.oninput=update;
 c.append(el("small","Εργαζόμενος"),worker,el("small","Περίοδος"),windowSelect,el("small","Ποντάρισμα 10–100"),stakeInput,el("small","Συνολική επιστροφή αν είναι σωστή"),preview,submit);update();
 }else notice("Δεν υπάρχουν διαθέσιμες προβλέψεις με συγκατάθεση.");
 section("Οι προβλέψεις μου");
 for(const p of d.picks||[]){const c=card();const label=({pending:"Εκκρεμεί",won:"Κερδισμένη",lost:"Χαμένη",void:"Επιστροφή"})[p.status];c.append(el("h3",p.worker_name),el("small",dateFmt(p.start_day)+" – "+dateFmt(p.end_day)),el("p",fmt(p.stake)+" 🪙 · "+label,p.status==="won"?"profit":p.status==="lost"?"loss":"muted"));if(p.status==="won")c.append(el("strong","+"+fmt(Number(p.paid)+Number(p.bonus)-Number(p.stake))+" καθαρά","profit"));}
 if(!d.picks?.length)notice("Δεν υπάρχουν ακόμη προβλέψεις.");
 notice("Μία ενεργή πρόβλεψη ανά εργαζόμενο με συγκατάθεση. Η περίοδος ξεκινά αύριο. Περιθώριο επιβεβαίωσης: 7 ημέρες μετά τη λήξη. Χωρίς επιβεβαίωση η πρόβλεψη χάνεται.");
 if(state.player.is_admin){section("Συγκαταθέσεις εργαζομένων");for(const w of d.admin_subjects||[]){const c=card();c.append(el("h3",w.name),el("small",w.departed_on?"Επιβεβαιωμένη αποχώρηση "+dateFmt(w.departed_on):w.enabled?"Συγκατάθεση καταχωρισμένη":"Δεν υπάρχει συγκατάθεση"));if(w.departed_on)continue;const a=el("div",undefined,"actions");if(!w.enabled&&w.active)a.append(button("Ενεργοποίηση",()=>departureAdmin(w,"enable")));if(w.enabled){a.append(button("Ανάκληση",()=>departureAdmin(w,"disable")),button("Επιβεβαίωση παραίτησης",()=>departureAdmin(w,"confirm")));}c.append(a);}}
}

const PUSH_API="https://zrbmsziipzabnniqcpav.supabase.co/functions/v1/predictions-push";
async function pushAPI(action,data={}){const r=await fetch(PUSH_API,{method:"POST",headers:{"Content-Type":"application/json","X-Predictions-Session":token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||"Πρόβλημα ειδοποιήσεων.");return j;}
function pushSupported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
async function pushRegistration(){const reg=await navigator.serviceWorker.getRegistration(location.pathname.replace(/[^/]*$/,""));if(!reg||!reg.active)throw Error("Η εφαρμογή χρειάζεται ανανέωση.");return reg;}
function decodePushKey(s){const base=(s+"=".repeat((4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(base),c=>c.charCodeAt(0));}
async function enablePush(){if(!pushSupported())throw Error("Η συσκευή δεν υποστηρίζει push.");const perm=await Notification.requestPermission();if(perm!=="granted")throw Error("Δεν δόθηκε άδεια ειδοποιήσεων.");const reg=await pushRegistration();const key=await pushAPI("key");let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodePushKey(key.publicKey)});await pushAPI("subscribe",{subscription:sub.toJSON()});}
async function disablePush(){if(!pushSupported())return;const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(sub){let error=null;try{await pushAPI("disable",{endpoint:sub.endpoint});}catch(e){error=e;}const ended=await sub.unsubscribe();if(error&&!ended)throw error;}}
function notifications(parent=screen){
 const c=el("div",undefined,"card push-card");parent.append(c);c.append(el("h3","🔔 Ειδοποιήσεις συσκευής"));
 const status=el("p","Έλεγχος…","muted"),msg=el("p","","feedback"),enable=button("Ενεργοποίηση",()=>act("enable"),"primary"),disable=button("Απενεργοποίηση",()=>act("disable")),test=button("Δοκιμαστική ειδοποίηση",()=>act("test"));
 const controls=el("div",undefined,"odds push-controls");test.classList.add("push-test");controls.append(enable,disable);c.append(status,controls,test,msg);enable.disabled=disable.disabled=test.disabled=true;
 if(!pushSupported()){status.textContent="Δεν υποστηρίζονται push σε αυτό το περιβάλλον. Στο iPhone πρόσθεσε πρώτα την εφαρμογή στην οθόνη έναρξης.";return;}
 let working=false;
 async function update(){try{const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription(),enabled=!!(sub&&Notification.permission==="granted"&&(await pushAPI("status",{endpoint:sub.endpoint})).enabled);status.textContent=enabled?"✓ Οι ειδοποιήσεις είναι ενεργές":"Οι ειδοποιήσεις είναι ανενεργές";enable.disabled=enabled||working;disable.disabled=!sub||working;test.disabled=!enabled||working;}catch(e){status.textContent=e.message;enable.disabled=working;disable.disabled=working;test.disabled=true;}}
 async function act(op){if(working)return;working=true;enable.disabled=disable.disabled=test.disabled=true;msg.textContent="";try{if(op==="enable"){await enablePush();msg.textContent="Οι ειδοποιήσεις ενεργοποιήθηκαν.";}else if(op==="disable"){await disablePush();msg.textContent="Οι ειδοποιήσεις απενεργοποιήθηκαν.";}else{const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(!sub)throw Error("Ενεργοποίησε πρώτα τις ειδοποιήσεις.");await pushAPI("test",{endpoint:sub.endpoint});msg.textContent="Η δοκιμαστική ειδοποίηση στάλθηκε."}}catch(e){msg.textContent=e.message;}finally{working=false;await update();}}
 update();c.append(el("small","Νέα γεγονότα, υπενθύμιση στις 23:00 αν δεν έχεις δελτίο, εγγραφές, δάνεια, δώρα και αποτελέσματα."));
}
function extra(k){section(k);if(k==="Ειδοποιήσεις"||k==="Ρυθμίσεις"){notifications();return;}notice("Η λειτουργία δεν έχει ακόμη ενεργοποιηθεί.");}
const pages={"Chat":chatPage,"Εργαλεία Admin":adminToolsPage,"Σημερινά αποτελέσματα":todayResults,"Οδηγός παιχνιδιού":helpGuide,"Καζίνο":casino,"Η εμφάνισή μου":appearancePage,"Μέλη":members,"Γεγονότα":events,"Δελτίο":ticket,"Τράπεζα":bank,"Κατάταξη":ranking,"Περισσότερα":more,"Προφίλ":()=>profile((state.players||[]).find(p=>p.id===profileTarget)||state.player),"Τρόπαια":trophies,"Κατάστημα":trophies,"Διαχείριση":admin,"Παραιτήσεις":departures};
const nav=[["🎯","Γεγονότα"],["🎫","Δελτίο"],["🎰","Καζίνο"],["🏅","Κατάταξη"],["👤","Προφίλ"],["☰","Περισσότερα"]];
function show(k){if(!state||state.player.status!=="approved"||resetOpen)return;if(k!=="Chat")chatView=null;if(k!=="Η εμφάνισή μου"&&!(k==="Κατάστημα"&&appearanceKeys.includes(shopTab)))liveDraft=null;tab=k;clock();screen.replaceChildren();for(const b of $("tabs").children)b.setAttribute("aria-selected",String(b.dataset.tab===k||b.dataset.tab==="Περισσότερα"&&!nav.some(n=>n[1]===k)));(pages[k]||(()=>extra(k)))();updateInboxBadges();attachFirstHelp(k);}
// Each user-initiated screen transition is a real browser history entry.
// Rendering or background synchronization does not add entries.
// Each user-initiated screen transition is a real browser history entry.
// Rendering and background synchronization do not add entries.
const menuHistory=[];
const predictionsNavInstance=crypto.randomUUID();
let predictionsNavDepth=0,predictionsNavReady=false,predictionsOverlay=null,predictionsPopClosing=false,predictionsClosingEntry=false;
function menuSnapshot(){return {tab,shopTab,giftTarget,giftGroup,profileTarget,appearanceTab,casinoMode,rankingPeriod,y:window.scrollY,search:tab==="Μέλη"?(screen.querySelector('input[type="search"]')?.value||""):""};}
function predictionsNavWrite(method,f,depth,overlay=false){history[method]({...history.state,predictionsNav:{instance:predictionsNavInstance,owner:state.player.id,depth,screen:f,overlay}},"");}
function predictionsNavInit(){if(predictionsNavReady)return;predictionsNavDepth=0;predictionsNavWrite("replaceState",menuSnapshot(),0);predictionsNavReady=true;}
function predictionsNavKey(f){return JSON.stringify([f.tab,f.shopTab,f.giftTarget,f.giftGroup,f.profileTarget,f.appearanceTab,f.casinoMode,f.rankingPeriod]);}
function predictionsModal(){return document.querySelector("dialog[open],.modal");}
function menuGo(k,change){
 if(resetOpen||busy||!state||state.player.status!=="approved"||predictionsClosingEntry)return;
 predictionsNavInit();const before=menuSnapshot(),replacingOverlay=!!predictionsOverlay&&!predictionsModal();
 if(!replacingOverlay)predictionsNavWrite("replaceState",before,predictionsNavDepth);
 if(change)change();show(k);const after=menuSnapshot();
 if(predictionsNavKey(before)!==predictionsNavKey(after)){
  window.scrollTo(0,0);after.y=0;
  if(replacingOverlay){predictionsOverlay=null;predictionsNavWrite("replaceState",after,predictionsNavDepth);}
  else predictionsNavWrite("pushState",after,++predictionsNavDepth);
 }
}
function menuRestore(f){shopTab=f.shopTab;giftTarget=f.giftTarget;giftGroup=f.giftGroup;profileTarget=f.profileTarget;appearanceTab=f.appearanceTab;casinoMode=f.casinoMode||"menu";rankingPeriod=f.rankingPeriod||"wealth";show(f.tab);if(f.tab==="Μέλη"&&f.search){const search=screen.querySelector('input[type="search"]');if(search){search.value=f.search;search.dispatchEvent(new Event("input"));}}window.scrollTo(0,f.y||0);requestAnimationFrame(()=>{if(tab===f.tab)window.scrollTo(0,f.y||0);});}
function predictionsTrackOverlay(){
 if(!state||state.player.status!=="approved"||predictionsPopClosing||predictionsClosingEntry)return;
 const modal=predictionsModal();
 if(modal&&!predictionsOverlay){predictionsNavInit();const f=menuSnapshot();predictionsNavWrite("replaceState",f,predictionsNavDepth);predictionsOverlay=modal;predictionsNavWrite("pushState",f,++predictionsNavDepth,true);return;}
 if(!modal&&predictionsOverlay){
  predictionsOverlay=null;
  const entry=history.state?.predictionsNav;
  if(!entry?.overlay||entry.instance!==predictionsNavInstance)return;
  const f=menuSnapshot();
  if(predictionsNavKey(f)!==predictionsNavKey(entry.screen)){predictionsNavWrite("replaceState",f,predictionsNavDepth);return;}
  predictionsClosingEntry=true;history.back();
 }
}
window.addEventListener("popstate",e=>{
 const v=e.state?.predictionsNav;
 if(!state||state.player.status!=="approved"||v?.instance!==predictionsNavInstance||v.owner!==state.player.id)return;
 const modal=predictionsModal(),oldDepth=predictionsNavDepth;
 if(modal){
  predictionsPopClosing=true;
  const cancel=Array.from(modal.querySelectorAll("button")).reverse().find(b=>!b.disabled&&/^(Ακύρωση|Κλείσιμο)$/.test(b.textContent.trim()));
  if(cancel&&!busy)cancel.click();
  predictionsPopClosing=false;
  if(predictionsModal()){if(oldDepth!==v.depth)history.go(oldDepth-v.depth);return;}
  predictionsOverlay=null;
 }
 predictionsClosingEntry=false;predictionsNavDepth=v.depth;
 if(predictionsNavKey(menuSnapshot())!==predictionsNavKey(v.screen))menuRestore(v.screen);
 else window.scrollTo(0,v.screen.y||0);
 // A forward navigation to an already dismissed modal restores its screen, not an expired action.
 if(v.overlay)predictionsNavWrite("replaceState",v.screen,v.depth);
});
new MutationObserver(predictionsTrackOverlay).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});
function moreBack(){if(resetOpen||busy||predictionsClosingEntry)return;if(predictionsNavDepth>0){history.back();return;}if((tab==="Κατάστημα"||tab==="Τρόπαια")&&shopTab!=="menu"){shopTab="menu";show("Κατάστημα");}else if(tab!=="Περισσότερα")show("Περισσότερα");window.scrollTo(0,0);}
for(const [icon,k] of nav){const b=button("",()=>{if(k==="Περισσότερα"&&tab==="Περισσότερα")return;menuGo(k,()=>{if(k==="Προφίλ")profileTarget=null;});});b.dataset.tab=k;b.append(el("i",icon),el("span",k));$("tabs").append(b);}
$("profileButton").onclick=()=>menuGo("Προφίλ",()=>{profileTarget=null;});
function clock(){if(!state||state.player.status!=="approved")return;const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),p=t=>parts.find(x=>x.type===t).value;date=p("year")+"-"+p("month")+"-"+p("day");const time=p("hour")+":"+p("minute"),balance=Number(state.player.chips);available=Math.max(0,balance-Number(game().reserve??R.reserve(date)));$("balance").textContent=fmt(balance);$("clock").textContent=time;$("phase").dataset.phase=game().phase||"closed";$("phase").textContent=({open:"● Ανοιχτά",vote:"Επιβεβαίωση",locked:"🔒 Κλειδωμένα",closed:"Κλειστά"})[game().phase]||"Κλειστά";$("target").textContent=dateFmt(tab==="Σημερινά αποτελέσματα"?date:game().target_date||R.nextWorkday(date));$("target").previousElementSibling.textContent=tab==="Σημερινά αποτελέσματα"?"Ημερομηνία αποτελεσμάτων":"Ημερομηνία προβλέψεων";$("available").textContent=fmt(available);$("reserve").textContent=fmt(balance-available);$("fundFill").style.width=(balance?available/balance*100:0)+"%";}
async function refresh(draw=false){
 if(!token||resetOpen||refreshing||(!draw&&busy))return;refreshing=true;lastStateRequest=Date.now();const started=revision,sessionToken=token;
 try{
 const oldStatus=state?.player?.status,oldCasino=JSON.stringify(state?.casino),oldGame=JSON.stringify(state?.game),oldBank=JSON.stringify(state?.bank),oldShop=JSON.stringify(state?.shop),oldPlayers=JSON.stringify(state?.players),oldDeparture=JSON.stringify(state?.departure),oldAnnouncement=JSON.stringify(state?.announcement);
 const next=await api("state");if(started!==revision||sessionToken!==token||resetOpen||(!draw&&busy))return;
 state=next;rememberLoginProfiles(state);
 if(state.player.status==="pending"){if(draw||oldStatus!=="pending")pending();return;}
 toggleGame(true);$("profileButton").replaceChildren(avatar(state.player));clock();updateInboxBadges();if(chatView?.alive())chatView.updateInbox?.();
 if(draw||oldStatus!=="approved"){const key=new URLSearchParams(location.search).get("open"),routes={events:"Γεγονότα",tickets:"Δελτίο",bank:"Τράπεζα",profile:"Προφίλ",admin:"Διαχείριση",chat:"Chat",...(window.self!==window.top?{adminTools:"Εργαλεία Admin"}:{})};if(key&&routes[key]){const u=new URL(location.href);u.searchParams.delete("open");history.replaceState(null,"",u);if(key==="profile")profileTarget=null;show(["admin","adminTools"].includes(key)&&!state.player.is_admin?"Γεγονότα":routes[key]);}else show(tab);}
 else if(!["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)){
 const gChanged=oldGame!==JSON.stringify(state.game),bChanged=oldBank!==JSON.stringify(state.bank),sChanged=oldShop!==JSON.stringify(state.shop),dChanged=oldDeparture!==JSON.stringify(state.departure);
 if(tab==="Διαχείριση"||((tab==="Καζίνο"||tab==="Γεγονότα")&&oldCasino!==JSON.stringify(state.casino))||((tab==="Γεγονότα"||tab==="Σημερινά αποτελέσματα")&&(gChanged||oldAnnouncement!==JSON.stringify(state.announcement)))||(tab==="Δελτίο"&&gChanged)||(tab==="Κατάταξη"&&(gChanged||sChanged||oldPlayers!==JSON.stringify(state.players)))||(tab==="Τράπεζα"&&bChanged)||((tab==="Προφίλ"||tab==="Μέλη")&&(gChanged||sChanged||oldPlayers!==JSON.stringify(state.players)))||((tab==="Τρόπαια"||tab==="Κατάστημα")&&sChanged)||(tab==="Παραιτήσεις"&&dChanged))show(tab);
 }
 }catch(e){if(started!==revision||sessionToken!==token)return;if([401,403].includes(e.status)){setToken("");state=null;picks.clear();profileTarget=null;giftTarget=null;authForm(e.message);}else if(!state){if(token)sessionLoading("Δεν υπάρχει σύνδεση με τον server. Δοκίμασε ξανά.");else authForm("Δεν υπάρχει σύνδεση με τον server. Δοκίμασε ξανά.");}else feedback(e.message);}finally{refreshing=false;}
}
function sessionLoading(message="Έλεγχος σύνδεσης…"){toggleGame(false);auth.replaceChildren();const c=el("section",undefined,"card session-loading");c.append(el("p",message,"muted"));if(message!=="Έλεγχος σύνδεσης…")c.append(button("Επανάληψη",()=>refresh(true),"primary"),button("Έξοδος",logout));auth.append(c);}
function refreshBoundary(){const now=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),get=t=>now.find(x=>x.type===t)?.value,hm=get("hour")+":"+get("minute"),d=get("year")+"-"+get("month")+"-"+get("day");const phase=hm<"09:00"?"night":hm<"10:00"?"morning":hm<"12:00"?"preview":hm<"17:30"?"results":"evening";return d+":"+phase;}
function backgroundTick(){clock();updateInboxBadges();if(chatView?.alive())chatView.updateInbox?.();const boundary=refreshBoundary(),changed=lastBoundary!==""&&lastBoundary!==boundary;lastBoundary=boundary;if(!pollingActive()||busy||resetOpen||!token)return;if(chatView?.alive())chatView.load();if(changed||(Date.now()-lastStateRequest>=STATE_REFRESH_MS&&stateAutoBudget(true)))refresh();}
function activity(){const wasIdle=Date.now()-lastInteraction>=IDLE_AFTER_MS;lastInteraction=Date.now();if(wasIdle&&token&&!busy&&!resetOpen&&document.visibilityState==="visible"){if(Date.now()-lastStateRequest>=60000&&stateAutoBudget(true))refresh();if(chatView?.alive())chatView.load();}}
for(const evt of ["pointerdown","keydown","touchstart"])document.addEventListener(evt,activity,{passive:true});
window.addEventListener("storage",e=>{if(e.key===KEY||e.key===null)location.reload()});if(token){sessionLoading();refresh(true);}else authForm();lastBoundary=refreshBoundary();setInterval(backgroundTick,1000*15);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){lastInteraction=Date.now();if(token&&!busy&&!resetOpen&&Date.now()-lastStateRequest>=60000&&stateAutoBudget(true))refresh();if(chatView?.alive())chatView.load();}});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(()=>{});
