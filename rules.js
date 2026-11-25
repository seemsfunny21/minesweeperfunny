/* Pure rules, shared with tests. The eventual server must enforce every rule. */
(function(root){
"use strict";
const DAY=86400000;
const dateObj=d=>new Date(d+"T12:00:00Z");
const iso=d=>d.toISOString().slice(0,10);
const add=(d,n)=>iso(new Date(dateObj(d).getTime()+n*DAY));
const weekday=d=>dateObj(d).getUTCDay();
const workday=(d,holidays=[])=>weekday(d)>0&&weekday(d)<6&&!holidays.includes(d);
function nextWorkday(d,holidays=[]){for(let i=1;i<=366;i++){const x=add(d,i);if(workday(x,holidays))return x;}throw Error("No working day");}
function phase(date,time,holidays=[]){
 if(!workday(date,holidays))return "closed";
 return time<"10:00"?"locked":time<"12:00"?"vote":"open";
}
function reserve(date,holidays=[]){if(!workday(date,holidays)&&[0,6].includes(weekday(date)))return 0;let n=0;for(let i=1;i<=5;i++){const d=add(date,i);if(weekday(d)===0||weekday(d)===6)break;if(workday(d,holidays))n++;}return n*100;}
function spendable(balance,date,holidays=[],debt=0){return Math.max(0,balance-reserve(date,holidays)-Math.max(0,debt));}
function odds(yes,no){if(!Number.isSafeInteger(yes)||!Number.isSafeInteger(no)||yes<0||no<0)throw Error("Invalid history");const p=(yes+4)/(yes+no+8);const f=x=>Math.round(Math.max(1.10,Math.min(5,0.95/x))*100);return {yes:f(p),no:f(1-p)};}
function payout(stake,picks,cap=10000){if(!Number.isSafeInteger(stake)||stake<10||stake>1000||!Array.isArray(picks)||picks.length<1||picks.length>6)throw Error("Invalid ticket");let num=BigInt(stake),den=1n;for(const p of picks){if(!/^(yes|no|before|after|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus)$/.test(p.side)||!(p.result===null||/^(yes|no|before|after|s1500|s1530|s1600|s1630|s1700|s1700plus|c[0-4]|c5plus)$/.test(p.result))||!Number.isSafeInteger(p.odds)||p.odds<101||p.odds>2000)throw Error("Invalid pick");if(p.result===null)continue;if(p.result!==p.side)return 0;num*=BigInt(p.odds);den*=100n;}return Math.min(cap,Number(num/den));}
function interest(principal){if(!Number.isSafeInteger(principal)||principal<0||principal>300)throw Error("Invalid loan");return Math.ceil(principal/10);}
function weeklyCredit(principal){return 1000-principal-interest(principal);}
function net(tickets,bonus=0,receivedInterest=0,paidInterest=0){return tickets.filter(t=>t.settled).reduce((sum,t)=>sum+t.paid-t.stake,0)+bonus+receivedInterest-paidInterest;}
function selectWorkers(workers,target,random=Math.random){return workers.filter(w=>w.active&&!w.onLeave&&!w.departed).map(w=>({...w,tie:random()})).sort((a,b)=>(a.recentCount||0)-(b.recentCount||0)||a.tie-b.tie).slice(0,5);}
const api={add,workday,nextWorkday,phase,reserve,spendable,odds,payout,interest,weeklyCredit,net,selectWorkers};if(typeof module!=="undefined")module.exports=api;else root.PredictionRules=api;
})(typeof globalThis!=="undefined"?globalThis:this);
