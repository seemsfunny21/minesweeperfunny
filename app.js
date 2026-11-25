"use strict";
const R=PredictionRules;
const screens={
"Γεγονότα":[["Αυτόματη επιλογή","5 εργαζόμενοι"],["Πρόσθετες επιλογές","Έως 7 συνολικά"],["Ποντάρισμα","12:00–00:00"],["Υπενθύμιση","22:00 μόνο χωρίς δελτίο"],["Επιβεβαίωση","10:00–12:00"]],
"Δελτία":[["Μονά / παρολί","1–5 επιλογές"],["Απόδοση","Κλειδώνει στην υποβολή"],["Ακυρωμένη επιλογή","1,00"],["Επιστροφή","Από την Τράπεζα"]],
"Τράπεζα":[["Εβδομαδιαία πίστωση","1.000"],["Δάνεια ανά εβδομάδα","Έως 300"],["Τόκος ανεξόφλητου ποσού","10% τη Δευτέρα"],["Προστασία","100 ανά επόμενη εργάσιμη"]],
"Κατάταξη":[["Καθαρό αποτέλεσμα","Επιστροφές − πονταρίσματα"],["Εβδομαδιαίες πιστώσεις","Δεν μετρούν"],["Εκκρεμή δελτία","Δεν μετρούν"],["Τόκοι και μπόνους","Ξεχωριστή ανάλυση"]],
"Παραιτήσεις":[["Χρονικά διαστήματα","1–4 εβδομάδες, 2–5 μήνες"],["Σωστή πρόβλεψη","Μπόνους 2.000"],["Επιβεβαίωση","Μόνο πραγματική αποχώρηση"]],
"Προφίλ":[["Φωτογραφία","Από τον παίκτη ή εγκεκριμένη από τον Admin"],["Στατιστικά","Καθαρό αποτέλεσμα και ρεκόρ"],["Τρόπαια","Συλλογή και επιτεύγματα"],["Πρόσβαση","Πατώντας το όνομα"]],
"Τρόπαια":[["🥉","Χάλκινο"],["🥈","Ασημένιο"],["🏆","Χρυσό"],["💎","Διαμαντένιο"],["👑","Βασιλικό"],["🐉","Θρυλικό"]],
"Admin":[["Εγγραφή","Απαιτεί έγκριση"],["Νέο PIN","Παίκτης ×2, έπειτα PIN Admin"],["Μετά την αλλαγή","Αρχική οθόνη"],["Ιστορικό","Χωρίς κωδικούς"]]
};
const $=id=>document.getElementById(id),el=(tag,t,c)=>{const x=document.createElement(tag);x.textContent=t;if(c)x.className=c;return x;};
function show(k){for(const b of $("tabs").children)b.setAttribute("aria-selected",String(b.textContent===k));const s=$("screen");s.replaceChildren(el("h2",k));if(k==="Τρόπαια"){const box=el("div","","tiles");for(const [a,b] of screens[k]){const t=el("div","","tile");t.append(el("b",a),el("span",b));box.append(t);}s.append(box,el("p","Οι τιμές θα οριστούν μετά τη δοκιμή της οικονομίας.","muted"));return;}for(const [a,b] of screens[k]){const row=el("div","","row");row.append(el("span",a),el("span",b));s.append(row);}}
for(const k of Object.keys(screens)){const b=el("button",k);b.onclick=()=>show(k);$("tabs").append(b);}show("Γεγονότα");
function clock(){const now=new Date();const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const p=t=>parts.find(x=>x.type===t).value;const date=p("year")+"-"+p("month")+"-"+p("day"),time=p("hour")+":"+p("minute");$("clock").textContent=time;const phase=R.phase(date,time);$("phase").textContent={closed:"Σαββατοκύριακο / αργία",locked:"Κλειδωμένα",vote:"Επιβεβαίωση",open:"Ανοιχτά"}[phase];$("target").textContent="Επόμενη εργάσιμη: "+R.nextWorkday(date).split("-").reverse().join("/")+" · Προστασία: "+R.reserve(date)+" μάρκες";}clock();setInterval(clock,15000);
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
