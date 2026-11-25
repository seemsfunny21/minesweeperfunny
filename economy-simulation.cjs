const assert=require("node:assert/strict"),R=require("./rules.js");
let seed=1369;const rnd=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);
let counts={days:0,credits:0,loans:0,repayments:0,bets:0,payouts:0,purchases:0,duplicateRetries:0};
for(let run=0;run<20;run++){
 const users=Array.from({length:12},()=>({chips:1000,assets:[],seen:new Set(),debt:null}));let expected=12000;
 for(let day=0;day<365;day++){const date=R.add("2026-11-23",day);counts.days++;
  if(day%7===0){for(const u of users){u.chips+=1000;expected+=1000;counts.credits++;}
   for(const u of users){if(!u.debt)continue;let {lender,amount}=u.debt;let cost=amount+R.interest(amount);assert.ok(u.chips>=cost);u.chips-=cost;lender.chips+=cost;u.debt=null;counts.repayments++;}
   for(let j=0;j<4;j++){const u=users[j],lender=users[11-j],amount=10+rnd(291);if(lender.chips>=amount+400){lender.chips-=amount;u.chips+=amount;u.debt={lender,amount};counts.loans++;}}
  }
  if(R.workday(date))for(let j=0;j<users.length;j++){const u=users[j];const reserve=R.reserve(date),debt=u.debt?u.debt.amount+R.interest(u.debt.amount):0;
   const stake=Math.min(10+rnd(991),R.spendable(u.chips,date,[],debt));if(stake>=10){const picks=Array.from({length:1+rnd(6)},()=>({side:"yes",result:[null,"yes","no"][rnd(3)],odds:110+rnd(391)}));const pay=R.payout(stake,picks);u.chips+=pay-stake;expected+=pay-stake;counts.bets++;if(pay)counts.payouts++;assert.ok(pay<=10000);}
   const price=10+rnd(500);if(price<=R.spendable(u.chips,date,[],debt)){const key=date+":"+j;function buy(){if(u.seen.has(key))return;u.seen.add(key);u.chips-=price;u.assets.push({code:key,price});counts.purchases++;}const before=R.wealth(u.chips,u.assets).total;buy();buy();counts.duplicateRetries++;assert.equal(R.wealth(u.chips,u.assets).total,before);}
   assert.ok(u.chips>=reserve||stake<10);assert.ok(u.chips>=0);}
  assert.equal(users.reduce((s,u)=>s+R.wealth(u.chips,u.assets).total,0),expected);
 }
}
console.log("Synthetic 20 x 365-day economic model passed:",JSON.stringify(counts));
