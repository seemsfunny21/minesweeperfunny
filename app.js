"use strict";
const R=PredictionRules,$=id=>document.getElementById(id),screen=$("screen"),auth=$("authScreen");
const API="https://zrbmsziipzabnniqcpav.supabase.co/functions/v1/predictions-account",KEY="predictions-session-v1";
let token=localStorage.getItem(KEY)||"",state=null,tab="Γεγονότα",busy=false,date="",available=0,authMode="login",resetOpen=false,refreshing=false,revision=0,profileTarget=null,rankingPeriod="net";
const el=(tag,t,c)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=t;if(c)n.className=c;return n;};
const button=(t,fn,c)=>{const n=el("button",t,c);n.type="button";n.onclick=fn;return n;};
const fmt=n=>Number(n).toLocaleString("el-GR");
const pinField=(id,placeholder)=>{const n=el("input");n.id=id;n.type="password";n.inputMode="numeric";n.autocomplete="off";n.maxLength=8;n.placeholder=placeholder;return n;};
const validPin=x=>/^\d{4,8}$/.test(x);
function setToken(t){revision++;token=t||"";if(token)localStorage.setItem(KEY,token);else localStorage.removeItem(KEY);}
async function api(action,extra={}){const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",...(token?{"x-predictions-session":token}:{})},body:JSON.stringify({action,...extra}),cache:"no-store",signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok){const e=new Error(data.error||"Αποτυχία σύνδεσης.");e.status=response.status;throw e;}return data;}
function toggleGame(yes){$("gameScreen").hidden=!yes;$("tabs").hidden=!yes;$("profileButton").hidden=!yes;auth.hidden=yes;if(!yes){screen.replaceChildren();$("profileButton").replaceChildren();}}
function feedback(t){const f=$("feedback");if(f)f.textContent=t;}
let authPinTimer=null;
function cancelAuthPin(){if(authPinTimer!==null){clearTimeout(authPinTimer);authPinTimer=null;}}
function loginAvatar(p){if(typeof p.avatar==="string"&&/^data:image\/jpeg;base64,/.test(p.avatar)){const img=el("img",undefined,"login-avatar");img.src=p.avatar;img.alt="";return img;}return el("span",String(p.nickname||"?").slice(0,1).toUpperCase(),"login-avatar login-initial");}
function authForm(error=""){
 cancelAuthPin();toggleGame(false);auth.replaceChildren();
 const c=el("section",undefined,"card auth-card"),f=el("p",error,"feedback");f.id="feedback";
 auth.append(c);
 if(authMode==="register"){
  const name=el("input");name.id="nickname";name.maxLength=40;name.autocomplete="username";name.placeholder="Το όνομά σου";
  const pin=pinField("pin","PIN 4–8 ψηφίων"),form=el("form"),submit=el("button","Αίτημα εγγραφής","primary");
  submit.type="submit";form.append(el("label","Όνομα"),name,el("label","PIN"),pin,submit,f);
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;if(name.value.trim().length<2||!validPin(pin.value)){f.textContent="Συμπλήρωσε όνομα και PIN 4–8 ψηφίων.";return;}busy=true;submit.disabled=true;try{const data=await api("register",{nickname:name.value.trim(),pin:pin.value});pin.value="";authMode="login";setToken(data.token);await refresh(true);}catch(err){f.textContent=err.message;}finally{busy=false;submit.disabled=false;}};
  c.append(el("h2","Νέα εγγραφή"),form,button("Επιστροφή στη σύνδεση",()=>{if(!busy){authMode="login";authForm();}},"secondary"),el("small","Η εγγραφή ενεργοποιείται μετά από έγκριση Admin.","safe-note"));return;
 }
 c.append(button("＋ Νέα εγγραφή",()=>{if(!busy){authMode="register";authForm();}},"primary"),el("h2","Επίλεξε προφίλ"));
 const grid=el("div",undefined,"login-profiles"),loading=el("p","Φόρτωση προφίλ…","muted"),panel=el("div",undefined,"login-pin-panel");grid.append(loading);
 c.append(grid,panel,f);
 let selected=null,manual=false;
 function renderPin(p){
  cancelAuthPin();selected=p;manual=!p;panel.replaceChildren();f.textContent="";
  for(const b of grid.children)b.setAttribute("aria-pressed",String(!!p&&b.dataset?.profile===p.nickname));
  const form=el("form"),pin=pinField("loginPin","PIN"),submit=el("button","Σύνδεση","secondary");
  submit.type="submit";pin.setAttribute("aria-label","PIN");pin.autocomplete="current-password";
  let name=null;if(manual){name=el("input");name.placeholder="Το όνομά σου";name.maxLength=40;name.autocomplete="username";name.setAttribute("aria-label","Όνομα");form.append(name);}else form.append(el("h3",p.nickname));
  form.append(pin,submit);panel.append(form);
  async function login(){
   cancelAuthPin();if(busy||!form.isConnected||!validPin(pin.value))return;
   const nickname=manual?name.value.trim():p.nickname;if(nickname.length<2){f.textContent="Συμπλήρωσε το όνομά σου.";return;}
   busy=true;pin.disabled=true;submit.disabled=true;if(name)name.disabled=true;f.textContent="Σύνδεση…";
   try{const data=await api("login",{nickname,pin:pin.value});pin.value="";setToken(data.token);await refresh(true);}
   catch(err){pin.value="";f.textContent=err.message;}
   finally{busy=false;pin.disabled=false;submit.disabled=false;if(name)name.disabled=false;if(form.isConnected&&!token)pin.focus();}
  }
  form.onsubmit=e=>{e.preventDefault();if(!validPin(pin.value)){f.textContent="PIN 4–8 ψηφίων.";return;}login();};
  pin.oninput=()=>{cancelAuthPin();pin.value=pin.value.replace(/[^0-9]/g,"").slice(0,8);f.textContent="";if(validPin(pin.value)&&(!manual||name.value.trim().length>=2)){if(pin.value.length===8)login();else authPinTimer=setTimeout(login,1500);}};
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
async function logout(){if(busy)return;busy=true;revision++;try{try{if(token)await disablePush();}catch{}try{if(token)await api("logout");}catch{}setToken("");state=null;picks.clear();profileTarget=null;giftTarget=null;shopTab="trophy";tab="Γεγονότα";authForm();}finally{busy=false;}}
function pending(){toggleGame(false);auth.replaceChildren();const c=el("section",undefined,"card auth-card");c.append(el("div","⏳","pending-icon"),el("h2","Αναμονή έγκρισης"),el("p","Γεια σου, "+state.player.nickname+". Ο Admin πρέπει να εγκρίνει την εγγραφή σου."),button("Έλεγχος έγκρισης",()=>refresh(true),"primary"),button("Έξοδος",logout),el("p","","feedback"));c.lastChild.id="feedback";auth.append(c);notifications(c);}
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
async function transact(action,data,next,success){if(busy)return;busy=true;revision++;try{state=await api(action,data);if(action==="place")picks.clear();prune();clock();show(next);if(success)notice(success);}catch(e){notice(e.message);}finally{busy=false;}}
function choose(e,side){if(busy||!marketOption(e,side))return;if(picks.get(e.id)===side)picks.delete(e.id);else{if(!picks.has(e.id)&&picks.size>=5){notice("Μέχρι 5 επιλογές ανά δελτίο.");return;}picks.set(e.id,side);}show("Γεγονότα");}
function optionGrid(e,vote=false){const opts=marketOptions(e),a=el("div",undefined,"odds");if(opts.length>2){a.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";a.style.gap="6px";}for(const o of opts){const b=button("",()=>vote?transact("vote",{event_id:e.id,side:o.key},"Γεγονότα","Η ψήφος καταχωρίστηκε."):choose(e,o.key),"pick "+(o.key==="no"?"no":"yes")+(!vote&&picks.get(e.id)===o.key?" selected":""));b.style.minWidth="0";b.style.padding="9px 4px";if(opts.length>2)b.style.fontSize="12px";if(!vote)b.setAttribute("aria-pressed",String(picks.get(e.id)===o.key));b.append(el("span",o.label));if(!vote)b.append(el("b",odds(o.odds)));a.append(b);}return a;}
function events(){const g=game();prune();const open=state.economy_enabled&&g.sync_ok&&g.phase==="open",ev=g.events||[],current=ev.filter(e=>e.open_date===day()),prior=ev.filter(e=>e.date===day()&&e.open_date!==day());
 section("Γεγονότα",g.market_v2?(g.season==="summer"?"Θερινή":"Χειμερινή"):undefined);
 if(!state.economy_enabled){notice("Η οικονομία δεν έχει ενεργοποιηθεί.");return;}
 if(!g.sync_ok)notice("Ο συγχρονισμός εκκρεμεί. Οι ενέργειες είναι προσωρινά κλειστές.");
 if(open&&current.length){section("Επόμενη εργάσιμη",dateFmt(current[0].date));for(const e of current){const c=card();c.append(el("h3",e.kind==="attendance"?"👤 "+e.name:e.name));if(e.kind==="statements")c.append(el("small","Ώρα τελευταίας κατάστασης · μέχρι την αναγραφόμενη ώρα"));if(e.kind==="customers")c.append(el("small","Αριθμός πελατών στο διάλειμμα"));if(e.already_bet||e.settled){c.append(el("small",e.settled?"Ακυρώθηκε":"Καταχωρισμένο δελτίο"));continue;}if(e.can_bet??open)c.append(optionGrid(e));}if(!g.market_v2&&current.length<7&&g.workers?.length){const c=card(),sel=el("select");for(const w of g.workers){const o=el("option",w.name);o.value=w.id;sel.append(o);}c.append(el("h3","Πρόσθεσε εργαζόμενο"),sel,button("Προσθήκη",()=>transact("add_event",{worker_id:sel.value},"Γεγονότα"),"primary"));}if(picks.size)screen.append(button("Προβολή δελτίου · "+picks.size,()=>show("Δελτίο"),"primary"));}
 else notice(g.phase==="closed"?"Δεν υπάρχουν στοιχήματα σήμερα.":g.market_v2?"Τα νέα στοιχήματα ανοίγουν στις 22:00.":"Τα νέα στοιχήματα ανοίγουν στις 12:00.");
 if(prior.length){section("Αποτελέσματα σήμερα");for(const e of prior){const c=card();c.append(el("h3",e.kind==="attendance"?"👤 "+e.name:e.name));if(e.settled)c.append(el("p",e.result===null?"Ακυρώθηκε":(marketOption(e,e.result)?.label||e.result),"muted"));else if(g.sync_ok&&!e.voted&&(e.can_vote??g.phase==="vote"))c.append(optionGrid(e,true));else c.append(el("small",e.voted?"Η ψήφος καταχωρίστηκε.":e.kind&&e.kind!=="attendance"?"Επιβεβαίωση 18:00–22:00":"Επιβεβαίωση 10:00–12:00"));}}
}
function marketReturn(amount,chosen){let num=BigInt(amount),den=1n;for(const e of chosen){const o=marketOption(e,picks.get(e.id));if(!o)return 0;num*=BigInt(Math.round(Number(o.odds)*100));den*=100n;}return Math.min(10000,Number(num/den));}
function ticket(){const g=game();prune();section("Το δελτίο μου",picks.size+" επιλογές");const chosen=eligibleEvents().filter(e=>picks.has(e.id));if(chosen.length){const c=card();let mult=1;for(const e of chosen){const o=marketOption(e,picks.get(e.id));mult*=Number(o.odds);const r=el("div",undefined,"ticket-line"),info=el("div");info.append(el("h3",e.name),el("small",o.label+" · "+odds(o.odds)));r.append(info,button("×",()=>{picks.delete(e.id);show("Δελτίο");}));c.append(r);}const input=el("input");input.type="number";input.inputMode="numeric";input.min=10;input.max=Math.min(1000,available);input.value=stake;const detail=el("p","","amount");const submit=button("Οριστικό ποντάρισμα",()=>{const n=Number(input.value);if(!Number.isSafeInteger(n)||n<10||n>Math.min(1000,available))return;transact("place",{ids:chosen.map(e=>e.id),sides:chosen.map(e=>picks.get(e.id)),stake:n},"Δελτίο","Το δελτίο καταχωρίστηκε οριστικά.");},"primary");function calc(){stake=Number(input.value);const valid=Number.isSafeInteger(stake)&&stake>=10&&stake<=Math.min(1000,available);detail.textContent=valid?fmt(marketReturn(stake,chosen))+" 🪙":"—";submit.disabled=!valid||!g.sync_ok||g.phase!=="open";}input.oninput=calc;c.append(el("small","Συνολική απόδοση "+odds(mult)),el("label","Ποντάρισμα"),input,el("small","Πιθανή συνολική επιστροφή · μέγ. 10.000"),detail,submit);calc();}else notice("Επίλεξε γεγονότα από την αρχική.");
 section("Ιστορικό δελτίων");for(const t of g.tickets||[]){const c=card(),profit=Number(t.paid)-Number(t.stake);c.append(el("h3",fmt(t.stake)+" 🪙 · "+(t.settled_at?(profit>0?"Κερδισμένο":profit<0?"Χαμένο":"Επιστροφή"):"Εκκρεμεί")),el("small",dateFmt(t.created_at?.slice(0,10))));for(const p of t.picks||[])c.append(el("p",p.name+" · "+(p.label||(p.side==="yes"?"ΝΑΙ":p.side==="no"?"ΟΧΙ":p.side))+" · "+odds(p.odds),"muted"));if(t.settled_at)c.append(el("strong",(profit>0?"+":"")+fmt(profit)+" καθαρό αποτέλεσμα",profit>0?"profit":profit<0?"loss":"muted"));}if(!g.tickets?.length)notice("Δεν υπάρχουν ακόμη καταχωρισμένα δελτία.");
}
function bank(){
 const b=state.bank,me=state.player.id;
 section("Τράπεζα");if(!b){notice("Τα τραπεζικά δεδομένα δεν είναι διαθέσιμα. Κάνε ανανέωση.");return;}
 rows([["Υπόλοιπο",fmt(state.player.chips)+" 🪙"],["Ελεύθερες για συναλλαγές",fmt(b.available)+" 🪙"],["Προστατευμένες",fmt(Number(state.player.chips)-Number(b.available))+" 🪙"],["Έχεις δανειστεί αυτή την εβδομάδα",fmt(b.borrowed)+" / 300"],["Έχεις δανείσει αυτή την εβδομάδα",fmt(b.lent)+" / 300"],["Επόμενη πίστωση",dateFmt(b.due_date)+" · 1.000 🪙"]]);
 const mine=(b.requests||[]).find(r=>r.borrower===me);
 section("Ζήτησε δάνειο");if(mine){const c=card();c.append(el("h3",fmt(mine.principal)+" 🪙 · Αναμονή αποδοχής"),button("Ακύρωση αιτήματος",()=>transact("bank",{operation:"cancel",id:mine.id},"Τράπεζα","Το αίτημα ακυρώθηκε.")));}else if(b.borrow_available&&300-Number(b.borrowed)>=50){const c=card(),input=el("input");input.type="number";input.min=50;input.max=300-Number(b.borrowed);input.value=Math.min(100,Number(input.max));input.inputMode="numeric";c.append(el("p","Ποσό 50–"+input.max+" μαρκών","muted"),input,button("Δημιουργία αιτήματος",()=>{const n=Number(input.value);if(!Number.isSafeInteger(n)||n<50||n>Number(input.max)){notice("Μη έγκυρο ποσό.");return;}transact("bank",{operation:"request",amount:n},"Τράπεζα","Το αίτημα δημοσιεύθηκε.");},"primary"));}else notice("Μπορείς να ζητήσεις δάνειο όταν οι διαθέσιμες μάρκες για ποντάρισμα είναι έως 100 και δεν έχεις εξαντλήσει το εβδομαδιαίο όριο.");
 section("Αιτήματα παικτών");const other=(b.requests||[]).filter(r=>r.borrower!==me);if(!other.length)notice("Δεν υπάρχουν ανοιχτά αιτήματα.");for(const r of other){const c=card();c.append(el("h3",r.name),el("p",fmt(r.principal)+" 🪙","amount"));const btn=button("Δάνεισε "+fmt(r.principal)+" μάρκες",()=>{if(!confirm("Να δανείσεις "+r.principal+" μάρκες στον παίκτη "+r.name+";"))return;transact("bank",{operation:"accept",id:r.id},"Τράπεζα","Το δάνειο ολοκληρώθηκε.");},"primary");btn.disabled=Number(b.lend_available??b.available)<r.principal||Number(b.lent)+r.principal>300;c.append(btn);}
 section("Τα δάνειά μου");const loans=b.loans||[];if(!loans.length)notice("Δεν υπάρχουν δάνεια.");for(const l of loans){const c=card(),borrow=l.borrower===me;const outstanding=Number(l.outstanding),interest=Math.ceil(outstanding/10);c.append(el("h3",(borrow?"Οφείλεις στον/στην ":"Δάνεισες στον/στην ")+(borrow?l.lender_name:l.borrower_name)),el("p",l.status==="paid"?"Εξοφλήθηκε · Τόκος "+fmt(l.interest_paid):"Υπόλοιπο "+fmt(outstanding)+" 🪙","muted"));if(l.status==="active"){c.append(el("p","Λήξη "+dateFmt(l.due_date)+" · "+fmt(outstanding+interest)+" μάρκες αν δεν εξοφληθεί","muted"));if(borrow){const max=Math.min(outstanding,Number(b.available));if(max>=1){const input=el("input");input.type="number";input.inputMode="numeric";input.min=1;input.max=max;input.value=max;c.append(input,button("Εξόφληση χωρίς τόκο",()=>{const n=Number(input.value);if(!Number.isSafeInteger(n)||n<1||n>max){notice("Μη έγκυρο ποσό.");return;}if(confirm("Εξόφληση "+n+" μαρκών;"))transact("bank",{operation:"repay",id:l.id,amount:n},"Τράπεζα","Η εξόφληση καταχωρίστηκε.");},"primary"));}else c.append(el("small","Οι προστατευμένες μάρκες δεν χρησιμοποιούνται."));}}}
 notice("Πριν τη Δευτέρα δεν υπάρχει τόκος. Στη λήξη αφαιρείται από την εβδομαδιαία πίστωση το ανεξόφλητο κεφάλαιο και τόκος 10% (στρογγυλοποίηση προς τα πάνω ανά δάνειο). Μόνο ο τόκος μετρά στην κατάταξη.");
}
function avatar(p){let node;if(p.avatar&&/^data:image\/jpeg;base64,/.test(p.avatar)){node=el("img",undefined,"avatar-img");node.src=p.avatar;node.alt="";}else node=el("div",p.nickname.slice(0,1).toUpperCase(),"initial");const frame=cosmetics(p.id).frame;if(["frame_blue","frame_silver","frame_gold","frame_glow","frame_diamond","frame_legend"].includes(frame))node.classList.add(frame);return node;}
function stat(id){return (game().stats||[]).find(x=>x.id===id)||{net:0,wins:0,losses:0,returned:0,staked:0};}
function ranking(){section("Καθαρό αποτέλεσμα");const filters=el("div",undefined,"actions");for(const [key,name] of [["net","Σύνολο"],["weekly_net","Εβδομάδα"],["monthly_net","Μήνας"]]){const b=button(name,()=>{rankingPeriod=key;show("Κατάταξη");},rankingPeriod===key?"primary":"");filters.append(b);}screen.append(filters);const players=[...(state.players||[])].sort((a,b)=>Number(stat(b.id)[rankingPeriod]||0)-Number(stat(a.id)[rankingPeriod]||0));for(const p of players){const c=card(),r=el("div",undefined,"person"),info=el("div"),v=stat(p.id),net=Number(v[rankingPeriod]||0);info.append(button(p.nickname+(item(cosmetics(p.id).trophy)?" "+item(cosmetics(p.id).trophy).icon:""),()=>{profileTarget=p.id;show("Προφίλ");},"profile-link"),el("small","Επ. "+levelOf(cosmetics(p.id))+" · "+v.wins+" νίκες · "+v.losses+" ήττες"));r.append(avatar(p),info,el("strong",(net>0?"+":"")+fmt(net),net>0?"profit":net<0?"loss":"muted"));c.append(r);}notice("Οι αρχικές και εβδομαδιαίες πιστώσεις δεν υπολογίζονται ως κέρδη.");}
function profile(p=state.player){screen.replaceChildren();section("Προφίλ");const c=card();c.classList.add("profile");const cp=cosmetics(p.id);c.append(avatar(p),el("h3",p.nickname+(item(cp.trophy)?" "+item(cp.trophy).icon:"")),el("small","Επίπεδο "+levelOf(cp)+" · "+titleOf(cp)));const xp=Number(cp.days||0)*10,progress=el("div",undefined,"xp-bar"),fill=el("div");fill.style.width=(xp%100)+"%";progress.append(fill);c.append(progress,el("small",xp+" XP · "+(100-xp%100)+" XP για επόμενο επίπεδο"));const stats=el("div",undefined,"stats");for(const [v,l] of [[fmt(p.chips),"Μάρκες"],[(stat(p.id).net>0?"+":"")+fmt(stat(p.id).net),"Καθαρά κέρδη"],[String((cp.collection||[]).filter(code=>item(code)?.category==="trophy").length),"Τρόπαια"]]){const s=el("div");s.append(el("b",v),el("small",l));stats.append(s);}c.append(stats);const ps=stat(p.id);c.append(el("p",ps.wins+" νίκες · "+ps.losses+" ήττες","muted"),el("p","Καθαροί τόκοι: "+(Number(ps.interest_net)>0?"+":"")+fmt(ps.interest_net||0)+" 🪙","muted"),el("p","Μπόνους παραιτήσεων: "+fmt(ps.resignation_bonus||0)+" 🪙","muted"));if(p.id===state.player.id){const input=el("input");input.type="file";input.accept="image/*";input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file||file.size>15*1024*1024)throw Error("Επίλεξε εικόνα έως 15 MB.");const image=await createImageBitmap(file);const canvas=document.createElement("canvas");canvas.width=canvas.height=256;const s=Math.min(image.width,image.height);canvas.getContext("2d").drawImage(image,(image.width-s)/2,(image.height-s)/2,s,s,0,0,256,256);image.close();let data=canvas.toDataURL("image/jpeg",0.82);if(data.length>100000)data=canvas.toDataURL("image/jpeg",0.60);await api("avatar",{avatar:data});await refresh(true);show("Προφίλ");}catch(e){notice(e.message);}};c.append(input,button("Αλλαγή φωτογραφίας",()=>input.click(),"primary"),button("Αφαίρεση φωτογραφίας",async()=>{try{await api("avatar",{avatar:null});await refresh(true);show("Προφίλ");}catch(e){notice(e.message);}}));}const collection=el("div",undefined,"profile-collection");for(const code of cp.collection||[]){const i=item(code);if(i){const e=el("span",i.icon,"collection-icon");e.title=i.name;collection.append(e);}}if(collection.children.length)c.append(el("h3","Συλλογή"),collection);
 const earned=el("div",undefined,"profile-collection");for(const a of cp.achievements||[]){const x=achievementNames[a.code];if(x){const e=el("span",x[0],"collection-icon");e.title=x[1];earned.append(e);}}if(earned.children.length)c.append(el("h3","Επιτεύγματα"),earned);
 if(p.id===state.player.id){c.append(button("Συλλογή και κατάστημα",()=>{shopTab="trophy";show("Τρόπαια");}));privateGifts(c);}else c.append(button("🎁 Στείλε ιδιωτικό δώρο",()=>showGiftShop(p),"primary"));
 if(state.player.is_admin&&p.id!==state.player.id)c.append(button("Νέο PIN",()=>resetPin(p)));}

const achievementNames={first_win:["🎯","Πρώτη νίκη"],five_wins:["🔥","5 συνεχόμενες νίκες"],five_pick:["🚀","Κερδισμένο πενταπλό"],departure_win:["🔮","Σωστή μακροχρόνια πρόβλεψη"],ten_loans:["🤝","10 εξοφλημένα δάνεια ως δανειστής"],net_10000:["💰","10.000 καθαρά κέρδη"],five_days:["📅","Συμμετοχή 5 ημερών"],monthly_champion:["🏅","Πρωταθλητής μήνα"]};
const shop=()=>state.shop||{};
const cosmetics=id=>(shop().profiles||[]).find(x=>x.id===id)||{collection:[],achievements:[],days:0};
const item=code=>(shop().catalog||[]).find(x=>x.code===code);
const levelOf=p=>1+Math.floor(Number(p.days||0)/10);
function titleOf(p){const l=levelOf(p);return l>=20?"Θρύλος":l>=10?"Βετεράνος":l>=5?"Έμπειρος":l>=2?"Τακτικός":"Νέος παίκτης";}
let shopTab="trophy",giftTarget=null;
function privateGifts(parent){if(!shop().gifts)return;const wrap=el("section",undefined,"private-gifts");wrap.append(el("h3","🔒 Τα δώρα μου"),el("small","Μόνο εσύ βλέπεις αυτά τα δώρα και τους αποστολείς."));const gifts=shop().gifts||[];if(!gifts.length)wrap.append(el("p","Δεν έχεις λάβει ακόμη δώρα.","muted"));for(const g of gifts){const row=el("div",undefined,"gift-row"),icon=el("span",g.icon,"gift-icon"),info=el("div");info.append(el("strong",g.name),el("small","Από: "+g.sender_name),el("small",dateFmt(g.created_at?.slice(0,10))));row.append(icon,info);wrap.append(row);}parent.append(wrap);}
function purchaseDialog(i,recipient=null){
 if(resetOpen||busy)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card shop-dialog");m.append(c);document.body.append(m);
 const req=crypto.randomUUID(),err=el("p","","feedback");let inFlight=false;
 function close(){if(inFlight)return;resetOpen=false;m.remove();}
 c.append(el("div",i.icon,"shop-emblem"),el("h2",recipient?"Στείλε δώρο":"Αγορά συλλεκτικού"),el("p",i.name+(recipient?" → "+recipient.nickname:"")),el("p",fmt(i.price)+" 🪙","amount"));
 if(recipient)c.append(el("small","Το δώρο και το όνομά σου θα εμφανιστούν μόνο στο ιδιωτικό προφίλ του παραλήπτη."));
 const send=button(recipient?"Αποστολή δώρου":"Αγορά",async()=>{if(inFlight)return;inFlight=true;busy=true;send.disabled=true;try{state=await api("shop",{operation:recipient?"gift":"buy",code:i.code,recipient:recipient?.id||null,request_id:req});inFlight=false;close();clock();show("Τρόπαια");notice(recipient?"🎁 Το δώρο στάλθηκε ιδιωτικά.":"Το συλλεκτικό προστέθηκε στη συλλογή σου.");}catch(e){err.textContent=e.message;inFlight=false;send.disabled=false;}finally{busy=false;}},"primary");c.append(err,send,button("Ακύρωση",close));
}
function showGiftShop(p){giftTarget=p.id;shopTab="gift";show("Τρόπαια");}
function trophies(){
 const sh=shop();section("Συλλεκτικά");if(!sh.catalog){notice("Το κατάστημα δεν είναι διαθέσιμο. Κάνε ανανέωση.");return;}
 const hero=card();hero.append(el("small","ΔΙΑΘΕΣΙΜΕΣ ΓΙΑ ΑΓΟΡΕΣ"),el("p",fmt(sh.available)+" 🪙","amount"),el("small","Δεν χρησιμοποιούνται προστατευμένες ή δανεικές μάρκες."));
 const tabs=el("div",undefined,"shop-tabs");for(const [key,label] of [["trophy","🏆 Τρόπαια"],["frame","✨ Πλαίσια"],["gift","🎁 Δώρα"],["achievements","🏅 Επιτεύγματα"]]){const b=button(label,()=>{shopTab=key;show("Τρόπαια");});b.classList.toggle("active",shopTab===key);tabs.append(b);}screen.append(tabs);
 if(shopTab==="achievements"){const cp=cosmetics(state.player.id);section("Τα επιτεύγματά μου",(cp.achievements||[]).length+"/"+Object.keys(achievementNames).length);for(const [code,[icon,name]] of Object.entries(achievementNames)){const has=(cp.achievements||[]).some(x=>x.code===code);const c=card(),r=el("div",undefined,"achievement-row");r.append(el("span",icon,"gift-icon"),el("span",name),el("small",has?"✓":"🔒"));c.append(r);if(!has)c.classList.add("locked-achievement");}return;}
 let recipient=null;
 if(shopTab==="gift"){const people=(state.players||[]).filter(x=>x.id!==state.player.id);const c=card();c.append(el("h3","Σε ποιον στέλνεις δώρο;"));if(!people.length){c.append(el("p","Δεν υπάρχει άλλος εγκεκριμένος παίκτης.","muted"));return;}const sel=el("select");for(const p of people){const o=el("option",p.nickname);o.value=p.id;sel.append(o);}if(people.some(p=>p.id===giftTarget))sel.value=giftTarget;giftTarget=sel.value;recipient=people.find(p=>p.id===giftTarget);sel.onchange=()=>{giftTarget=sel.value;show("Τρόπαια");};c.append(sel,el("small","Ο παραλήπτης βλέπει το δώρο και από ποιον είναι. Δεν εμφανίζεται σε άλλους."));}
 const grid=el("div",undefined,"shop-grid"),cp=cosmetics(state.player.id);for(const i of sh.catalog.filter(x=>x.category===shopTab)){const c=el("article",undefined,"card shop-item"),owned=(sh.owned||[]).includes(i.code),equipped=shopTab==="frame"?cp.frame===i.code:cp.trophy===i.code;c.append(el("div",i.icon,"shop-emblem"),el("h3",i.name),el("p",owned?"Στη συλλογή σου":fmt(i.price)+" 🪙","muted"));if(owned){const op=shopTab==="frame"?"equip_frame":"equip_trophy";c.append(button(equipped?"Αφαίρεση":"Εμφάνιση",()=>transact("shop",{operation:op,code:equipped?null:i.code},"Τρόπαια"),equipped?"":"primary"));}else{const b=button(shopTab==="gift"?"Αποστολή":"Αγορά",()=>purchaseDialog(i,recipient),"primary");b.disabled=Number(sh.available)<i.price||shopTab==="gift"&&!recipient;c.append(b);}grid.append(c);}screen.append(grid);
 if(shopTab==="gift")notice("Τα δώρα είναι ψηφιακά, μη μεταβιβάσιμα και δεν ανταλλάσσονται με μάρκες ή χρήματα.");
}

function more(){section("Περισσότερα");const grid=el("div",undefined,"menu");const list=[["👤","Προφίλ"],["🏆","Τρόπαια"],["📅","Παραιτήσεις"],["🔔","Ειδοποιήσεις"]];if(state.player.is_admin)list.push(["🔐","Διαχείριση"]);for(const [icon,name] of list){const b=button("",()=>{if(name==="Προφίλ")profileTarget=null;show(name);});b.append(el("i",icon),el("span",name));grid.append(b);}screen.append(grid,button("Έξοδος",logout));}
async function manage(p,operation){if(busy)return;busy=true;revision++;try{state=await api("manage",{target:p.id,operation});show("Διαχείριση");}catch(e){notice(e.message);}finally{busy=false;}}
function resetPin(p){if(resetOpen)return;resetOpen=true;const m=el("div",undefined,"modal"),c=el("div",undefined,"card");m.append(c);document.body.append(m);let newPin="";function close(){newPin="";resetOpen=false;m.remove();}function cancel(){close();show("Γεγονότα");}c.append(el("h2","Νέο PIN · "+p.nickname),el("p","Δώσε το κινητό στον παίκτη."));const a=pinField("newPin","Νέο PIN"),b=pinField("repeatPin","Επανάληψη PIN"),error=el("p","","feedback");c.append(a,b,error,button("Συνέχεια",()=>{if(!validPin(a.value)||a.value!==b.value){error.textContent="Τα PIN πρέπει να ταιριάζουν (4–8 ψηφία).";return;}newPin=a.value;a.value=b.value="";c.replaceChildren(el("h2","Έγκριση Admin"),el("p","Επίστρεψε το κινητό στον διαχειριστή."));const admin=pinField("adminPin","PIN Admin"),err=el("p","","feedback"),confirm=button("Επιβεβαίωση",async()=>{if(!validPin(admin.value)){err.textContent="Πληκτρολόγησε το PIN Admin.";return;}confirm.disabled=true;try{state=await api("manage",{target:p.id,operation:"reset_pin",new_pin:newPin,admin_pin:admin.value});admin.value="";close();show("Γεγονότα");notice("Το PIN άλλαξε επιτυχώς.");}catch(e){err.textContent=e.message;admin.value="";}finally{confirm.disabled=false;}},"primary");c.append(admin,err,confirm,button("Ακύρωση",cancel));},"primary"),button("Ακύρωση",cancel));}
function admin(){if(!state.player.is_admin)return show("Γεγονότα");const accounts=state.accounts||[];section("Διαχείριση",accounts.filter(x=>x.status==="pending").length+" αιτήματα");const season=card();season.append(el("h3","Εποχή εργασίας"),el("small","Επηρεάζει τις αποδόσεις των επόμενων γύρων, όχι τα ήδη ανοιχτά δελτία."));const grid=el("div",undefined,"odds");for(const [key,label] of [["winter","Χειμερινή"],["summer","Θερινή"]]){const b=button(label,()=>transact("season",{season:key},"Διαχείριση","Η εποχή ενημερώθηκε."),game().season===key?"primary":"");grid.append(b);}season.append(grid);for(const p of accounts){const c=card();c.append(el("h3",p.nickname),el("small",({pending:"Αναμονή",approved:"Εγκεκριμένος",rejected:"Απορρίφθηκε",suspended:"Σε αναστολή"})[p.status]));if(p.is_admin)continue;const a=el("div",undefined,"actions");if(["pending","suspended"].includes(p.status))a.append(button("Αποδοχή",()=>manage(p,"approve")));if(p.status==="pending")a.append(button("Απόρριψη",()=>manage(p,"reject")));if(p.status==="approved")a.append(button("Αναστολή",()=>manage(p,"suspend")));a.append(button("Νέο PIN",()=>resetPin(p)));c.append(a);}}

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
 const hero=card();hero.append(el("small","ΜΠΟΝΟΥΣ ΣΩΣΤΗΣ ΠΡΟΒΛΕΨΗΣ"),el("p","+2.000 🪙","amount"),el("p","Επιστροφή πονταρίσματος × 2 επιπλέον του μπόνους.","muted"),el("small","Διαθέσιμες για μακροχρόνιες προβλέψεις: "+fmt(d.available)));
 const choices=(d.subjects||[]).filter(w=>!w.already);
 if(choices.length){const c=card(),worker=el("select"),windowSelect=el("select"),stakeInput=el("input"),preview=el("p","","amount");c.append(el("h3","Νέα πρόβλεψη"));
 for(const w of choices){const o=el("option",w.name);o.value=w.id;worker.append(o);}
 for(const w of d.windows||[]){const b=w.bucket,label=b<=4?b+"η εβδομάδα":(b-3)+"ος μήνας";const o=el("option",label+" · "+dateFmt(w.start)+" – "+dateFmt(w.end));o.value=b;windowSelect.append(o);}
 stakeInput.type="number";stakeInput.inputMode="numeric";stakeInput.min=10;stakeInput.max=Math.min(100,Number(d.available));stakeInput.value=Math.min(50,Math.max(10,Number(stakeInput.max)));
 const submit=button("Οριστική πρόβλεψη",()=>{const n=Number(stakeInput.value);if(!Number.isInteger(n)||n<10||n>Number(stakeInput.max))return;const m=el("div",undefined,"modal"),box=el("div",undefined,"card");m.append(box);document.body.append(m);resetOpen=true;const name=choices.find(x=>x.id===worker.value)?.name||"";const period=windowSelect.selectedOptions[0]?.textContent||"";function close(){m.remove();resetOpen=false;}box.append(el("h2","Επιβεβαίωση πρόβλεψης"),el("p",name+" · "+period),el("p",fmt(n)+" μάρκες"),button("Καταχώριση",()=>{close();transact("departure",{operation:"place",worker_id:worker.value,bucket:Number(windowSelect.value),stake:n},"Παραιτήσεις","Η πρόβλεψη καταχωρίστηκε οριστικά.");},"primary"),button("Ακύρωση",close));},"primary");
 function update(){const n=Number(stakeInput.value),ok=Number.isInteger(n)&&n>=10&&n<=Number(stakeInput.max);preview.textContent=ok?fmt(n*2+2000)+" 🪙":"—";submit.disabled=!ok;}stakeInput.oninput=update;
 c.append(el("small","Εργαζόμενος"),worker,el("small","Περίοδος"),windowSelect,el("small","Ποντάρισμα 10–100"),stakeInput,el("small","Συνολική επιστροφή αν είναι σωστή"),preview,submit);update();
 }else notice("Δεν υπάρχουν διαθέσιμα νέα γεγονότα με συγκατάθεση.");
 section("Οι προβλέψεις μου");
 for(const p of d.picks||[]){const c=card();const label=({pending:"Εκκρεμεί",won:"Κερδισμένη",lost:"Χαμένη",void:"Επιστροφή"})[p.status];c.append(el("h3",p.worker_name),el("small",dateFmt(p.start_day)+" – "+dateFmt(p.end_day)),el("p",fmt(p.stake)+" 🪙 · "+label,p.status==="won"?"profit":p.status==="lost"?"loss":"muted"));if(p.status==="won")c.append(el("strong","+"+fmt(Number(p.paid)+Number(p.bonus)-Number(p.stake))+" καθαρά","profit"));}
 if(!d.picks?.length)notice("Δεν υπάρχουν ακόμη προβλέψεις.");
 notice("Μία ενεργή πρόβλεψη ανά εργαζόμενο. Η περίοδος ξεκινά από αύριο. Αν δεν επιβεβαιωθεί παραίτηση εντός της περιόδου και 7 ημερών περιθωρίου καταχώρισης, η πρόβλεψη χάνεται.");
 if(state.player.is_admin){section("Διαχείριση συγκαταθέσεων");for(const w of d.admin_subjects||[]){const c=card();c.append(el("h3",w.name),el("small",w.departed_on?"Επιβεβαιωμένη αποχώρηση "+dateFmt(w.departed_on):w.enabled?"Συγκατάθεση καταχωρισμένη":"Δεν έχει ενεργοποιηθεί"));if(w.departed_on)continue;const a=el("div",undefined,"actions");if(!w.enabled&&w.active)a.append(button("Ενεργοποίηση",()=>departureAdmin(w,"enable")));if(w.enabled){a.append(button("Ανάκληση",()=>departureAdmin(w,"disable")),button("Επιβεβαίωση παραίτησης",()=>departureAdmin(w,"confirm")));}c.append(a);}}
}

const PUSH_API="https://zrbmsziipzabnniqcpav.supabase.co/functions/v1/predictions-push";
async function pushAPI(action,data={}){const r=await fetch(PUSH_API,{method:"POST",headers:{"Content-Type":"application/json","X-Predictions-Session":token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||"Πρόβλημα ειδοποιήσεων.");return j;}
function pushSupported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
async function pushRegistration(){const reg=await navigator.serviceWorker.getRegistration(location.pathname.replace(/[^/]*$/,""));if(!reg||!reg.active)throw Error("Η εφαρμογή χρειάζεται ανανέωση.");return reg;}
function decodePushKey(s){const base=(s+"=".repeat((4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(base),c=>c.charCodeAt(0));}
async function enablePush(){if(!pushSupported())throw Error("Η συσκευή δεν υποστηρίζει push.");const perm=await Notification.requestPermission();if(perm!=="granted")throw Error("Δεν δόθηκε άδεια ειδοποιήσεων.");const reg=await pushRegistration();const key=await pushAPI("key");let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodePushKey(key.publicKey)});await pushAPI("subscribe",{subscription:sub.toJSON()});}
async function disablePush(){if(!pushSupported())return;const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(sub){let error=null;try{await pushAPI("disable",{endpoint:sub.endpoint});}catch(e){error=e;}const ended=await sub.unsubscribe();if(error&&!ended)throw error;}}
function notifications(parent=screen){
 const c=el("div",undefined,"card");parent.append(c);c.append(el("h3","🔔 Ειδοποιήσεις συσκευής"));
 const status=el("p","Έλεγχος…","muted"),msg=el("p","","feedback"),enable=button("Ενεργοποίηση",()=>act("enable"),"primary"),disable=button("Απενεργοποίηση",()=>act("disable")),test=button("Δοκιμή ειδοποίησης",()=>act("test"));
 c.append(status,enable,disable,test,msg);enable.disabled=disable.disabled=test.disabled=true;
 if(!pushSupported()){status.textContent="Δεν υποστηρίζονται push σε αυτό το περιβάλλον. Στο iPhone πρόσθεσε πρώτα την εφαρμογή στην οθόνη έναρξης.";return;}
 let working=false;
 async function update(){try{const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription(),enabled=!!(sub&&Notification.permission==="granted"&&(await pushAPI("status",{endpoint:sub.endpoint})).enabled);status.textContent=enabled?"✓ Ενεργές σε αυτή τη συσκευή":"Ανενεργές σε αυτή τη συσκευή";enable.disabled=enabled||working;disable.disabled=!sub||working;test.disabled=!enabled||working;}catch(e){status.textContent=e.message;enable.disabled=working;disable.disabled=working;test.disabled=true;}}
 async function act(op){if(working)return;working=true;enable.disabled=disable.disabled=test.disabled=true;msg.textContent="";try{if(op==="enable"){await enablePush();msg.textContent="Οι ειδοποιήσεις ενεργοποιήθηκαν.";}else if(op==="disable"){await disablePush();msg.textContent="Οι ειδοποιήσεις απενεργοποιήθηκαν.";}else{const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(!sub)throw Error("Ενεργοποίησε πρώτα τις ειδοποιήσεις.");await pushAPI("test",{endpoint:sub.endpoint});msg.textContent="Η δοκιμαστική ειδοποίηση στάλθηκε."}}catch(e){msg.textContent=e.message;}finally{working=false;await update();}}
 update();c.append(el("small","Νέα γεγονότα, υπενθύμιση 23:00 χωρίς δελτίο, εγγραφές, Τράπεζα, δώρα και εκκαθάριση."));
}
function extra(k){section(k);if(k==="Ειδοποιήσεις"){notifications();return;}notice("Η λειτουργία δεν έχει ακόμη ενεργοποιηθεί.");}
const pages={"Γεγονότα":events,"Δελτίο":ticket,"Τράπεζα":bank,"Κατάταξη":ranking,"Περισσότερα":more,"Προφίλ":()=>profile((state.players||[]).find(p=>p.id===profileTarget)||state.player),"Τρόπαια":trophies,"Διαχείριση":admin,"Παραιτήσεις":departures};
const nav=[["🎯","Γεγονότα"],["🎫","Δελτίο"],["🏦","Τράπεζα"],["🏅","Κατάταξη"],["☰","Περισσότερα"]];
function show(k){if(!state||state.player.status!=="approved"||resetOpen)return;tab=k;screen.replaceChildren();for(const b of $("tabs").children)b.setAttribute("aria-selected",String(b.dataset.tab===k||b.dataset.tab==="Περισσότερα"&&!nav.some(n=>n[1]===k)));(pages[k]||(()=>extra(k)))();}
for(const [icon,k] of nav){const b=button("",()=>{show(k);window.scrollTo(0,0);});b.dataset.tab=k;b.append(el("i",icon),el("span",k));$("tabs").append(b);}
$("profileButton").onclick=()=>{profileTarget=null;show("Προφίλ");};
function clock(){if(!state||state.player.status!=="approved")return;const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),p=t=>parts.find(x=>x.type===t).value;date=p("year")+"-"+p("month")+"-"+p("day");const time=p("hour")+":"+p("minute"),balance=Number(state.player.chips);available=Math.max(0,balance-Number(game().reserve??R.reserve(date)));$("balance").textContent=fmt(balance);$("clock").textContent=time;$("phase").dataset.phase=game().phase||"closed";$("phase").textContent=({open:"● Ανοιχτά",vote:"Επιβεβαίωση",locked:"🔒 Κλειδωμένα",closed:"Κλειστά"})[game().phase]||"Κλειστά";$("target").textContent=dateFmt(game().target_date||R.nextWorkday(date));$("available").textContent=fmt(available);$("reserve").textContent=fmt(balance-available);$("fundFill").style.width=(balance?available/balance*100:0)+"%";}
async function refresh(draw=false){
 if(!token||resetOpen||refreshing||(!draw&&busy))return;refreshing=true;const started=revision,sessionToken=token;
 try{
 const oldStatus=state?.player?.status,oldGame=JSON.stringify(state?.game),oldBank=JSON.stringify(state?.bank),oldShop=JSON.stringify(state?.shop),oldDeparture=JSON.stringify(state?.departure);
 const next=await api("state");if(started!==revision||sessionToken!==token||resetOpen||(!draw&&busy))return;
 state=next;
 if(state.player.status==="pending"){if(draw||oldStatus!=="pending")pending();return;}
 toggleGame(true);$("profileButton").replaceChildren(avatar(state.player));clock();
 if(draw||oldStatus!=="approved"){const key=new URLSearchParams(location.search).get("open"),routes={events:"Γεγονότα",tickets:"Δελτίο",bank:"Τράπεζα",profile:"Προφίλ",admin:"Διαχείριση"};if(key&&routes[key]){const u=new URL(location.href);u.searchParams.delete("open");history.replaceState(null,"",u);if(key==="profile")profileTarget=null;show(key==="admin"&&!state.player.is_admin?"Γεγονότα":routes[key]);}else show(tab);}
 else if(!["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)){
 const gChanged=oldGame!==JSON.stringify(state.game),bChanged=oldBank!==JSON.stringify(state.bank),sChanged=oldShop!==JSON.stringify(state.shop),dChanged=oldDeparture!==JSON.stringify(state.departure);
 if(tab==="Διαχείριση"||(tab==="Γεγονότα"&&gChanged)||(tab==="Δελτίο"&&gChanged)||(tab==="Κατάταξη"&&(gChanged||sChanged))||(tab==="Τράπεζα"&&bChanged)||(tab==="Προφίλ"&&(gChanged||sChanged))||(tab==="Τρόπαια"&&sChanged)||(tab==="Παραιτήσεις"&&dChanged))show(tab);
 }
 }catch(e){if(started!==revision||sessionToken!==token)return;if([401,403].includes(e.status)){setToken("");state=null;picks.clear();profileTarget=null;giftTarget=null;authForm(e.message);}else if(!state)authForm("Δεν υπάρχει σύνδεση με τον server. Δοκίμασε ξανά.");else feedback(e.message);}finally{refreshing=false;}
}
authForm();if(token)refresh(true);setInterval(()=>{clock();if(!busy&&!resetOpen&&document.visibilityState!=="hidden")refresh();},30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!busy&&!resetOpen)refresh();});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
