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

// LONG_RUN_50: deterministic 10-year model, no real accounts or network.
// Uses the same pure rules as the existing short model; not a server load test.
{
 const start="2026-11-28",end="2036-11-28",members=50;
 const users=Array.from({length:members},()=>({chips:1000,assets:[],seen:new Set(),debt:null,assetValue:0}));
 let total=members*1000,days=0,workdays=0,mondays=0,tickets=0,retries=0,purchases=0,credits=0,loans=0,repayments=0;
 for(let date=start;date<end;date=R.add(date,1)){
  days++;
  if(new Date(date+"T12:00:00Z").getUTCDay()===1){
   mondays++;
   for(const u of users){u.chips+=1000;total+=1000;credits++;}
   for(const u of users){if(!u.debt)continue;const {lender,amount}=u.debt;const due=amount+R.interest(amount);assert.ok(u.chips>=due);u.chips-=due;lender.chips+=due;u.debt=null;repayments++;}
   for(let j=0;j<4;j++){const u=users[j],lender=users[members-1-j],amount=10+rnd(291);if(lender.chips>=amount+400){lender.chips-=amount;u.chips+=amount;u.debt={lender,amount};loans++;}}
  }
  if(R.workday(date)){
   workdays++;
   for(let j=0;j<members;j++){
    const u=users[j],debt=u.debt?u.debt.amount+R.interest(u.debt.amount):0;
    const stake=Math.min(10+rnd(991),R.spendable(u.chips,date,[],debt));
    if(stake>=10){
     const picks=Array.from({length:1+rnd(6)},()=>({side:"yes",result:[null,"yes","no"][rnd(3)],odds:110+rnd(391)}));
     const paid=R.payout(stake,picks),key="ticket:"+date;
     function applyTicket(){if(u.seen.has(key))return;u.seen.add(key);u.chips+=paid-stake;total+=paid-stake;tickets++;}
     applyTicket();const balance=u.chips;applyTicket();assert.equal(u.chips,balance);retries++;assert.ok(paid>=0&&paid<=10000);
    }
    const price=10+rnd(500),item="item:"+rnd(232),key="buy:"+date;
    if(!u.seen.has(item)&&price<=R.spendable(u.chips,date,[],debt)){
     const before=u.chips+u.assetValue;
     function buy(){if(u.seen.has(key)||u.seen.has(item))return;u.seen.add(key);u.seen.add(item);u.chips-=price;u.assetValue+=price;u.assets.push({code:item,price});purchases++;}
     buy();buy();retries++;assert.equal(u.chips+u.assetValue,before);
    }
    assert.ok(Number.isSafeInteger(u.chips)&&u.chips>=0);
   }
  }
  assert.equal(users.reduce((s,u)=>s+u.chips+u.assetValue,0),total,"daily reconciliation "+date);
  if(date.endsWith("-12-31"))for(const u of users)assert.equal(R.wealth(u.chips,u.assets).total,u.chips+u.assetValue);
 }
 assert.equal(days,3653);assert.equal(workdays,2609);assert.equal(mondays,522);assert.equal(credits,members*mondays);
 for(const u of users)assert.equal(R.wealth(u.chips,u.assets).total,u.chips+u.assetValue);
 console.log("LONG_RUN_50 passed:",JSON.stringify({members,days,workdays,mondays,credits,tickets,purchases,loans,repayments,retries}));
}
