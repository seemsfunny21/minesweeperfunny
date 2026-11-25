const assert=require("node:assert/strict"),r=require("./rules.js");
assert.equal(r.nextWorkday("2026-11-27"),"2026-11-30");
assert.equal(r.nextWorkday("2026-11-27",["2026-11-30"]),"2026-12-01");
assert.equal(r.phase("2026-11-28","15:00"),"closed");
assert.equal(r.phase("2026-11-25","09:59"),"locked");
assert.equal(r.phase("2026-11-25","10:00"),"vote");
assert.equal(r.phase("2026-11-25","12:00"),"open");
assert.deepEqual(["23","24","25","26","27"].map(x=>r.reserve("2026-11-"+x)),[400,300,200,100,0]);
assert.equal(r.spendable(670,"2026-11-23"),270);
assert.deepEqual(r.odds(0,0),{yes:190,no:190});
const p=(side,result,odds=190)=>({side,result,odds});
assert.equal(r.payout(100,[p("yes","yes"),p("no","no")]),361);
assert.equal(r.payout(100,[p("yes","yes"),p("no",null)]),190);
assert.equal(r.payout(100,[p("yes","no"),p("no",null)]),0);
assert.equal(r.payout(100,[p("yes",null),p("no",null)]),100);
assert.equal(r.payout(1000,Array(5).fill(p("yes","yes",500))),10000);
assert.equal(r.weeklyCredit(300),670);
assert.equal(r.weeklyCredit(200),780);
assert.equal(r.weeklyCredit(0),1000);
assert.equal(r.net([{settled:true,paid:250,stake:100},{settled:true,paid:0,stake:50},{settled:false,stake:200}]),100);
assert.equal(r.net([]),0);
assert.equal(r.selectWorkers(Array.from({length:8},(_,id)=>({id,active:true,onLeave:id===1,departed:id===2,recentCount:id})), "2026-11-26",()=>0.5).length,5);
console.log("All rule assertions passed");

assert.deepEqual(r.wealth(100,[{code:"a",price:50},{code:"a",price:50},{code:"b",category:"gift",price:1000}]),{chips:100,assets:50,total:150});
assert.notEqual(r.photoVersion("old"),r.photoVersion("new"));
assert.equal(r.photoVersion("old"),r.photoVersion("old"));
for(let n=1;n<=6;n++)for(let stake=10;stake<=1000;stake+=10){assert.equal(r.payout(stake,Array(n).fill(p("yes","no"))),0);assert.equal(r.payout(stake,Array(n).fill(p("yes",null))),stake);assert.ok(r.payout(stake,Array(n).fill(p("yes","yes",500)))<=10000);}
console.log("Extended wealth, version and 1800 payout assertions passed");
