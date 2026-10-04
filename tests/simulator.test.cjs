const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pricing=require('../pricing.js');
const seedContext=vm.createContext({});vm.runInContext(fs.readFileSync('price-snapshot.js','utf8'),seedContext);
const snapshot=seedContext.PACK_LAB_PRICE_SNAPSHOT;
const PACK_PRICE=pricing.packQuote(snapshot.pack).cents;
const INITIAL_BALANCE=1000000;
const source = fs.readFileSync('app.js', 'utf8');
const baseCards = JSON.parse(fs.readFileSync('index.html','utf8').match(/<script id="base-set-data"[^>]*>([\s\S]*?)<\/script>/)[1]);

const sets=require('../sets.js');require('../skyridge-data.js');const sky=globalThis.PACK_LAB_SKYRIDGE;
const cards=[...baseCards,...sky.cards];
// Run the actual production functions in a deterministic, isolated environment.
// UI stubs keep this suite focused on pack integrity, persistence and spoilers.
function productionFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(start, `Production function ${name} exists`);
  const next = /^(?:async )?function |^const infoContent=/gm;
  next.lastIndex = start.index + start[0].length;
  const end = next.exec(source);
  return source.slice(start.index, end ? end.index : source.length);
}
function harness() {
  let seed = 9284317;
  const store = new Map();
  const ctx = vm.createContext({
    CARDS: cards,BOOSTER_COUNT:433,PackLabSets:sets,SETS:sets.sets,setOf:sets.setOf,isHolo:sets.isHolo,isShiny:sets.isShiny, CARD_MAP: new Map(cards.map(c=>[c.id,c])), PACK_ART:{charizard:{},blastoise:{},venusaur:{}},
    POOLS:Object.fromEntries(['common','uncommon','energy','rare','holo'].map(r=>[r,cards.filter(c=>!c.set&&c.rarity===r&&c.booster).map(c=>c.id)])),
    crypto:{getRandomValues(a){for(let i=0;i<a.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;a[i]=seed;}return a;}},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    STORAGE_KEY:'packLab.baseSet.v2', LEGACY_STORAGE_KEY:'vfcPokemonBaseSetPrototype.v1',
    storageAvailable:true, storageCorrupt:false, Date, console, START_BALANCE:INITIAL_BALANCE,QUIZ_REWARD:50000,QUIZ_TARGET:10,PackLabPricing:pricing,priceBook:pricing.create(cards,{seed:{...snapshot,quotes:{...snapshot.quotes,...sky.quotes}}}),economyBusy:false, number:String,money:cents=>String(cents/100),
    saveState(){ctx.writes++;store.set('packLab.baseSet.v2',JSON.stringify(ctx.state));},
    updateStats(){}, syncControls(){}, warmCard(){}, bringStageIntoView(){},
    refreshExternalState(){}, renderOpener(){}, toast(){}, reducedMotion:()=>true,
    finishPack:async()=>{ctx.state.lastPack.revealed=ctx.state.lastPack.cards.length;ctx.busy=false;},
    navigator:{locks:{request:async(k,fn)=>fn()}}, writes:0, busy:false, phase:'idle',externalStatePending:false,
  });
  const functions=['currentSet','validPackCards','emptyState','paidPrice','packQuote','packCost','validCardId','validatedState','readState','displayInventory','totals','randomInt','sample','rareCard','generatePack','createAndSavePack','pendingPack','openPack','packMilestone','cardQuote','saleSelection','applySale','reloadSavedState','economyTransaction','grantQuizCorrect','resetBalance'];
  for(const name of functions) vm.runInContext(productionFunction(name),ctx);
  vm.runInContext('state=emptyState()',ctx);
  return {ctx,store,run:code=>vm.runInContext(code,ctx)};
}
const fixture=[43,44,45,46,58,23,24,30,99,99,4];
function gameHarness(){
 const h=harness();
 Object.assign(h.ctx,{POKEMON:Array.from({length:12},(_,i)=>({id:i+1,name:`Pokémon ${i+1}`})),quiz:null,memory:null,memoryTimer:null,activeTab:'memory',renderQuiz(){},renderMemory(){},sound(){},announce(){},$:()=>({focus(){}}),setTimeout(fn){h.ctx.pendingTimer=fn;return 1;},clearTimeout(){h.ctx.pendingTimer=null;}});
 for(const name of ['nextQuiz','answerQuiz','newMemory','flipMemory'])vm.runInContext(productionFunction(name),h.ctx);
 return h;
}
test('quiz creates four distinct options, avoids an immediate repeat and accepts one answer only',async()=>{
 const h=gameHarness();h.run('nextQuiz()');
 const q=h.ctx.quiz;assert.equal(new Set(q.options.map(p=>p.id)).size,4);assert.ok(q.options.some(p=>p.id===q.answer.id));
 await h.run(`Promise.all([answerQuiz(${q.answer.id}),answerQuiz(${q.answer.id})])`);assert.equal(h.ctx.quiz.correct,1);assert.equal(h.ctx.quiz.attempts,1);
 h.run('nextQuiz()');assert.notEqual(h.ctx.quiz.answer.id,q.answer.id);assert.equal(h.ctx.quiz.streak,1);
 await h.run('answerQuiz(999)');assert.equal(h.ctx.quiz.attempts,1);
 await h.run('answerQuiz(quiz.options.find(p=>p.id!==quiz.answer.id).id)');assert.equal(h.ctx.quiz.streak,0);assert.equal(h.ctx.quiz.attempts,2);
});
test('Memory prevents a third flip and a board reset cancels a pending mismatch',()=>{
 const h=gameHarness();h.run('newMemory()');
 const cards=h.ctx.memory.cards;assert.equal(cards.length,12);assert.equal(new Set(cards.map(p=>p.id)).size,6);
 const different=cards.findIndex(p=>p.id!==cards[0].id);h.run(`flipMemory(0);flipMemory(${different})`);
 assert.equal(h.ctx.memory.locked,true);assert.equal(h.ctx.memory.moves,1);
 h.run('flipMemory(11)');assert.equal(h.ctx.memory.open.length,2);
 h.run('newMemory()');assert.equal(h.ctx.pendingTimer,null);assert.equal(h.ctx.memory.locked,false);assert.equal(h.ctx.memory.moves,0);
});
test('Memory completes in six moves for six pairs and never changes pack inventory',()=>{
 const h=gameHarness();h.run('newMemory()');
 const pairs=new Map();h.ctx.memory.cards.forEach((p,i)=>pairs.set(p.id,[...(pairs.get(p.id)||[]),i]));
 for(const [a,b] of pairs.values())h.run(`flipMemory(${a});flipMemory(${b});flipMemory(${b})`);
 assert.equal(h.ctx.memory.matched.length,12);assert.equal(h.ctx.memory.moves,6);assert.equal(h.ctx.state.packs,0);
 assert.equal(Object.keys(h.ctx.state.inventory).length,0);
});
function commitFixture(h,pack=fixture) {h.ctx.nextCards=pack;h.run('generatePack=()=>[...nextCards];createAndSavePack()');}

function trayHarness(){
 const h=harness();commitFixture(h);
 Object.assign(h.ctx,{escapeHtml:String,icon:()=>'',cardImage:id=>`<img data-card-image="${id}">`});
 vm.runInContext(productionFunction('revealRail'),h.ctx);
 return h;
}
test('the tray never reveals the card still on the stack, including after resuming a pack',()=>{
 const h=trayHarness();
 for(let revealed=0;revealed<=11;revealed++){
  h.run(`state.lastPack.revealed=${revealed};state=validatedState(JSON.parse(JSON.stringify(state)))`);
  const html=h.run('revealRail(state.lastPack)');
  assert.equal((html.match(/data-card-image=/g)||[]).length,Math.max(0,revealed-1));
  if(revealed>0)assert.doesNotMatch(html,new RegExp(`data-slot="${revealed-1}" data-card=`));
 }
 assert.doesNotMatch(h.run('revealRail(state.lastPack)'),/Charizard/);
 assert.match(h.run('revealRail(state.lastPack,11)'),/Charizard/);
});
test('a card enters the tray only after its flight to the empty slot has finished',async()=>{
 const h=trayHarness();h.ctx.state.lastPack.revealed=1;
 let land,removed=false;const flight=new Promise(resolve=>{land=resolve;});
 const tray={outerHTML:h.run('revealRail(state.lastPack)')};
 const ghost={style:{},removeAttribute(){},setAttribute(){},remove(){removed=true;}};
 const current={style:{},getBoundingClientRect:()=>({left:100,top:50,width:167,height:230}),cloneNode:()=>ghost};
 const target={getBoundingClientRect:()=>({left:20,top:350,width:35,height:48})};
 Object.assign(h.ctx,{activeTab:'opener',reducedMotion:()=>false,document:{body:{append(){}}},animateElement:()=>flight,$:selector=>selector==='.big-card'?current:selector==='.reveal-tray'?tray:selector==='[data-slot="0"] .slot-placeholder'?target:null});
 vm.runInContext(productionFunction('moveCurrentCardToTray'),h.ctx);
 const moving=h.run('moveCurrentCardToTray()');
 assert.doesNotMatch(tray.outerHTML,/data-card-image=/);assert.equal(current.style.opacity,'0');
 land();await moving;
 assert.equal((tray.outerHTML.match(/data-card-image=/g)||[]).length,1);
 assert.match(tray.outerHTML,/data-slot="0" data-card="43"/);assert.equal(removed,true);assert.equal(current.style.opacity,'');
 // Reduced motion still places the card without waiting for an animation.
 h.ctx.reducedMotion=()=>true;h.ctx.animateElement=()=>{throw new Error('Unexpected animation');};
 h.ctx.state.lastPack.revealed=2;await h.run('moveCurrentCardToTray()');
 assert.equal((tray.outerHTML.match(/data-card-image=/g)||[]).length,2);
});

test('5,000 simulated packs retain slot rules, pool sizes and the one-in-three holo model',()=>{
  const h=harness();
  assert.deepEqual(Object.fromEntries(Object.entries(h.ctx.POOLS).map(([k,v])=>[k,v.length])),{common:32,uncommon:32,energy:6,rare:16,holo:15});
  let holo=0;
  for(let i=0;i<5000;i++){
    const pack=h.run('generatePack()');assert.equal(pack.length,11);assert.ok(!pack.includes(8));
    assert.equal(new Set(pack.slice(0,5)).size,5);assert.equal(new Set(pack.slice(5,8)).size,3);
    for(let j=0;j<11;j++){const rarity=h.ctx.CARD_MAP.get(pack[j]).rarity;assert.ok(j<5?rarity==='common':j<8?rarity==='uncommon':j<10?rarity==='energy':['rare','holo'].includes(rarity));}
    if(h.ctx.CARD_MAP.get(pack[10]).rarity==='holo')holo++;
  }
  assert.ok(holo>1500&&holo<1800,`Deterministic sample: ${holo} holos / 5000`);
});

test('an opening saves exactly eleven cards before any animation; duplicate energy is counted twice',()=>{
  const h=harness();commitFixture(h);
  assert.equal(h.ctx.writes,1);assert.equal(h.ctx.state.packs,1);
  assert.equal(h.run('totals().total'),11);assert.equal(h.ctx.state.inventory[99].qty,2);
  assert.equal(h.ctx.state.lastPack.newIndices.length,10);assert.equal(h.ctx.state.lastPack.revealed,0);
});

test('unrevealed cards and holos never enter displayed statistics, even after reloading',()=>{
  const h=harness();commitFixture(h);
  assert.equal(h.run('totals(displayInventory()).unique'),0);assert.equal(h.run('totals(displayInventory()).holos'),0);
  h.run('state.lastPack.revealed=9');assert.equal(h.run('displayInventory()[99].qty'),1);
  assert.equal(h.run('totals(displayInventory()).total'),9);
  h.run('state=validatedState(JSON.parse(JSON.stringify(state)))');
  assert.equal(h.run('state.lastPack.revealed'),9);assert.equal(h.run('totals(displayInventory()).holos'),0);
  h.run('state.lastPack.revealed=11');assert.equal(h.run('totals(displayInventory()).holos'),1);
  assert.equal(h.run('displayInventory()[99].qty'),2);
});

test('reopening or rapidly clicking does not reroll a pending pack or register it twice',async()=>{
  const h=harness();
  await Promise.all(Array.from({length:15},()=>h.run('openPack(true)')));
  assert.equal(h.ctx.state.packs,1);assert.equal(h.run('totals().total'),11);
  h.run('state.lastPack.revealed=3');const before=JSON.stringify(h.ctx.state.lastPack.cards);
  await h.run('openPack(true)');assert.equal(h.ctx.state.packs,1);assert.equal(JSON.stringify(h.ctx.state.lastPack.cards),before);
});

test('legacy saves and interrupted openings retain inventory, favourites and artwork',()=>{
  const h=harness();commitFixture(h);h.run('state.favorites=[4,58];state.settings.art="blastoise";state.lastPack.revealed=5;state.settings.mode="reel"');
  h.store.delete('packLab.baseSet.v2');h.store.set('vfcPokemonBaseSetPrototype.v1',JSON.stringify(h.ctx.state));
  h.run('state=readState()');assert.equal(h.ctx.state.packs,1);assert.equal(h.ctx.state.lastPack.revealed,5);
  assert.deepEqual([...h.ctx.state.favorites],[4,58]);assert.equal(h.ctx.state.settings.art,'blastoise');
  assert.equal(h.ctx.state.settings.mode,'flip');assert.equal(h.ctx.state.inventory[99].qty,2);
  assert.ok(h.store.has('packLab.baseSet.v2'));
});

test('milestones are earned once from a genuine inventory transition',()=>{
  const h=harness();commitFixture(h);
  assert.equal(h.run('packMilestone(state.lastPack)'),'Your first holo. A keeper.');
  h.run('state.lastPack.revealed=11');commitFixture(h);
  assert.equal(h.run('packMilestone(state.lastPack)'),'');assert.equal(h.ctx.state.lastPack.newIndices.length,0);
});

test('trio milestone requires all three cards and survives serializing the completed pack',()=>{
  const h=harness();commitFixture(h,[...fixture.slice(0,10),2]);
  h.run('state.lastPack.revealed=11');commitFixture(h,[...fixture.slice(0,10),4]);
  h.run('state.lastPack.revealed=11');commitFixture(h,[...fixture.slice(0,10),15]);
  assert.equal(h.run('packMilestone(state.lastPack)'),'The original trio. Together at last.');
  h.run('state.lastPack.milestone=packMilestone(state.lastPack);state.lastPack.celebrated=true;state.lastPack.revealed=11;state=validatedState(JSON.parse(JSON.stringify(state)))');
  assert.equal(h.ctx.state.lastPack.celebrated,true);assert.equal(h.ctx.state.lastPack.milestone,'The original trio. Together at last.');
});

test('invalid imports reject wrong totals, negative counts, unknown cards and starter-only Machamp',()=>{
  const h=harness();commitFixture(h);
  for(const edit of ['input.packs=2','input.inventory[43].qty=-1','input.inventory[999]={qty:1}','input.inventory[8]={qty:1}']){
    assert.throws(()=>h.run(`{const input=JSON.parse(JSON.stringify(state));${edit};validatedState(input)}`));
  }
  assert.equal(h.ctx.state.packs,1);assert.equal(h.run('totals().total'),11);
});

test('pack purchases deduct once, require funds and resume without charging again',async()=>{
 const h=harness();await Promise.all(Array.from({length:15},()=>h.run('openPack(true)')));
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE);assert.equal(h.ctx.state.economy.spent,PACK_PRICE);
 h.run('state.lastPack.revealed=4;saveState()');await h.run('openPack(true)');assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE);
 h.run('state.lastPack.revealed=11;state.economy.balance=249;saveState()');
 await h.run('openPack(true)');assert.equal(h.ctx.state.packs,1);assert.equal(h.ctx.state.economy.balance,249);
});

test('sale preserves hidden cards, credits only owned copies and survives import',()=>{
 const h=harness();commitFixture(h);
 assert.equal(h.run('applySale([{id:4,qty:1,cents:500}])'),0);
 h.run('state.lastPack.revealed=9');
 assert.equal(h.run('applySale([{id:99,qty:2,cents:5}])'),0);
 assert.equal(h.run('applySale([{id:99,qty:1,cents:5}])'),5);
 assert.equal(h.ctx.state.inventory[99].qty,1);assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE+5);
 assert.equal(h.run('applySale([{id:99,qty:1,cents:5}])'),0);
 h.run('state=validatedState(JSON.parse(JSON.stringify(state)))');assert.equal(h.ctx.state.economy.soldCards,1);
 h.run('state.lastPack.revealed=11');assert.equal(h.run('applySale([{id:99,qty:1,cents:5}])'),5);
 assert.equal(h.ctx.state.inventory[99],undefined);assert.equal(h.run('totals().total+state.economy.soldCards'),11);
});

test('duplicates keep one copy of each card and all favourites',()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11');commitFixture(h);
 h.run('state.lastPack.revealed=11;state.favorites=[4];applySale(saleSelection("duplicates"))');
 assert.equal(h.ctx.state.inventory[4].qty,2);assert.equal(h.ctx.state.inventory[99].qty,1);
 assert.equal(h.ctx.state.economy.soldCards,11);assert.equal(h.run('saleSelection("duplicates").length'),0);
 h.run('state=validatedState(JSON.parse(JSON.stringify(state)))');
});

test('balance reset keeps cards and cumulative quiz progress after reload',async()=>{
 const h=harness();commitFixture(h);h.run('state.economy.quizCorrect=9;saveState()');
 const before=JSON.stringify(h.ctx.state.inventory);await h.run('resetBalance()');
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE);assert.equal(h.ctx.state.economy.quizCorrect,9);
 assert.equal(JSON.stringify(h.ctx.state.inventory),before);assert.equal(h.ctx.state.lastPack.revealed,0);
 h.run('state=readState()');assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE);
});

test('quiz rewards every ten total correct answers once, across mistakes, resets and reloads',async()=>{
 const h=gameHarness();
 for(let i=0;i<9;i++){h.run('nextQuiz()');await h.run('answerQuiz(quiz.answer.id)');}
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE);assert.equal(h.ctx.state.economy.quizCorrect,9);
 h.run('nextQuiz()');await h.run('answerQuiz(quiz.options.find(p=>p.id!==quiz.answer.id).id)');
 h.run('state=readState();quiz=null;nextQuiz()');
 await h.run('Promise.all([answerQuiz(quiz.answer.id),answerQuiz(quiz.answer.id)])');
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE+50000);assert.equal(h.ctx.state.economy.quizCorrect,10);
 for(let i=0;i<10;i++){h.run('nextQuiz()');await h.run('answerQuiz(quiz.answer.id)');}
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE+100000);assert.equal(h.ctx.state.economy.quizEarned,100000);
});

test('version-one saves migrate with 10,000 virtual USD and no lost cards',()=>{
 const h=harness();commitFixture(h);
 h.run('const old=JSON.parse(JSON.stringify(state));old.version=1;delete old.economy;state=validatedState(old)');
 assert.equal(h.ctx.state.version,4);assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE);assert.equal(h.run('totals().total'),11);
});

test('invalid money, sold totals and missing reserved copies are rejected',()=>{
 const h=harness();commitFixture(h);
 for(const edit of ['input.economy.balance=-1','input.economy.balance=1.5','input.economy.soldCards=1','input.economy.quizCorrect=-5','delete input.inventory[4];input.economy.soldCards=1']){
  assert.throws(()=>h.run(`{const input=JSON.parse(JSON.stringify(state));${edit};validatedState(input)}`));
 }
});

test('a transaction reloads the latest wallet before crediting it',async()=>{
 const h=harness();
 h.store.set('packLab.baseSet.v2',JSON.stringify({...h.ctx.state,updatedAt:h.ctx.state.updatedAt+100,economy:{...h.ctx.state.economy,balance:1000,quizCorrect:9}}));
 await h.run('economyTransaction(grantQuizCorrect)');assert.equal(h.ctx.state.economy.balance,51000);
});

test('pricing selects the matching variant and rejects missing or invalid market values',()=>{
 const pricing=require('../pricing.js'),card=cards.find(c=>c.id===4),updated=new Date().toISOString();
 const data={id:'base1-4',pricing:{tcgplayer:{unit:'USD',updated,normal:{marketPrice:1},holofoil:{marketPrice:944.53},'1st-edition-holofoil':{marketPrice:10000}}}};
 const q=pricing.normalize(card,data);assert.equal(q.variant,'holofoil');assert.equal(pricing.quote(card,q).cents,94453);
 delete data.pricing.tcgplayer.holofoil;assert.equal(pricing.normalize(card,data),null);
 assert.equal(pricing.quote(card,null).unavailable,true);
 for(const amount of [null,-5,0,Infinity,NaN,'100']){data.pricing.tcgplayer.holofoil={marketPrice:amount};assert.equal(pricing.normalize(card,data),null);}
 data.id='base1-58';assert.equal(pricing.normalize(card,data),null);
});

test('price cache avoids repeat requests and keeps old quotes when refresh fails',async()=>{
 const pricing=require('../pricing.js'),card=cards.find(c=>c.id===58);let calls=0;
 const seed={quotes:{58:{amount:13.3,currency:'USD',source:'TCGplayer',variant:'normal',updated:new Date().toISOString(),fetchedAt:Date.now()}}};
 const book=pricing.create([card],{seed,storage:{getItem:()=>'{broken',setItem(){throw Error('Full');}},fetcher:async()=>{calls++;throw Error('Offline');}});
 await book.refresh();assert.equal(calls,0);assert.equal(book.get(card).cents,1330);
 await book.refresh(true);assert.equal(calls,1);assert.equal(book.get(card).cents,1330);assert.equal(book.refreshing,false);
});

test('bundled quotes cover every booster card and use matching variants',()=>{
 const pricing=require('../pricing.js'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('price-snapshot.js','utf8'),ctx);
 for(const card of baseCards.filter(c=>c.booster)){assert.equal(pricing.validQuote(card,ctx.PACK_LAB_PRICE_SNAPSHOT.quotes[card.id]),true,card.name);}
});

test('selling a holo does not rewrite the historical holo pull rate',()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11');
 assert.equal(h.run('totals().rate'),'100.0%');
 h.run('applySale([{id:4,qty:1,cents:500}]);state=validatedState(JSON.parse(JSON.stringify(state)))');
 assert.equal(h.run('totals().holos'),0);assert.equal(h.run('totals().rate'),'100.0%');
});

test('a later reveal save preserves a sale saved by another tab',()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11;saveState()');
 const stale=JSON.stringify(h.ctx.state);
 h.run('applySale([{id:4,qty:1,cents:500}]);state.updatedAt+=100;saveState()');
 h.run(`state=JSON.parse(${JSON.stringify(stale)})`);
 h.ctx.$$=()=>[];h.ctx.setStorageLabels=()=>{};
 vm.runInContext(productionFunction('saveState'),h.ctx);h.run('saveState()');
 assert.equal(h.ctx.state.inventory[4],undefined);assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE+500);
 assert.equal(h.ctx.state.economy.soldCards,1);assert.equal(h.run('validatedState(state).holoPulls'),1);
});

test('selling a card at its exact market price funds a new market-priced pack',async()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11;state.economy.balance=0');
 const salePrice=h.run('cardQuote(4).cents');
 assert.equal(salePrice,Math.round(snapshot.quotes[4].amount*100));
 assert.ok(salePrice>=PACK_PRICE,'The seeded Charizard quote can fund a pack');
 assert.equal(h.run('applySale(saleSelection("one",4))'),salePrice);
 h.run('saveState()');await h.run('openPack(true)');
 assert.equal(h.ctx.state.packs,2);assert.equal(h.ctx.state.economy.balance,salePrice-PACK_PRICE);
 assert.equal(h.ctx.state.lastPack.paidCents,PACK_PRICE);assert.equal(h.ctx.state.history[0].paidCents,PACK_PRICE);
 h.run('state=readState()');assert.equal(h.ctx.state.economy.balance,salePrice-PACK_PRICE);
 assert.equal(h.ctx.state.lastPack.paidCents,PACK_PRICE);
});

test('version-two balances migrate once to USD cents without losing cards or quiz progress',()=>{
 const h=harness();commitFixture(h);
 h.run('const old=JSON.parse(JSON.stringify(state));old.version=2;old.economy={balance:10358,soldCards:0,quizCorrect:19,spent:250,sales:108,quizEarned:500};state=validatedState(old)');
 assert.equal(h.ctx.state.economy.balance,1035800);assert.equal(h.ctx.state.economy.spent,25000);
 assert.equal(h.ctx.state.economy.sales,10800);assert.equal(h.ctx.state.economy.quizEarned,50000);
 assert.equal(h.ctx.state.economy.quizCorrect,19);assert.equal(h.run('totals().total'),11);
 assert.equal(h.ctx.state.lastPack.paidCents,null);
 h.run('state=validatedState(JSON.parse(JSON.stringify(state)))');assert.equal(h.ctx.state.economy.balance,1035800);
});

test('unknown prices cannot be sold or used to purchase a pack, and cents retain precision',()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11');
 h.ctx.priceBook={get:()=>({cents:null,unavailable:true}),getPack:()=>({cents:null,unavailable:true})};
 assert.equal(h.run('saleSelection("one",4).length'),0);assert.equal(h.run('saleSelection("duplicates").length'),0);
 assert.equal(h.run('createAndSavePack()'),null);assert.equal(h.ctx.state.packs,1);
 assert.equal(pricing.toCents(0.29),29);assert.equal(pricing.toCents(927.56),92756);
});

test('pack normalization requires the exact sealed product and a valid market quote',()=>{
 const updated=new Date().toISOString();
 const row={productId:138130,subTypeName:'Normal',marketPrice:927.56};
 const q=pricing.normalizePack({success:true,results:[row]},updated);
 assert.equal(pricing.packQuote(q).cents,92756);
 for(const change of [{productId:138131},{subTypeName:'1st Edition'},{marketPrice:null},{marketPrice:0},{marketPrice:'927.56'}]){
  assert.equal(pricing.normalizePack({success:true,results:[{...row,...change}]},updated),null);
 }
 assert.equal(pricing.normalizePack({success:false,results:[row]},updated),null);
});

test('pack service refreshes once for simultaneous requests and caches the matching product',async()=>{
 const {createPackPriceService}=await import('../pack-prices.mjs');let calls=0;
 const now=Date.now(),updated=new Date(now-1000).toISOString();
 const service=createPackPriceService({now:()=>now,fetcher:async url=>{
  calls++;return {ok:true,text:async()=>updated,json:async()=>({success:true,results:[{productId:138130,subTypeName:'Normal',marketPrice:927.56},{productId:1,subTypeName:'Normal',marketPrice:5}]})};
 }});
 const results=await Promise.all([service(),service(),service()]);
 assert.equal(calls,2);assert.ok(results.every(result=>result.pack.amount===927.56&&!result.cached));
 await service();assert.equal(calls,2);
});

test('pack service retains dated quotes on failure without inventing fresh prices',async()=>{
 const {createPackPriceService}=await import('../pack-prices.mjs');
 const old={...snapshot.pack,fetchedAt:Date.now()-pricing.TTL*2};let calls=0;
 const service=createPackPriceService({seed:old,fetcher:async()=>{calls++;throw Error('Offline');}});
 const result=await service();assert.equal(result.cached,true);assert.deepEqual(result.pack,old);
 await service();assert.equal(calls,1);
 const empty=await createPackPriceService({fetcher:async()=>{throw Error('Offline');}})();assert.equal(empty.pack,null);
});


test('Skyridge catalogue keeps all card numbers and printing variants distinct',()=>{
 assert.equal(sky.cards.length,332);assert.equal(new Set(cards.map(c=>c.id)).size,434);
 assert.deepEqual(Object.fromEntries(Object.entries(sets.pools(cards,'ecard3')).map(([r,p])=>[r,p.length])),{common:73,uncommon:36,energy:0,rare:35,holo:32,secret:6,reverse:150});
 assert.equal(sets.cardNumber(cards.find(c=>c.id===1230)),'H30/H32');
 assert.equal(sets.cardNumber(cards.find(c=>c.id===2146)),'146/144 · Reverse');
 for(const [id,q] of Object.entries(sky.quotes))assert.equal(pricing.validQuote(cards.find(c=>c.id===Number(id)),q),true);
 assert.ok(Object.keys(sky.quotes).length>250);
});

test('10,000 Skyridge packs contain nine correct slots and can reach all Crystal printings',()=>{
 const h=harness();h.run('state.settings.set="ecard3"');let crystals=0,crystalReverses=0,holos=0;const found=new Set();
 for(let n=0;n<10000;n++){
  const pack=h.run('generatePack()'),pulled=pack.map(id=>h.ctx.CARD_MAP.get(id));
  assert.equal(pack.length,9);assert.ok(pulled.every(c=>c.set==='ecard3'));
  assert.ok(pulled.slice(0,5).every(c=>c.rarity==='common'));assert.equal(new Set(pack.slice(0,5)).size,5);
  assert.ok(pulled.slice(5,7).every(c=>c.rarity==='uncommon'));assert.equal(new Set(pack.slice(5,7)).size,2);
  assert.equal(pulled[7].rarity,'reverse');assert.ok(['rare','holo','secret'].includes(pulled[8].rarity));
  if(pulled[8].rarity==='secret')crystals++;if(pulled[8].rarity==='holo')holos++;
  if(Number(pulled[7].number)>144)crystalReverses++;
  pack.forEach(id=>found.add(id));
 }
 assert.ok(crystals>210&&crystals<350);assert.ok(crystalReverses>210&&crystalReverses<350);assert.ok(holos>3000&&holos<3450);
 assert.equal(sky.cards.every(c=>found.has(c.id)),true);
});

test('Skyridge costs the verified PriceCharting reference and preserves mixed packs through reload and sales',async()=>{
 const h=harness();commitFixture(h);h.run('state.lastPack.revealed=11;state.settings.set="ecard3";state.settings.art="skyridge"');
 h.run('generatePack=()=>[1046,1047,1048,1049,1050,1036,1037,2054,1146];createAndSavePack()');
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE-342400);assert.equal(h.ctx.state.lastPack.cards.length,9);
 assert.equal(h.ctx.state.lastPack.set,'ecard3');assert.equal(h.ctx.state.lastPack.paidCents,342400);
 assert.equal(h.run('totals(displayInventory()).total'),11);assert.equal(h.run('totals().total'),20);
 h.run('state.lastPack.revealed=7;state=validatedState(JSON.parse(JSON.stringify(state)))');
 assert.equal(h.run('saleSelection("one",2054).length'),0);assert.equal(h.run('totals(displayInventory()).holos'),1);
 h.run('state.lastPack.revealed=9;applySale(saleSelection("one",1046));state=validatedState(JSON.parse(JSON.stringify(state)))');
 assert.equal(h.ctx.state.inventory[1046],undefined);assert.equal(h.ctx.state.holoPulls,2);
 assert.equal(h.run('totals().total+state.economy.soldCards'),20);
 assert.deepEqual({...h.ctx.state.packCounts},{base1:1,ecard3:1});
 assert.equal(h.ctx.state.history[0].cards.length,9);assert.equal(h.ctx.state.history[1].cards.length,11);
});

test('switching sets is blocked during an unfinished pack and retains the collection afterward',()=>{
 const h=harness();Object.assign(h.ctx,{showIdleOverride:false,renderHighlights(){},renderEconomy(){}});vm.runInContext(productionFunction('selectSet'),h.ctx);
 commitFixture(h);h.run('selectSet("ecard3")');assert.equal(h.ctx.state.settings.set,'base1');
 h.run('state.lastPack.revealed=11;selectSet("ecard3")');assert.equal(h.ctx.state.settings.set,'ecard3');assert.equal(h.ctx.state.settings.art,'skyridge');
 assert.equal(h.run('totals().total'),11);assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE);
 h.run('selectSet("base1")');assert.equal(h.ctx.state.settings.art,'charizard');assert.equal(h.run('packCost()'),PACK_PRICE);
});

test('version-three saves migrate to Base Set counters without changing balance or receipts',()=>{
 const h=harness();commitFixture(h);h.run('state.version=3;delete state.packCounts;delete state.settings.set;delete state.lastPack.set;state.history.forEach(p=>delete p.set);state=validatedState(JSON.parse(JSON.stringify(state)))');
 assert.equal(h.ctx.state.version,4);assert.deepEqual({...h.ctx.state.packCounts},{base1:1,ecard3:0});
 assert.equal(h.ctx.state.lastPack.set,'base1');assert.equal(h.ctx.state.lastPack.revealed,0);assert.equal(h.ctx.state.lastPack.paidCents,PACK_PRICE);
 assert.equal(h.ctx.state.economy.balance,INITIAL_BALANCE-PACK_PRICE);
});

test('save validation rejects inconsistent set totals and cross-set committed packs',()=>{
 const h=harness();commitFixture(h);
 assert.throws(()=>h.run('validatedState({...state,packCounts:{base1:0,ecard3:1}})'));
 assert.throws(()=>h.run('validatedState({...state,packCounts:{base1:1,ecard3:-1}})'));
 assert.equal(h.run('validPackCards({set:"ecard3",cards:state.lastPack.cards.slice(0,9)})'),false);
 assert.equal(h.run('validPackCards({set:"unknown",cards:state.lastPack.cards})'),false);
});

test('a Skyridge click cannot charge for a different set selected by another tab',async()=>{
 const h=harness();h.run('saveState();state.settings.set="ecard3";state.settings.art="skyridge"');
 await h.run('openPack(true)');assert.equal(h.ctx.state.lastPack.set,'ecard3');assert.equal(h.ctx.state.lastPack.cards.length,9);assert.equal(h.ctx.state.lastPack.paidCents,342400);
});

test('Skyridge CSV quotes never substitute reverse, holo or unrelated product prices',()=>{
 const card=sky.cards.find(c=>c.id===1146),updated=new Date().toISOString();
 const data={success:true,results:[{productId:card.productId,subTypeName:'Reverse Holofoil',marketPrice:3000}]};
 assert.equal(pricing.normalizeCSV(card,data,updated),null);
 const reverse=sky.cards.find(c=>c.id===2146);assert.equal(pricing.normalizeCSV(reverse,data,updated).amount,3000);
 data.results.push({productId:card.productId,subTypeName:'Holofoil',marketPrice:5000});
 assert.equal(pricing.normalizeCSV(card,data,updated).amount,5000);
 assert.equal(pricing.normalizeCSV({...card,productId:1},data,updated),null);
});

test('Skyridge market service shares refreshes and preserves dated prices on failure',async()=>{
 const {createSkyridgePriceService}=await import('../skyridge-prices.mjs');const card=sky.cards.find(c=>c.id===1046);let calls=0,offline=false,time=Date.now();
 const service=createSkyridgePriceService({cards:[card],now:()=>time,fetcher:async url=>{calls++;if(offline)throw Error('offline');return {ok:true,text:async()=>new Date(time-1000).toISOString(),json:async()=>({success:true,results:[{productId:card.productId,subTypeName:'Normal',marketPrice:29.04}]})};}});
 const result=await Promise.all([service(),service()]);assert.equal(calls,2);assert.equal(result[0].quotes[1046].amount,29.04);
 const stamp=result[0].quotes[1046].updated;time+=pricing.TTL+1;offline=true;
 const fallback=await service();assert.equal(fallback.cached,true);assert.equal(fallback.quotes[1046].updated,stamp);
 await service();assert.equal(calls,3);
});
