(() => {
'use strict';
// Pack photos are local. This setting controls optional local card scans and backs.
const ASSET_MODE = "remote";
const STORAGE_KEY = 'packLab.baseSet.v2';
const LEGACY_STORAGE_KEY = 'vfcPokemonBaseSetPrototype.v1';
// All wallet amounts are integer USD cents; displayed prices are market USD 1:1.
const START_BALANCE=1000000,QUIZ_REWARD=50000,QUIZ_TARGET=10;
const moneyFormatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money=cents=>Number.isSafeInteger(cents)?moneyFormatter.format(cents/100):'Price unavailable';
let priceBook=null,economyBusy=false,inspectedCardId=null,priceRefreshFailed=false;
const warmedImages = new Set();
const resolvedImages = new Map();
const numberFormatter = new Intl.NumberFormat('en-US');
const CARDS = JSON.parse(document.getElementById('base-set-data').textContent);
const CARD_MAP = new Map(CARDS.map(card => [card.id, card]));
const PACK_ART = {
 charizard: {name:'Charizard',className:'char',url:'https://totalcards.net/cdn/shop/files/charizard_base_set_pack.webp?v=1732890226&width=535'},
 blastoise: {name:'Blastoise',className:'blast',url:'https://totalcards.net/cdn/shop/files/base_set_long_crimp_blastoise.webp?v=1733151179&width=535'},
 venusaur: {name:'Venusaur',className:'venu',url:'https://totalcards.net/cdn/shop/files/venusaur_base_set_pack.webp?v=1732890227&width=535'}
};
const CARD_BACK = 'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';
const RARITY = {holo:'Holo Rare',rare:'Rare',uncommon:'Uncommon',common:'Common',energy:'Basic Energy'};
const RARITY_ORDER = {holo:0,rare:1,uncommon:2,common:3,energy:4};
const POOLS = Object.fromEntries(Object.keys(RARITY).map(r => [r,CARDS.filter(c=>c.rarity===r && c.booster).map(c=>c.id)]));
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const number = value => numberFormatter.format(value);
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let storageAvailable=true, storageCorrupt=false;
let busy=false, phase='idle', activeTab='opener', libraryFilter='all', showIdleOverride=false;
let reelAnimation=null, audioContext=null, toastTimer=null, externalStatePending=false;
let state=readState();
const POKEMON = [[1,'Bulbasaur'],[3,'Venusaur'],[4,'Charmander'],[6,'Charizard'],[7,'Squirtle'],[9,'Blastoise'],[10,'Caterpie'],[25,'Pikachu'],[26,'Raichu'],[35,'Clefairy'],[37,'Vulpix'],[39,'Jigglypuff'],[50,'Diglett'],[54,'Psyduck'],[58,'Growlithe'],[63,'Abra'],[66,'Machop'],[74,'Geodude'],[77,'Ponyta'],[81,'Magnemite'],[92,'Gastly'],[95,'Onix'],[100,'Voltorb'],[109,'Koffing'],[113,'Chansey'],[124,'Jynx'],[129,'Magikarp'],[130,'Gyarados'],[143,'Snorlax'],[145,'Zapdos'],[150,'Mewtwo']].map(([id,name])=>({id,name}));
const ROUTES = {'#opening':'opener','#card-library':'library','#collection':'collection','#stats':'stats','#whos-that-pokemon':'quiz','#pokemon-memory':'memory'};
let quiz=null,memory=null,memoryTimer=null;

function emptyState(){return {version:3,packs:0,holoPulls:0,inventory:{},economy:{balance:START_BALANCE,soldCards:0,quizCorrect:0,spent:0,sales:0,quizEarned:0},history:[],lastPack:null,favorites:[],settings:{mode:'flip',art:'charizard',sound:false,layout:'grid'},updatedAt:Date.now()};}
function paidPrice(pack){return Number.isSafeInteger(pack.paidCents)&&pack.paidCents>=0&&pack.paidCents<=1e9?pack.paidCents:null;}
function validCardId(id){return Number.isInteger(id)&&CARD_MAP.has(id)&&id!==8;}
function validatedState(input){
 if(!input||![1,2,3].includes(input.version)||!input.inventory||typeof input.inventory!=='object'||Array.isArray(input.inventory))throw new Error('Invalid save');
 const out=emptyState();let total=0;
 if(input.version>=2){
  for(const key of Object.keys(out.economy)){
   const value=input.economy?.[key];if(!Number.isSafeInteger(value)||value<0||value>1e12)throw new Error('Invalid economy');
   out.economy[key]=input.version===2&&['balance','spent','sales','quizEarned'].includes(key)?value*100:value;
   if(!Number.isSafeInteger(out.economy[key])||out.economy[key]>1e12)throw new Error('Invalid economy');
  }
 }
 for(const [key,entry] of Object.entries(input.inventory)){
  const id=Number(key);if(!validCardId(id)||!entry||!Number.isSafeInteger(entry.qty)||entry.qty<1||entry.qty>1e9)throw new Error('Invalid inventory');
  out.inventory[id]={qty:entry.qty,firstAt:Number(entry.firstAt)||0,lastAt:Number(entry.lastAt)||0};total+=entry.qty;
 }
 if(!Number.isSafeInteger(input.packs)||input.packs<0||!Number.isSafeInteger(input.packs*11)||total+out.economy.soldCards!==input.packs*11)throw new Error('Save totals do not match');
 out.packs=input.packs;
 const ownedHolos=Object.entries(out.inventory).reduce((sum,[id,entry])=>sum+(CARD_MAP.get(Number(id)).rarity==='holo'?entry.qty:0),0);
 out.holoPulls=input.holoPulls??ownedHolos;
 if(!Number.isSafeInteger(out.holoPulls)||out.holoPulls<ownedHolos||out.holoPulls>out.packs)throw new Error('Invalid holo total');
 out.history=Array.isArray(input.history)?input.history.filter(p=>p&&Number.isInteger(p.number)&&p.number>0&&p.number<=out.packs&&Array.isArray(p.cards)&&p.cards.length===11&&p.cards.every(validCardId)).slice(0,200).map(p=>({number:p.number,paidCents:input.version===3?paidPrice(p):null,cards:p.cards,art:PACK_ART[p.art]?p.art:'charizard',at:Number(p.at)||0})):[];
 out.favorites=Array.isArray(input.favorites)?[...new Set(input.favorites.filter(id=>Number.isInteger(id)&&CARD_MAP.has(id)))]:[];
 if(input.settings){out.settings.mode='flip';out.settings.art=PACK_ART[input.settings.art]?input.settings.art:'charizard';out.settings.sound=input.settings.sound===true;out.settings.layout=input.settings.layout==='album'?'album':'grid';}
 const p=input.lastPack;
 if(p&&Number.isInteger(p.number)&&p.number===out.packs&&Array.isArray(p.cards)&&p.cards.length===11&&p.cards.every(validCardId)){
  out.lastPack={number:p.number,paidCents:input.version===3?paidPrice(p):null,cards:p.cards,art:PACK_ART[p.art]?p.art:'charizard',at:Number(p.at)||0,revealed:Math.max(0,Math.min(11,Math.floor(Number(p.revealed)||0))),newIndices:Array.isArray(p.newIndices)?[...new Set(p.newIndices.filter(i=>Number.isInteger(i)&&i>=0&&i<11))]:[],celebrated:p.celebrated===true,milestone:typeof p.milestone==='string'?p.milestone.slice(0,120):''};
 }
 if(out.lastPack){const reserved={};for(const id of out.lastPack.cards.slice(out.lastPack.revealed))reserved[id]=(reserved[id]||0)+1;for(const [id,qty] of Object.entries(reserved))if((out.inventory[id]?.qty||0)<qty)throw new Error('Invalid unrevealed inventory');}
 out.updatedAt=Number(input.updatedAt)||Date.now();return out;
}
function readState(){
 try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw)return validatedState(JSON.parse(raw));
  const legacy=localStorage.getItem(LEGACY_STORAGE_KEY);
  if(legacy){const migrated=validatedState(JSON.parse(legacy));try{localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));}catch{storageAvailable=false;}return migrated;}
  localStorage.setItem(`${STORAGE_KEY}.test`,'1');localStorage.removeItem(`${STORAGE_KEY}.test`);
 }catch(error){
  if(error instanceof SyntaxError||String(error.message).includes('Invalid')||String(error.message).includes('totals'))storageCorrupt=true;
  else storageAvailable=false;
 }
 return emptyState();
}
function saveState(economic=false){
 // A reveal or setting change must not overwrite a sale/reward from another tab.
 if(!economic&&storageAvailable){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const latest=validatedState(JSON.parse(raw));if(latest.updatedAt>state.updatedAt){
  const localPack=state.lastPack;state.economy=latest.economy;state.inventory=latest.inventory;state.packs=latest.packs;state.history=latest.history;state.holoPulls=latest.holoPulls;
  if(localPack?.number===latest.lastPack?.number){state.lastPack={...localPack,revealed:Math.max(localPack.revealed,latest.lastPack.revealed)};}else state.lastPack=latest.lastPack;
  state.updatedAt=latest.updatedAt;
 }}}catch{}}
 state.updatedAt=Math.max(Date.now(),state.updatedAt+1);
 if(storageAvailable){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageAvailable=false;setStorageLabels();toast('Browser storage is unavailable. Progress now lasts for this session only.');}}
}
function setStorageLabels(){const text=storageAvailable?'Saved in this browser only.':'Session only — browser storage is unavailable.';$$('[data-storage-label]').forEach(el=>el.textContent=text);}
// Saved inventory is durable from the first click. Presentation only counts
// cards already revealed, including after a refresh or when changing tabs.
function displayInventory(){
 const inventory=Object.fromEntries(Object.entries(state.inventory).map(([id,entry])=>[id,{...entry}]));
 const pack=state.lastPack;
 if(pack)pack.cards.slice(pack.revealed).forEach(id=>{if(inventory[id]&&--inventory[id].qty===0)delete inventory[id];});
 return inventory;
}
function totals(inventory=state.inventory){const entries=Object.entries(inventory);const total=entries.reduce((n,[,entry])=>n+entry.qty,0);const holos=entries.reduce((n,[id,entry])=>n+(CARD_MAP.get(Number(id)).rarity==='holo'?entry.qty:0),0);return {total,holos,unique:entries.length,packs:state.packs,complete:(entries.length/101*100).toFixed(1).replace(/\.0$/,''),rate:state.packs?`${((state.holoPulls-(state.lastPack&&state.lastPack.revealed<11&&CARD_MAP.get(state.lastPack.cards[10]).rarity==='holo'?1:0))/state.packs*100).toFixed(1)}%`:'—'};}
function updateStats(){
 const t=totals(displayInventory());for(const [key,value] of Object.entries(t))$$(`[data-stat="${key}"]`).forEach(el=>el.textContent=typeof value==='number'?number(value):value);
 $('#progressFill').style.width=`${t.unique/101*100}%`;$('#collectionProgress').setAttribute('aria-valuenow',t.unique);
 $('#collectorRank').textContent=t.unique===101?'Base Set completist':t.unique>=75?'Dedicated collector':t.unique>=40?'Growing the binder':t.packs>0?'The collection begins':'A fresh start';
 renderRecent();if(activeTab==='collection')renderCollection();if(activeTab==='stats')renderStatistics();setStorageLabels();renderEconomy();
}
function renderRecent(){
 const entries=[];
 for(const pack of state.history){const count=pack.number===state.lastPack?.number?state.lastPack.revealed:11;for(let i=count-1;i>=0&&entries.length<5;i--)entries.push({id:pack.cards[i],pack:pack.number});if(entries.length>=5)break;}
 $('#recentPulls').innerHTML=entries.length?entries.map(({id,pack})=>`<button class="recent-pull" data-card="${id}" aria-label="Inspect ${escapeHtml(CARD_MAP.get(id).name)} from pack ${pack}">${cardImage(id,{lazy:false})}<span><b>${escapeHtml(CARD_MAP.get(id).name)}</b><small>PACK ${String(pack).padStart(3,'0')} · ${RARITY[CARD_MAP.get(id).rarity]}</small></span></button>`).join(''):`<span class="recent-empty">${icon('cards')}<span>A blank page. Your first discovery is one pack away.</span></span>`;
}
function randomInt(max){
 if(!Number.isSafeInteger(max)||max<1||max>4294967296)throw new RangeError('Invalid random range');
 if(globalThis.crypto?.getRandomValues){const buffer=new Uint32Array(1);const limit=Math.floor(4294967296/max)*max;do{crypto.getRandomValues(buffer);}while(buffer[0]>=limit);return buffer[0]%max;}
 return Math.floor(Math.random()*max);
}
function sample(pool,count){const values=[...pool];for(let i=0;i<count;i++){const j=i+randomInt(values.length-i);[values[i],values[j]]=[values[j],values[i]];}return values.slice(0,count);}
function rareCard(){const pool=randomInt(3)===0?POOLS.holo:POOLS.rare;return pool[randomInt(pool.length)];}
function generatePack(){return [...sample(POOLS.common,5),...sample(POOLS.uncommon,3),POOLS.energy[randomInt(POOLS.energy.length)],POOLS.energy[randomInt(POOLS.energy.length)],rareCard()];}
function createAndSavePack(){
 const cost=packCost();
 if(pendingPack()||cost===null||state.economy.balance<cost)return null;
 const cards=generatePack();const at=Date.now(),newIndices=[];
 state.economy.balance-=cost;state.economy.spent+=cost;
 cards.forEach((id,index)=>{if(!state.inventory[id]){state.inventory[id]={qty:0,firstAt:at,lastAt:at};newIndices.push(index);}state.inventory[id].qty++;state.inventory[id].lastAt=at;});
 state.packs++;if(CARD_MAP.get(cards[10]).rarity==='holo')state.holoPulls++;const pack={number:state.packs,paidCents:cost,cards,art:state.settings.art,at,revealed:0,newIndices};state.lastPack=pack;
 state.history.unshift({number:pack.number,paidCents:cost,cards:[...cards],art:pack.art,at});state.history=state.history.slice(0,200);
 saveState(true);updateStats();return pack;
}
function packQuote(){return priceBook?priceBook.getPack():PackLabPricing.packQuote(globalThis.PACK_LAB_PRICE_SNAPSHOT?.pack);}
function packCost(){return packQuote().cents;}
function cardQuote(id){return priceBook?priceBook.get(CARD_MAP.get(id)):PackLabPricing.quote(CARD_MAP.get(id));}
function priceLabel(id){const q=cardQuote(id);return `<span class="card-price">${money(q.cents)} <small>${q.unavailable?'':q.stale?'USD · cached':'USD'}</small></span>`;}
function renderEconomy(){
 $$('[data-balance]').forEach(el=>el.textContent=money(state.economy.balance));
 $$('[data-pack-cost]').forEach(el=>el.textContent=money(packCost()));
 const value=Object.entries(displayInventory()).reduce((sum,[id,entry])=>sum+cardQuote(Number(id)).cents*entry.qty,0);
 $$('[data-collection-value]').forEach(el=>el.textContent=money(value));
 const pack=packQuote();
 $$('[data-pack-price-source]').forEach(el=>el.textContent=pack.unavailable?'Pack price unavailable':`TCGplayer · Revised Unlimited · ${new Date(pack.updated).toLocaleDateString('en-GB')}${pack.stale?' · cached':''}`);
 const count=Object.keys(priceBook?.quotes||{}).length;
 $$('[data-price-status]').forEach(el=>el.textContent=priceBook?.refreshing?'Updating card prices…':`${count} / 102 card prices available · TCGplayer · USD${priceRefreshFailed?' · using cached quotes':''}`);
 $$('[data-action="refresh-prices"]').forEach(el=>el.disabled=Boolean(priceBook?.refreshing));
 const duplicates=saleSelection('duplicates');const total=duplicates.reduce((sum,item)=>sum+item.qty*item.cents,0);
 $$('[data-action="sell-duplicates"]').forEach(el=>{el.disabled=!duplicates.length||busy||economyBusy;el.textContent=`Sell duplicates · ${money(total)}`;});
}
function saleSelection(mode,id){
 return Object.entries(displayInventory()).flatMap(([key,entry])=>{
  const cardId=Number(key),qty=mode==='duplicates'?(state.favorites.includes(cardId)?0:Math.max(0,entry.qty-1)):cardId===id?1:0;
  const quote=cardQuote(cardId);return qty&&!quote.unavailable?[{id:cardId,qty,cents:quote.cents}]:[];
 });
}
function applySale(items){
 const inventory=displayInventory();
 if(!items.length||new Set(items.map(item=>item.id)).size!==items.length||items.some(item=>!validCardId(item.id)||!Number.isSafeInteger(item.qty)||item.qty<1||!Number.isSafeInteger(item.cents)||item.cents<1||(inventory[item.id]?.qty||0)<item.qty))return 0;
 const amount=items.reduce((sum,item)=>sum+item.qty*item.cents,0);
 if(!Number.isSafeInteger(amount)||state.economy.balance+amount>1e12||state.economy.sales+amount>1e12)return 0;
 for(const item of items){state.inventory[item.id].qty-=item.qty;if(!state.inventory[item.id].qty)delete state.inventory[item.id];state.economy.soldCards+=item.qty;}
 state.economy.balance+=amount;state.economy.sales+=amount;return amount;
}
function reloadSavedState(){
 try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const latest=validatedState(JSON.parse(raw));if(latest.updatedAt>=state.updatedAt)state=latest;}}catch{}
}
async function economyTransaction(operation){
 if(busy||economyBusy)return null;economyBusy=true;
 const commit=()=>{reloadSavedState();const result=operation();saveState(true);return result;};
 try{return navigator.locks?.request?await navigator.locks.request(STORAGE_KEY,commit):commit();}
 catch{toast('The balance could not be updated. Please try again.');return null;}
 finally{economyBusy=false;updateStats();syncControls();}
}
async function sellCards(mode,id){
 if(busy||economyBusy)return;
 const selected=saleSelection(mode,id);
 const amount=await economyTransaction(()=>{
  const current=displayInventory();
  return applySale(selected.map(item=>({...item,qty:Math.min(item.qty,mode==='duplicates'?(state.favorites.includes(item.id)?0:Math.max(0,(current[item.id]?.qty||0)-1)):(current[item.id]?.qty||0))})).filter(item=>item.qty>0));
 });
 if(amount){toast(`Sold for ${money(amount)}. Ready to spend on your next pack.`);if($('#cardDialog').open)openCard(inspectedCardId);if(activeTab==='library')renderLibrary();}
}
async function resetBalance(){
 const reset=await economyTransaction(()=>{state.economy.balance=START_BALANCE;return true;});
 if(reset)toast('Balance reset to $10,000.00. Your cards and quiz progress are kept.');
}
function grantQuizCorrect(){
 if(state.economy.quizCorrect>=1e12||state.economy.balance>1e12-QUIZ_REWARD||state.economy.quizEarned>1e12-QUIZ_REWARD)return 0;
 state.economy.quizCorrect++;
 if(state.economy.quizCorrect%QUIZ_TARGET!==0)return 0;
 state.economy.balance+=QUIZ_REWARD;state.economy.quizEarned+=QUIZ_REWARD;return QUIZ_REWARD;
}
function refreshPriceViews(result){
 if(result)priceRefreshFailed=result.failures>0;
 renderEconomy();renderHighlights();if(activeTab==='collection')renderCollection();if(activeTab==='library')renderLibrary();
 if($('#cardDialog').open)openCard(inspectedCardId);
 if(!busy&&activeTab==='opener')renderOpener();
}
function packUrl(art){return `assets/packs/${art}-original.webp`;}
function imageCandidates(id,large=false){
 const urls=[`https://images.pokemontcg.io/base1/${id}${large?'_hires':''}.png`,`https://assets.tcgdex.net/en/base/base1/${id}/${large?'high':'low'}.webp`,`https://images.pokemontcg.io/base1/${id}${large?'':'_hires'}.png`];
 return ASSET_MODE==='local'?[`assets/cards/${id}.png`,...urls]:urls;
}
function cardImage(id,{large=false,lazy=true,className=''}={}){const card=CARD_MAP.get(id);return `<img src="${resolvedImages.get(`${id}:${large}`)||imageCandidates(id,large)[0]}" data-img-kind="card" data-img-id="${id}" data-img-large="${large?'1':'0'}" data-img-attempt="0" alt="${escapeHtml(card.name)} · Base Set ${id}/102" width="600" height="825" ${lazy?'loading="lazy"':''} decoding="async" class="${className}" referrerpolicy="no-referrer">`;}
function packImage(art){return `<img src="${packUrl(art)}" data-img-kind="pack" data-img-art="${art}" data-img-attempt="0" alt="Original English Base Set booster wrapper: ${PACK_ART[art].name}" width="535" height="535" decoding="async" referrerpolicy="no-referrer">`;}
function cardBack(){return `<img src="${ASSET_MODE==='local'?'assets/card-back.jpg':CARD_BACK}" data-img-kind="back" data-img-attempt="0" alt="Pokémon card back. Ready to reveal." width="660" height="921" decoding="async" referrerpolicy="no-referrer">`;}
document.addEventListener('load',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.imgKind==='card')resolvedImages.set(`${img.dataset.imgId}:${img.dataset.imgLarge==='1'}`,img.currentSrc||img.src);},true);
// Finite fallbacks: a failed image never creates an infinite retry loop.
document.addEventListener('error',event=>{
 const img=event.target;if(!(img instanceof HTMLImageElement)||!img.dataset.imgKind)return;
 const kind=img.dataset.imgKind;let attempt=Number(img.dataset.imgAttempt||0)+1,sources=[];
 if(kind==='card')sources=imageCandidates(Number(img.dataset.imgId),img.dataset.imgLarge==='1');
 if(kind==='pack')sources=[packUrl(img.dataset.imgArt),PACK_ART[img.dataset.imgArt].url];
 if(kind==='back')sources=ASSET_MODE==='local'?['assets/card-back.jpg',CARD_BACK]:[CARD_BACK];
 if(attempt<sources.length){if(sources[attempt]===img.src)attempt++;if(attempt<sources.length){img.dataset.imgAttempt=String(attempt);img.src=sources[attempt];return;}}
 const fallback=document.createElement('span');fallback.className='failed-image';fallback.setAttribute('role','img');fallback.setAttribute('aria-label',img.alt);fallback.textContent=kind==='pack'?`Base Set · ${PACK_ART[img.dataset.imgArt].name}\nPack image unavailable`:kind==='back'?'Card back · tap to reveal':`${CARD_MAP.get(Number(img.dataset.imgId)).name}\nReference image unavailable`;
 fallback.style.cssText='width:100%;height:100%;min-height:35px;white-space:pre-line;aspect-ratio:600/825;border-radius:5px;';
 img.replaceWith(fallback);$('#assetWarning').hidden=false;
},true);

// A pack is committed before any animation. Visual effects never draw new cards.
function pendingPack(){return Boolean(state.lastPack && state.lastPack.revealed < 11);}
function mainAction(){
 if(busy)return;
 if(phase==='final'){finishPack({animated:true});return;}
 if(pendingPack())revealNext();else openPack(false);
}
function secondaryAction(){
 if(busy){if(phase==='reel'&&reelAnimation){try{reelAnimation.finish();}catch{}}return;}
 if(phase==='final'){openCard(state.lastPack.cards[10]);return;}
 if(pendingPack())revealAll();else openPack(true);
}
function setButtons(main,second,{loading=false,canSkip=false}={}){
 $('#mainAction').innerHTML=`${icon(loading?'clock':phase==='final'?'grid':pendingPack()?'cards':'pack')}<span>${main}</span>${loading?'':icon('arrow')}`;
 $('#secondaryAction').innerHTML=`${icon(canSkip?'arrow':phase==='final'?'search':'bolt')}<span>${second}</span>`;
 $('#mainAction').disabled=loading;$('#secondaryAction').disabled=loading&&!canSkip;
 $('#stage').setAttribute('aria-busy',String(loading));
 $$('[data-mode]').forEach(button=>{button.disabled=loading;button.setAttribute('aria-pressed',String(button.dataset.mode===state.settings.mode));});
}
function syncControls(){
 if(busy){const isReel=phase==='reel';setButtons(phase==='reveal'?'Revealing…':phase==='complete'?'Laying out your cards…':isReel?'Revealing your rare…':'Opening your pack…',isReel?'Skip animation':'Please wait',{loading:true,canSkip:isReel});return;}
 if(phase==='final'){
  setButtons('Put them in the binder','Inspect rare');
  $('#controlNote').innerHTML='One pack. Eleven little pieces of 1999.';
 }else if(pendingPack()){
  const next=state.lastPack.revealed+1;
  setButtons(next===11?'Reveal the rare card':`Reveal card ${next} / 11`,'Reveal all');
  $('#controlNote').innerHTML='Tap, swipe or press <span class="keycap">SPACE</span> to turn the next card.';
 }else{
  const cost=packCost();
  setButtons(`Buy pack · ${money(cost)}`,`Quick buy · ${money(cost)}`);
  $('#mainAction').disabled=$('#secondaryAction').disabled=cost===null||state.economy.balance<cost||economyBusy;
  $('#controlNote').innerHTML=cost===null?'Pack price unavailable. Refresh prices to try again.':state.economy.balance<cost?'Not enough balance. Sell cards, play the quiz or reset your balance.':'11 cards per pack. Sell your pulls or keep your favourites.';
 }
}
function artPicker(){return `<div class="art-picker" role="group" aria-label="Choose pack artwork">${Object.entries(PACK_ART).map(([key,art],i)=>`<button type="button" data-art="${key}" aria-pressed="${key===state.settings.art}"><span class="art-mini" aria-hidden="true">${packImage(key)}</span>${art.name}<span class="art-index">0${i+1}</span></button>`).join('')}</div>`;}
function renderIdle(){
 const selected=state.settings.art,others=Object.keys(PACK_ART).filter(key=>key!==selected);
 $('#stage').dataset.view='idle';
 $('#stageContent').innerHTML=`<div class="idle-content"><div class="stage-edition"><span>ORIGINAL SERIES</span><b>BASE SET / 1999</b></div><span class="stage-number">001—</span><span class="stage-watermark" aria-hidden="true">1999</span><span class="stage-side">ELEVEN CARDS. ENDLESS POSSIBILITY.</span><span class="stage-side right">HANDLE WITH NOSTALGIA</span><div class="pack-fan"><div class="pack-photo back-left" aria-hidden="true"><span class="pack-cutout">${packImage(others[0])}</span></div><div class="pack-photo back-right" aria-hidden="true"><span class="pack-cutout">${packImage(others[1])}</span></div><button type="button" class="pack-photo front" data-action="open" aria-label="Buy a ${PACK_ART[selected].name} Base Set pack for ${money(packCost())} USD"><span class="pack-escape" aria-hidden="true">${cardBack()}</span><span class="pack-cutout pack-body">${packImage(selected)}</span><span class="pack-cutout pack-top-piece" aria-hidden="true">${packImage(selected)}</span><span class="tear-seam" aria-hidden="true"></span></button><div class="pack-floor" aria-hidden="true"></div></div><span class="tear-hint">${icon('arrow')} Drag the foil, or tap to open</span>${artPicker()}</div>`;
 phase='idle';syncControls();
}
function revealRail(pack,placed=Math.max(0,pack.revealed-1)){
 // The newest revealed card is still on the stack until its flight has landed.
 return `<div class="reveal-tray"><div class="tray-heading"><span>YOUR PACK SO FAR</span><span class="mono">${placed} <span class="muted">/ 11</span></span></div><div class="pull-rail" aria-label="Cards placed from this pack">${pack.cards.map((id,i)=>{
  const shown=i<placed,card=CARD_MAP.get(id);
  return shown?`<button class="pull-slot is-shown ${i===10?'is-rare':''}" data-slot="${i}" data-card="${id}" aria-label="Inspect ${escapeHtml(card.name)}, card ${i+1} of 11"><span class="slot-image">${cardImage(id,{lazy:false})}</span><span class="slot-number">${String(i+1).padStart(2,'0')}</span></button>`:`<div class="pull-slot ${i===10?'is-rare':''}" data-slot="${i}" aria-label="Card ${i+1}, not yet in tray"><span class="slot-placeholder">${i===10?icon('star'):icon('cards')}</span><span class="slot-number">${String(i+1).padStart(2,'0')}</span></div>`;
 }).join('')}</div></div>`;
}
function renderReveal(){
 const pack=state.lastPack,r=pack.revealed,id=pack.cards[Math.max(0,r-1)],card=CARD_MAP.get(id),isHolo=r>0&&card.rarity==='holo';
 const faceId=r?id:pack.cards[0],remaining=11-r;
 $('#stage').dataset.view='reveal';
 const isNew=r&&pack.newIndices.includes(r-1),iconic=isHolo&&isNew&&[2,4,15].includes(id);
 const visibleQty=displayInventory()[id]?.qty||0;
 $('#stageContent').innerHTML=`<div class="reveal-scene ${isHolo?'holo-moment':''} ${iconic?'iconic-moment':''}"><div class="reveal-topline"><span class="eyebrow">PACK <span class="gold">Nº ${String(pack.number).padStart(3,'0')}</span></span><span class="reveal-step">${String(r).padStart(2,'0')} / 11</span></div><div class="reveal-board"><div class="table-caption" aria-hidden="true"><span>${iconic?'AN ORIGINAL ICON':'THE ORIGINAL'}</span><b>’99</b></div><div class="card-aura" aria-hidden="true"></div><div class="card-stack">${remaining?`<span class="stack-sheet stack-third" aria-hidden="true">${cardBack()}</span><span class="stack-sheet stack-second" aria-hidden="true">${cardBack()}</span>`:''}<button type="button" class="big-card tilt-surface ${isHolo?'is-holo':''}" data-action="reveal" aria-label="${r===11?'See all 11 cards':`Reveal card ${r+1} of 11`}"><span class="card-flipper ${r?'is-face-up':''}"><span class="card-face face-back" aria-hidden="true">${cardBack()}</span><span class="card-face face-front ${isHolo?'holo-shine':''}" aria-hidden="${r?'false':'true'}">${r?cardImage(faceId,{large:true,lazy:false}):''}</span></span></button></div><span class="stack-caption">${r===0?'YOUR FIRST CARD IS WAITING':r===11?(iconic?'SOME FINDS STAY WITH YOU.':'THE LAST CARD. TAKE IT IN.'):r===10?'ONE LAST LITTLE MYSTERY':`${remaining} ${remaining===1?'CARD':'CARDS'} TO GO`}</span></div><div class="reveal-description"><h2 class="reveal-name">${r?escapeHtml(card.name):'What’s waiting inside?'}${isNew?'<span class="new-badge">NEW</span>':''}</h2><p class="reveal-rarity">${r?`<span class="rarity-label ${card.rarity}">${RARITY[card.rarity]}</span><span class="detail-divider">/</span><span class="mono">${String(id).padStart(3,'0')} · 102</span>${!isNew?`<span class="duplicate-badge">×${visibleQty} in your binder</span>`:''}`:'Eleven possibilities. Turn the first card.'}</p></div>${revealRail(pack)}</div>`;
 if(remaining)warmCard(pack.cards[r],true);
}
function resultCard(card,index,{isNew=false,history=false}={}){
 const rare=index===10,holo=card.rarity==='holo';
 return `<button type="button" class="pack-card ${rare?'is-rare':''} ${holo?'is-holo':''}" data-card="${card.id}" data-pack-index="${index}" aria-label="${index+1} of 11: ${escapeHtml(card.name)}, ${RARITY[card.rarity]}${isNew?', new to your collection':''}"><span class="pack-card-top"><span class="mono">${String(index+1).padStart(2,'0')}</span><span class="pack-card-label">${rare?'★ RARE SLOT':isNew?'NEW':'BASE SET'}</span></span><span class="pack-card-media tilt-surface"><span class="card-flipper is-face-up"><span class="card-face face-back" aria-hidden="true">${cardBack()}</span><span class="card-face face-front ${holo?'holo-shine':''}">${cardImage(card.id,{lazy:history})}</span></span></span><span class="pack-card-name">${escapeHtml(card.name)}</span>${priceLabel(card.id)}<span class="pack-card-meta"><span>${RARITY[card.rarity]}</span><span class="mono">${card.id}/102</span></span>${rare&&isNew?'<span class="rare-new">NEW DISCOVERY</span>':''}</button>`;
}
function renderResult(){
 const pack=state.lastPack,rare=CARD_MAP.get(pack.cards[10]),holo=rare.rarity==='holo';
 $('#stage').dataset.view='result';
 const packValue=pack.cards.reduce((sum,id)=>sum+cardQuote(id).cents,0);
 $('#stageContent').innerHTML=`<div class="result-scene"><div class="result-heading"><div><div class="eyebrow gold">PACK Nº ${String(pack.number).padStart(3,'0')} / THE COMPLETE PICTURE</div><h2>${holo?'That’s the feeling.':'A new page in your story.'}</h2><p>${pack.newIndices.length} new ${pack.newIndices.length===1?'discovery':'discoveries'}<span class="summary-dot">·</span>${11-pack.newIndices.length} ${11-pack.newIndices.length===1?'extra copy':'extra copies'}</p></div></div><div class="result-rare-note ${holo?'holo':''}">${icon('star')}<span>The find: <strong>${escapeHtml(rare.name)}</strong></span><span class="rare-note-label">${RARITY[rare.rarity]}</span></div><div class="pack-grid" aria-label="All 11 cards from your pack">${pack.cards.map((id,i)=>resultCard(CARD_MAP.get(id),i,{isNew:pack.newIndices.includes(i)})).join('')}</div><div class="result-receipt"><span>PACK REFERENCE VALUE</span><strong>${money(packValue)}</strong><span>USD · ${pack.paidCents===null||pack.paidCents===undefined?'earlier save':`paid ${money(pack.paidCents)}`}</span></div>${pack.newIndices.length?`<div class="binder-receipt" aria-label="New cards filed in your collection">${pack.newIndices.map((i,n)=>`<span class="binder-slot" style="--i:${n}">${cardImage(pack.cards[i],{lazy:false})}</span>`).join('')}<small>Filed. A little more complete.</small></div>`:''}${pack.milestone?`<div class="milestone">${icon('trophy')}<div><span>A MOMENT FOR THE JOURNAL</span><b>${escapeHtml(pack.milestone)}</b></div></div>`:''}<div class="result-bottom"><span>${icon('save')} This opening is saved in your journal.</span><button type="button" class="text-button" data-action="choose-pack">Change wrapper ${icon('arrow')}</button></div></div>`;
}
function renderOpener(){
 if(!state.lastPack||showIdleOverride)renderIdle();
 else if(pendingPack()){phase='ready';renderReveal();syncControls();}
 else{phase='complete';renderResult();syncControls();}
}
async function animateElement(el,frames,options={}){
 if(!el||reducedMotion()||typeof el.animate!=='function')return;
 const animation=el.animate(frames,{duration:420,easing:'cubic-bezier(.2,.75,.2,1)',...options});
 try{await animation.finished;}catch{}finally{animation.cancel();}
}
function warmCard(id,large=false){
 const url=imageCandidates(id,large)[0];if(warmedImages.has(url))return;
 warmedImages.add(url);const img=new Image();img.decoding='async';img.referrerPolicy='no-referrer';img.src=url;
}
async function prepareCardImage(id){
 const candidates=imageCandidates(id,true);
 if(resolvedImages.has(`${id}:true`))return;
 await Promise.race([new Promise(resolve=>{
  let i=0;const img=new Image();img.referrerPolicy='no-referrer';
  img.onload=()=>{resolvedImages.set(`${id}:true`,img.src);resolve();};
  img.onerror=()=>{if(++i<candidates.length)img.src=candidates[i];else resolve();};
  img.src=candidates[0];
 }),sleep(1600)]);
}
function bringStageIntoView(){
 const bounds=$('#stage').getBoundingClientRect();
 const inset=window.matchMedia('(max-width:700px)').matches?72:18;
 if(bounds.top<inset||bounds.top>innerHeight-100)$('#stage').scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});
}
async function openPack(quick=false){
 if(busy||economyBusy||pendingPack())return;
 if(externalStatePending){refreshExternalState();if(pendingPack())return;}
 busy=true;phase='opening';showIdleOverride=false;syncControls();
 const commit=()=>{
  // Serialize openings where supported, so two tabs do not overwrite each other.
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const latest=validatedState(JSON.parse(raw));if(latest.updatedAt>=state.updatedAt)state=latest;}}catch{}
  if(pendingPack())return null;
  return createAndSavePack();
 };
 let pack;
 try{pack=navigator.locks?.request?await navigator.locks.request(STORAGE_KEY,commit):commit();}
 catch{busy=false;phase='ready';renderOpener();toast('The pack could not be opened. Please try again.');return;}
 if(!pack){busy=false;renderOpener();updateStats();toast(pendingPack()?'Resuming the pack already opened in another tab.':packCost()===null?'Pack price unavailable. Refresh prices to try again.':'Not enough balance. Sell cards, earn quiz rewards or reset your balance.');return;}
 pack.cards.forEach(id=>warmCard(id));warmCard(pack.cards[0],true);
 if(quick||reducedMotion()){await finishPack({animated:!reducedMotion()});bringStageIntoView();return;}
 renderIdle();busy=true;phase='opening';syncControls();bringStageIntoView();
 const content=$('#stageContent');content.classList.add('is-tearing');sound('tear');
 await sleep(950);content.classList.remove('is-tearing');
 renderReveal();
 await animateElement($('.card-stack'),[{transform:'translateY(45px) rotate(-7deg) scale(.88)',opacity:0},{transform:'translateY(-7px) rotate(1deg) scale(1.02)',opacity:1,offset:.74},{transform:'none',opacity:1}],{duration:360});
 busy=false;phase='ready';syncControls();announce(`Pack ${pack.number} is ready. Reveal your first card.`);
}
async function moveCurrentCardToTray(){
 const current=$('.big-card'),pack=state.lastPack;
 if(!current||!pack||pack.revealed===0)return;
 const target=$(`[data-slot="${pack.revealed-1}"] .slot-placeholder`);
 if(target&&!reducedMotion()&&activeTab==='opener'){
  const a=current.getBoundingClientRect(),b=target.getBoundingClientRect();
  if(a.width&&b.width){
   const ghost=current.cloneNode(true);ghost.removeAttribute('data-action');ghost.removeAttribute('aria-label');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.className='flying-card';
   ghost.style.cssText=`left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;`;
   document.body.append(ghost);current.style.opacity='0';
   try{await animateElement(ghost,[{transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},{transform:`translate(${-a.width*.34}px,${-a.height*.08}px) rotate(-14deg) scale(.93)`,opacity:1,offset:.3},{transform:`translate(${b.left-a.left}px,${b.top-a.top}px) rotate(0deg) scale(${b.width/a.width})`,opacity:1}],{duration:300,fill:'forwards'});}
   finally{ghost.remove();current.style.opacity='';}
  }
 }
 const tray=$('.reveal-tray');if(tray)tray.outerHTML=revealRail(pack,pack.revealed);
}
async function revealNext(){
 if(busy)return;
 if(phase==='final'){finishPack({animated:true});return;}
 if(!pendingPack())return;
 busy=true;phase='reveal';syncControls();
 const focusCard=document.activeElement?.classList.contains('big-card');
 const previous=state.lastPack.revealed;
 try{
  if(previous===10&&!reducedMotion()){$('.reveal-scene')?.classList.add('rare-anticipation');await sleep(350);}
  await prepareCardImage(state.lastPack.cards[previous]);
  await moveCurrentCardToTray();
  state.lastPack.revealed=previous+1;saveState();renderReveal();syncControls();
  const r=state.lastPack.revealed,card=CARD_MAP.get(state.lastPack.cards[r-1]);
  const front=$('.big-card'),flipper=$('.big-card .card-flipper');
  sound(card.rarity==='holo'?'holo':'flip');
  await Promise.all([
   animateElement(front,[{transform:'translate(26px,12px) rotate(5deg) scale(.94)'},{transform:'translate(0,-12px) rotate(-2deg) scale(1.035)',offset:.64},{transform:'translate(0,0) rotate(0deg) scale(1)'}],{duration:card.rarity==='holo'?680:510}),
   animateElement(flipper,[{transform:'rotateY(180deg)'},{transform:'rotateY(180deg)',offset:.12},{transform:'rotateY(-9deg)',offset:.82},{transform:'rotateY(0deg)'}],{duration:card.rarity==='holo'?680:510,easing:'cubic-bezier(.3,.6,.22,1)'}),
   animateElement($('.reveal-description'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:250,delay:reducedMotion()?0:270})
  ]);
  if(card.rarity==='holo')sparkles($('.reveal-scene'),$('.big-card'));
  updateStats();
  const slot=$(`[data-slot="${r-1}"]`),rail=$('.pull-rail');
  if(slot&&rail&&rail.scrollWidth>rail.clientWidth)rail.scrollTo({left:Math.max(0,slot.offsetLeft-rail.offsetLeft-rail.clientWidth/2+slot.clientWidth/2),behavior:reducedMotion()?'auto':'smooth'});
  announce(`Card ${r} of 11: ${card.name}, ${RARITY[card.rarity]}.${r===11?' View all 11 cards when you are ready.':''}`);
  if(focusCard)front?.focus({preventScroll:true});
 }finally{busy=false;phase=state.lastPack.revealed===11?'final':'ready';syncControls();}
}
function revealAll(){if(busy||!pendingPack())return;finishPack({animated:true});}
async function finishPack({animated=false}={}){
 if(!state.lastPack)return;
 if(phase==='final'){busy=true;phase='complete';syncControls();await moveCurrentCardToTray();}
 const firstCompletion=!state.lastPack.celebrated;
 if(firstCompletion){state.lastPack.milestone=packMilestone(state.lastPack);state.lastPack.celebrated=true;}
 state.lastPack.revealed=11;saveState();phase='complete';busy=animated&&!reducedMotion();reelAnimation=null;
 renderResult();syncControls();updateStats();
 const card=CARD_MAP.get(state.lastPack.cards[10]);
 if(animated&&!reducedMotion()){
  const cells=$$('.pack-grid .pack-card',$('#stageContent'));
  try{await Promise.all(cells.map((cell,i)=>{
   const delay=i*48;
   return Promise.all([
    animateElement(cell,[{opacity:0,transform:`translateY(48px) rotate(${i%2?5:-5}deg) scale(.85)`},{opacity:1,transform:'translateY(-4px) rotate(0deg) scale(1.015)',offset:.82},{opacity:1,transform:'none'}],{duration:470,delay,fill:'backwards'}),
    animateElement($('.card-flipper',cell),[{transform:'rotateY(180deg)'},{transform:'rotateY(0deg)'}],{duration:480,delay:delay+55,fill:'backwards'})
   ]);
  }));}finally{busy=false;syncControls();}
 }
 busy=false;syncControls();
 if(firstCompletion&&!reducedMotion())$('.binder-receipt')?.classList.add('binder-arriving');
 if(card.rarity==='holo'){sound('holo');sparkles($('.result-scene'),$('.pack-card.is-rare'));}else sound('done');
 announce(`Pack complete. Your rare is ${card.name}. ${state.lastPack.newIndices.length} new cards discovered. All 11 cards are saved.`);
}
function packMilestone(pack){
 const before=Object.fromEntries(Object.entries(state.inventory).map(([id,e])=>[id,e.qty]));
 pack.cards.forEach(id=>{if(--before[id]===0)delete before[id];});
 const after=state.inventory,had=ids=>ids.every(id=>before[id]),has=ids=>ids.every(id=>after[id]);
 if(has([2,4,15])&&!had([2,4,15]))return 'The original trio. Together at last.';
 const previousHolos=Object.keys(before).some(id=>CARD_MAP.get(Number(id)).rarity==='holo');
 if(!previousHolos&&pack.cards.some(id=>CARD_MAP.get(id).rarity==='holo'))return 'Your first holo. A keeper.';
 for(const [ids,name] of [[[46,24,4],'Charmander'],[[63,42,2],'Squirtle'],[[44,30,15],'Bulbasaur']])if(has(ids)&&!had(ids))return `The ${name} evolution. All three, collected.`;
 const count=Object.keys(after).length,oldCount=Object.keys(before).length;
 for(const n of [101,75,50,25])if(count>=n&&oldCount<n)return n===101?'The complete Base Set booster collection.':`${n} discoveries. A binder full of stories.`;
 return pack.number===1?'Your first pack. The story starts here.':'';
}
function sparkles(scene=$('.result-scene'),anchor=null){
 if(reducedMotion()||!scene)return;
 const area=scene.getBoundingClientRect(),target=(anchor||scene).getBoundingClientRect();
 const x=target.left-area.left+target.width/2,y=target.top-area.top+target.height*.43;
 for(let i=0;i<18;i++){
  const dot=document.createElement('i'),angle=i/18*Math.PI*2,radius=60+Math.random()*85;
  dot.className='spark';dot.setAttribute('aria-hidden','true');dot.style.left=`${x}px`;dot.style.top=`${y}px`;
  dot.style.setProperty('--sx',`${Math.cos(angle)*radius}px`);dot.style.setProperty('--sy',`${Math.sin(angle)*radius}px`);dot.style.animationDelay=`${Math.random()*80}ms`;
  scene.append(dot);setTimeout(()=>dot.remove(),1100);
 }
}

function sound(type){
 if(!state.settings.sound)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext ||= new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
 const base=audioContext.currentTime;
 if(type==='tear'||type==='flip'){
  const duration=type==='tear'?.42:.085,buffer=audioContext.createBuffer(1,Math.ceil(audioContext.sampleRate*duration),audioContext.sampleRate),channel=buffer.getChannelData(0);
  for(let i=0;i<channel.length;i++)channel[i]=(Math.random()*2-1)*(type==='tear'?.6+.4*Math.sin(i*.08):1);
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=type==='tear'?2600:1500;filter.Q.value=.8;
  gain.gain.setValueAtTime(.001,base);gain.gain.linearRampToValueAtTime(type==='tear'?.085:.04,base+.014);gain.gain.exponentialRampToValueAtTime(.001,base+duration);
  source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);source.start();source.stop(base+duration);return;
 }
 const notes=type==='holo'?[392,493.88,587.33,783.99]:[329.63,440];
 notes.forEach((frequency,i)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();const start=base+i*.095;oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.035,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+.6);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.65);});
 }catch{/* Audio is optional and never affects an opening. */}
}
function toggleSound(){state.settings.sound=!state.settings.sound;saveState();syncSound();if(state.settings.sound)sound('flip');toast(state.settings.sound?'Sound on.':'Sound off.');}
function syncSound(){$$('[data-action="sound"]').forEach(button=>{button.innerHTML=icon(state.settings.sound?'sound':'mute');button.setAttribute('aria-pressed',String(state.settings.sound));button.setAttribute('aria-label',state.settings.sound?'Mute sound':'Enable sound');});}
function announce(text){$('#liveStatus').textContent=text;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}

function cardTile(card,{collection=false,highlight=false}={}){
 const owned=displayInventory()[card.id]?.qty||0;
 if(highlight)return `<button class="highlight-card" data-card="${card.id}" aria-label="Inspect ${escapeHtml(card.name)}, Holo Rare, ${card.id} of 102"><span class="catalogue-top"><span>Nº ${String(card.id).padStart(3,'0')} / 102</span><span class="rarity-star">✳</span></span><div class="image-shell holo-shine">${cardImage(card.id)}</div><strong>${escapeHtml(card.name)}</strong>${priceLabel(card.id)}<div class="mini-meta"><span>${card.type.toUpperCase()} · HOLO RARE</span>${icon('arrow')}</div></button>`;
 const tile=`<button type="button" class="mini-card ${collection&&!owned?'unowned':''}" data-card="${card.id}" aria-label="Inspect ${escapeHtml(card.name)}, ${RARITY[card.rarity]}, ${card.id} of 102${collection?`, ${owned} collected`:''}">${card.rarity==='holo'?`<span class="holo-tag">${card.id===8?'STARTER ONLY':'HOLO RARE'}</span>`:''}${owned&&!highlight?`<span class="owned-label">×${number(owned)}</span>`:''}<div class="image-shell ${card.rarity==='holo'?'holo-shine':''}">${cardImage(card.id)}</div><strong>${escapeHtml(card.name)}</strong>${priceLabel(card.id)}<div class="mini-meta"><span>${String(card.id).padStart(3,'0')}/102</span><span>${highlight?'Holo Rare':collection?(owned?'Collected':'Not found'):RARITY[card.rarity]}</span></div></button>`;
 if(!collection)return tile;
 const quote=cardQuote(card.id);
 return `<div class="collection-card">${tile}${owned?`<button class="sell-card-button" data-sell-card="${card.id}" aria-label="Sell one ${escapeHtml(card.name)} for ${money(quote.cents)}" ${quote.unavailable||busy||economyBusy?'disabled':''}>Sell one · ${money(quote.cents)}</button>`:''}</div>`;
}
function renderHighlights(){$('#highlights').innerHTML=[4,2,15,10,16].map(id=>cardTile(CARD_MAP.get(id),{highlight:true})).join('');}
function matchCard(card,query){if(!query)return true;const q=normalized(query.trim()).replace(/^#/,'');if(/^\d+(\/102)?$/.test(q))return card.id===parseInt(q,10);return normalized(`${card.name} ${card.type} ${card.kind} ${card.id} ${RARITY[card.rarity]}`).includes(q);}
function sortCards(cards,sort){const inventory=displayInventory();return [...cards].sort((a,b)=>sort==='value'?cardQuote(b.id).cents-cardQuote(a.id).cents||a.id-b.id:sort==='name'?a.name.localeCompare(b.name):sort==='rarity'?RARITY_ORDER[a.rarity]-RARITY_ORDER[b.rarity]||a.id-b.id:sort==='quantity'?(inventory[b.id]?.qty||0)-(inventory[a.id]?.qty||0)||a.id-b.id:sort==='recent'?(inventory[b.id]?.lastAt||0)-(inventory[a.id]?.lastAt||0)||a.id-b.id:a.id-b.id);}
function renderLibrary(){const kind=$('#libraryKind').value,query=$('#librarySearch').value;let cards=CARDS.filter(c=>(libraryFilter==='all'||c.rarity===libraryFilter)&&(kind==='all'||c.kind===kind)&&matchCard(c,query));cards=sortCards(cards,$('#librarySort').value);$('#libraryCount').textContent=`Showing ${cards.length} of 102 cards.`;$('#libraryGrid').innerHTML=cards.length?cards.map(c=>cardTile(c)).join(''):'<div class="grid-message"><h3>No cards found.</h3><p>Try another name, number, type or rarity.</p><button type="button" class="secondary" data-action="clear-library">Clear filters</button></div>';}
function renderCollection(){
 const query=$('#collectionSearch').value,view=$('#collectionView').value;
 const inventory=displayInventory();
 let cards=CARDS.filter(c=>{const owned=Boolean(inventory[c.id]);return c.booster&&matchCard(c,query)&&(view==='all'||view==='owned'&&owned||view==='missing'&&!owned||view==='favorites'&&state.favorites.includes(c.id)||view==='holos'&&owned&&c.rarity==='holo');});
 cards=sortCards(cards,$('#collectionSort').value);$('#collectionCount').textContent=`Showing ${cards.length} cards${view==='missing'?' still to discover':''}.`;
 $('#collectionGrid').innerHTML=cards.length?cards.map(c=>cardTile(c,{collection:true})).join(''):`<div class="grid-message">${icon('cards')}<h3>${state.packs?'Nothing here just yet.':'Every collection starts with one pack.'}</h3><p>${state.packs?'Try another filter, favorite a card in the library, or open another pack.':'Your binder is empty. Buy a pack with your virtual balance to discover your first 11 cards.'}</p><button type="button" class="primary" data-tab="opener">Go to the pack opener ${icon('arrow')}</button></div>`;
 $('#collectionGrid').classList.toggle('album-view',state.settings.layout==='album');
 $$('[data-layout]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.layout===state.settings.layout)));
}
function renderStatistics(){
 const inventory=displayInventory(),t=totals(inventory),bigThree=[2,4,15].every(id=>Boolean(inventory[id]));
 const achievements=[['The first of many','Open your first pack',t.packs>=1,'pack'],['A little extra shine','Find your first Holo Rare',t.holos>=1,'star'],['The original trio','Discover Charizard, Blastoise and Venusaur',bigThree,'trophy'],['A well-loved binder','Discover 50 different booster cards',t.unique>=50,'cards']];
 $('#achievements').innerHTML=achievements.map(([title,description,earned,symbol])=>`<div class="achievement ${earned?'earned':''}"><span class="iconbox">${icon(symbol)}</span><div><b>${title}${earned?' ✓':''}</b><p>${description}</p></div></div>`).join('');
 if(!state.history.length){$('#historyTable').innerHTML='<div class="history-empty">Your first opening will appear here.</div>';return;}
 $('#historyTable').innerHTML=`<table class="history-table"><thead><tr><th scope="col">Pack</th><th scope="col">The find</th><th scope="col">Rarity</th><th scope="col" class="date-cell">Opened</th><th scope="col">Cards</th></tr></thead><tbody>${state.history.map(pack=>{const card=CARD_MAP.get(pack.cards[10]),sealed=pack.number===state.lastPack?.number&&pendingPack();return `<tr><td>#${number(pack.number)}</td><td>${sealed?'<span>Still a little mystery</span>':`<button type="button" class="history-card" data-card="${card.id}">${cardImage(card.id)}<span>${escapeHtml(card.name)}</span></button>`}</td><td class="${sealed?'':card.rarity}">${sealed?'Unrevealed':RARITY[card.rarity]}</td><td class="date-cell">${new Date(pack.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td><button type="button" class="text-button" ${sealed?'data-tab="opener"':`data-history="${pack.number}"`} aria-label="${sealed?'Resume opening':`Inspect all 11 cards from pack ${pack.number}`}">${sealed?'Resume':'View pack'} ${icon('arrow')}</button></td></tr>`;}).join('')}</tbody></table>`;
}
function switchTab(tab,{focus=false}={}){
 if(!Object.values(ROUTES).includes(tab))return;activeTab=tab;
 $$('[role="tab"]').forEach(button=>{const active=button.dataset.tab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
 $$('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!==`panel-${tab}`);
 if(tab==='library')renderLibrary();if(tab==='collection')renderCollection();if(tab==='stats')renderStatistics();
 if(tab==='quiz'){if(!quiz)nextQuiz();else renderQuiz();}if(tab==='memory'){if(!memory)newMemory();else renderMemory();}
 try{history.replaceState(null,'',Object.keys(ROUTES).find(key=>ROUTES[key]===tab));}catch{}
 setMobileMenu(focus&&$('#navBar').classList.contains('mobile-open'));$('#infoDropdown').hidden=true;$('#moreInfo').setAttribute('aria-expanded','false');
 $$('.main-nav [data-tab]').forEach(link=>{const selected=link.dataset.tab===tab;link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 if(focus)$(`#tab-${tab}`).focus();else window.scrollTo({top:0,behavior:'instant'});updateStats();
}
function setMobileMenu(open){
 $('#navBar').classList.toggle('mobile-open',open);$('#sidebarScrim').hidden=!open;
 $('#menuToggle').setAttribute('aria-expanded',String(open));$('#menuToggle').setAttribute('aria-label',open?'Close menu':'Open menu');
 const mobile=window.matchMedia('(max-width: 700px)').matches;
 $('#navBar').inert=mobile&&!open;$('#main').inert=mobile&&open;
 document.body.style.overflow=open&&mobile?'hidden':'';
}
function nextQuiz(){
 const previous=quiz?.answer.id;
 const answer=sample(POKEMON.filter(p=>p.id!==previous),1)[0];
 quiz={answer,options:sample([answer,...sample(POKEMON.filter(p=>p.id!==answer.id),3)],4),choice:null,correct:quiz?.correct||0,attempts:quiz?.attempts||0,streak:quiz?.streak||0};
 renderQuiz();
}
function renderQuiz(){
 const answered=quiz.choice!==null,correct=quiz.choice===quiz.answer.id;
 $('#quizGame').innerHTML=`<div class="game-scorebar"><span>Correct <b>${quiz.correct} / ${quiz.attempts}</b></span><span>Current streak <b>${quiz.streak}</b></span><button class="text-button" data-game-action="quiz-reset">Start fresh ${icon('arrow')}</button></div><div class="quiz-reward"><div><span>NEXT BALANCE BONUS</span><b>${state.economy.quizCorrect%QUIZ_TARGET} / ${QUIZ_TARGET} correct</b><small>+${money(QUIZ_REWARD)} · every 10 correct answers, no streak needed</small></div><progress max="${QUIZ_TARGET}" value="${state.economy.quizCorrect%QUIZ_TARGET}" aria-label="Correct answers toward next reward"></progress></div><div class="quiz-stage"><div class="quiz-image ${answered?'is-revealed':''}"><img src="assets/pokemon/${quiz.answer.id}.png" width="475" height="475" alt="${answered?escapeHtml(quiz.answer.name):'Mystery Pokémon silhouette'}"></div></div><div class="quiz-options" role="group" aria-label="Choose the Pokémon">${quiz.options.map(p=>`<button class="quiz-option ${answered?(p.id===quiz.answer.id?'is-correct':p.id===quiz.choice?'is-wrong':''):''}" data-quiz-choice="${p.id}" ${answered?'disabled':''}>${escapeHtml(p.name)}${answered&&p.id===quiz.answer.id?' ✓':''}</button>`).join('')}</div><div class="quiz-feedback" aria-live="polite">${answered?`<p><b>${correct?'You know your Pokémon!':`It’s ${escapeHtml(quiz.answer.name)}!`}</b><br>${correct?(quiz.reward?`Bonus earned! +${money(quiz.reward)}.`:'One step closer to your next balance bonus.'):'Every trainer learns something new. Your reward progress is kept.'}</p><button class="primary" data-game-action="quiz-next">Next Pokémon ${icon('arrow')}</button>`:'<p>Look at the silhouette. Trust your trainer instincts.</p>'}</div>`;
}
async function answerQuiz(id){
 if(!quiz||quiz.choice!==null||busy||economyBusy||!quiz.options.some(p=>p.id===id))return;
 const round=quiz;round.choice=id;round.attempts++;const correct=id===round.answer.id;
 if(correct){round.correct++;round.streak++;sound('holo');}else{round.streak=0;sound('flip');}
 renderQuiz();
 if(correct){round.reward=await economyTransaction(grantQuizCorrect)||0;if(round.reward)toast('Quiz bonus! +'+money(round.reward)+'.');}
 if(quiz===round){renderQuiz();announce((correct?'Correct!':'Good try.')+' It’s '+round.answer.name+'.');$('[data-game-action="quiz-next"]')?.focus({preventScroll:true});}
}
function newMemory(){
 clearTimeout(memoryTimer);const pairs=sample(POKEMON,6);
 memory={cards:sample([...pairs,...pairs],12),open:[],matched:[],moves:0,locked:false};renderMemory();
}
function renderMemory(){
 const complete=memory.matched.length===12;
 $('#memoryGame').innerHTML=`<div class="game-scorebar"><span>Pairs found <b>${memory.matched.length/2} / 6</b></span><span>Moves <b>${memory.moves}</b></span><button class="text-button" data-game-action="memory-reset">New board ${icon('arrow')}</button></div><div class="memory-grid" aria-label="Pokémon matching cards">${memory.cards.map((p,i)=>{const matched=memory.matched.includes(i),up=matched||memory.open.includes(i);return `<button class="memory-card ${up?'is-up':''} ${matched?'is-matched':''}" data-memory-card="${i}" aria-label="${up?`${escapeHtml(p.name)}${matched?', matched':''}`:`Hidden card ${i+1}`}" aria-pressed="${up}" ${matched||memory.locked||up?'disabled':''}><span class="pokeball-mark" aria-hidden="true"></span>${up?`<img src="assets/pokemon/${p.id}.png" alt="" width="475" height="475">`:''}</button>`;}).join('')}</div><div class="memory-feedback" aria-live="polite">${complete?`<p><b>Every Pokémon has a partner!</b> All six pairs in ${memory.moves} moves.</p><button class="primary" data-game-action="memory-reset">Play again ${icon('arrow')}</button>`:`<p>${memory.locked?'Take a good look. Remember their places.':memory.open.length?'Now find its matching Pokémon.':'Turn a card. Find its partner.'}</p>`}</div>`;
}
function flipMemory(index){
 if(!memory||memory.locked||!Number.isInteger(index)||index<0||index>=12||memory.open.includes(index)||memory.matched.includes(index))return;
 memory.open.push(index);sound('flip');
 if(memory.open.length===2){
  memory.moves++;const [a,b]=memory.open;
  if(memory.cards[a].id===memory.cards[b].id){memory.matched.push(a,b);memory.open=[];sound('holo');announce(`${memory.cards[a].name} pair found. ${memory.matched.length/2} of 6 pairs.`);}
  else{memory.locked=true;memoryTimer=setTimeout(()=>{memory.open=[];memory.locked=false;renderMemory();if(activeTab==='memory')$(`[data-memory-card="${index}"]`).focus({preventScroll:true});},1000);}
 }
 renderMemory();
 if(memory.matched.length===12){announce(`Every pair found in ${memory.moves} moves.`);$('.memory-feedback [data-game-action]').focus({preventScroll:true});}
 else if(!memory.locked){const next=$('.memory-card:not(:disabled)');if(next)next.focus({preventScroll:true});}
}
function setLibraryFilter(filter){libraryFilter=filter;$$('#libraryFilters [data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));renderLibrary();}
function oddsFor(card){return !card.booster?'Not in boosters':card.rarity==='holo'?'2.22% · 1 in 45':card.rarity==='rare'?'4.17% · 1 in 24':card.rarity==='uncommon'?'9.38% · 3 in 32':card.rarity==='common'?'15.63% · 5 in 32':'30.56% · at least one copy';}
function openCard(id){
 const card=CARD_MAP.get(id);if(!card)return;inspectedCardId=id;$('#cardTitle').textContent=card.name;
 const quote=cardQuote(id),priceDescription=quote.unavailable?'Market price unavailable. Selling is paused for this card.':`TCGplayer via TCGdex · ${quote.amount.toFixed(2)} USD · ${quote.variant} · updated ${new Date(quote.updated).toLocaleDateString('en-GB')}${quote.stale?' · older cached price':''}`;
 const favorite=state.favorites.includes(id),entry=displayInventory()[id],qty=entry?.qty||0;
 $('#cardBody').innerHTML=`<div class="card-detail"><div class="detail-art tilt-surface ${card.rarity==='holo'?'holo-shine':''}">${cardImage(id,{large:true,lazy:false,className:'detail-image'})}</div><div class="detail-info"><span class="pill ${card.rarity==='holo'?'gold':'green'}">${RARITY[card.rarity]}</span><dl><div><dt>Set</dt><dd>Base Set · English</dd></div><div><dt>Card number</dt><dd>${id}/102</dd></div><div><dt>Card category</dt><dd>${escapeHtml(card.kind)}</dd></div><div><dt>Type</dt><dd>${escapeHtml(card.type)}</dd></div><div><dt>Your copies</dt><dd>${number(qty)}</dd></div><div><dt>In booster pool</dt><dd>${card.booster?'Yes':'No — starter product'}</dd></div></dl><div class="card-sale"><span class="eyebrow">SELL VALUE PER CARD</span>${priceLabel(id)}<p>${escapeHtml(priceDescription)}</p><small>The full market price is added to your virtual USD balance. Market guide; individual condition and printing can differ.</small><button class="primary" data-sell-card="${id}" ${!qty||quote.unavailable||busy||economyBusy?'disabled':''}>${!qty?'No revealed copies to sell':quote.unavailable?'Price unavailable':`Sell one · ${money(quote.cents)}`}</button></div><p><strong class="gold">${oddsFor(card)}</strong><br>Modelled chance per simulated pack, not verified physical-pack odds. Artwork printing may differ from the wrapper shown.</p><button type="button" class="secondary" data-favorite="${id}" aria-pressed="${favorite}">${icon('star')}${favorite?'Remove favorite':'Add to favorites'}</button><a class="secondary" href="https://pkmncards.com/?s=${encodeURIComponent(`set:base-set number:${id}`)}" target="_blank" rel="noopener noreferrer">Card reference on PkmnCards ${icon('arrow')}</a></div></div>`;
 if(!$('#cardDialog').open)$('#cardDialog').showModal();
 if(entry){const row=document.createElement('div');const label=document.createElement('dt'),value=document.createElement('dd');label.textContent='First discovered';value.textContent=new Date(entry.firstAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});row.append(label,value);$('.detail-info dl').append(row);}
}
const infoContent={
 odds:{title:'A transparent simulation model',body:`<p>This prototype uses a simple, published-in-the-code model. It does <strong>not</strong> claim to reproduce factory pack odds or physical print-sheet collation.</p><table class="odds-table"><thead><tr><th>Slots</th><th>Pool</th><th>Selection in this model</th></tr></thead><tbody><tr><td>5 Common</td><td>32 cards</td><td>Uniform, without replacement</td></tr><tr><td>3 Uncommon</td><td>32 cards</td><td>Uniform, without replacement</td></tr><tr><td>2 Basic Energy</td><td>6 cards</td><td>Uniform; duplicates allowed</td></tr><tr><td>1 Rare slot</td><td>15 holos / 16 rares</td><td>1/3 holo; 2/3 non-holo rare</td></tr></tbody></table><p>One eligible holo is selected uniformly when the holo branch is chosen. A particular holo such as Charizard therefore has probability <strong>(1/3) × (1/15) = 1/45 ≈ 2.22%</strong> per simulated pack. A particular non-holo rare has probability <strong>(2/3) × (1/16) = 1/24 ≈ 4.17%</strong>.</p><h3>Important exceptions</h3><p>Machamp #8 appears in the full set library but not in this English booster pool. Double Colorless Energy #96 is uncommon and is selected through an uncommon slot, not a Basic Energy slot.</p><h3>What the animations mean</h3><p>The complete 11-card result is chosen once and saved before animation. Skipping, changing pack art or reloading never rerolls that pack. No paid features, adjusted outcomes or guaranteed box ratios are added.</p><div class="dialog-callout">Recipe reference: <a href="https://www.pokemastercenter.com/pokemon-base-set-guide/" target="_blank" rel="noopener noreferrer">Base Set pack guide</a>. The exact probabilities displayed above are design choices of this simulator, not official Pokémon guarantees.</div>`},
 about:{title:'A little nostalgia, built for free',body:`<p><strong>Pack Lab</strong> is a standalone design prototype: a free Base Set simulator with a collector-focused navigation, a card binder and a tactile foil-opening experience. It is not an official Pokémon product.</p><p>There are no accounts, advertisements, payment features, tradeable items or physical prizes. Every result is a local simulation.</p><h3>What is saved?</h3><p>Your virtual USD balance, quiz reward progress, collection counts, favorites, settings, current pack and latest 200 openings are stored under one separate local-storage key. Clearing site data removes your progress; there is no server backup.</p><h3>External requests</h3><p>This version loads card scans, fonts and public card prices from third-party hosts. Booster photos are stored locally, with the original host as a fallback. They receive ordinary requests from your browser. No analytics code is included. Images need an internet connection. Collection data stays on your device.</p><div class="dialog-callout">This is a prototype, with search-engine indexing disabled by default. Artwork credits and an unofficial label do not constitute permission to publish third-party material. The builder has not obtained a Pokémon license.</div>`},
 sources:{title:'Sources & image credits',body:`<p>Original artwork is used as reference imagery. No ownership or publication license is claimed.</p><h3>Card data and reference scans</h3><ul><li><a href="https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json" target="_blank" rel="noopener noreferrer">Pokémon TCG API community dataset — Base Set</a>: card names, numbering, rarity groups and image references.</li><li><a href="https://images.pokemontcg.io/base1/4_hires.png" target="_blank" rel="noopener noreferrer">Pokémon TCG API image CDN</a>: original card reference scans.</li><li><a href="https://www.tcgdex.net/" target="_blank" rel="noopener noreferrer">TCGdex</a>: alternate reference-image host.</li><li><a href="https://pkmncards.com/set/base-set/" target="_blank" rel="noopener noreferrer">PkmnCards Base Set library</a>: linked card reference.</li></ul><h3>Booster wrappers and card back</h3><ul><li><a href="https://totalcards.net/products/pokemon-wotc-base-set-booster-pack-unlimited-unweighed" target="_blank" rel="noopener noreferrer">Total Cards Base Set product photographs</a>: Charizard, Blastoise and Venusaur wrappers.</li><li><a href="${CARD_BACK}" target="_blank" rel="noopener noreferrer">Official Pokémon TCG card-back image</a>.</li></ul><h3>Set and pack references</h3><ul><li><a href="https://www.pokemastercenter.com/pokemon-base-set-guide/" target="_blank" rel="noopener noreferrer">Base Set guide</a>: 11-card pack recipe.</li><li><a href="https://comics.ha.com/itm/memorabilia/trading-cards/pokemon-machamp-8-1st-edition-2-player-starter-set-uncut-sheet-wizards-of-the-coast-1999-form-9/a/7373-36041.s" target="_blank" rel="noopener noreferrer">Heritage Auctions — original Machamp starter-printing sheet</a>: starter-product context.</li></ul><p>Pokémon artwork, characters and trademarks remain the property of the relevant rights holders, including The Pokémon Company, Nintendo, Creatures and GAME FREAK. Product photographs can also have separate rights. Reference links are included for attribution and further reading. Some images show different printings; editions and conditions are not individually modelled. Market guides set the virtual USD purchase and sale prices.</p>`}
};
infoContent.sources.body+='<h3>Market prices</h3><p><a href="https://tcgdex.dev/markets-prices" target="_blank" rel="noopener noreferrer">TCGdex market pricing</a> supplies TCGplayer USD market guides for the normal or holofoil version. Prices are cached for 24 hours. Card prices are used directly in USD, without a multiplier or selling fee. The Base Set Revised Unlimited booster uses its own TCGplayer market quote via TCGCSV. Missing prices disable trading for that item; dated cached quotes stay available during outages. The wallet is virtual and cannot be redeemed.</p>';
infoContent.sources.body+='<h3>Pokémon world and mini-games</h3><p>The Kanto landscape was created for this project with the built-in image-generation tool. Quiz and Memory use Pokémon artwork from the <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noopener noreferrer">PokeAPI sprites repository</a>, stored locally for reliable play.</p>';
function openInfo(type){
 const content=infoContent[type];if(!content)return;
 setMobileMenu(false);
 $('#infoDialog').classList.remove('history-dialog');
 $('#infoTitle').textContent=content.title;$('#infoBody').innerHTML=content.body;
 if(!$('#infoDialog').open)$('#infoDialog').showModal();
 $('#infoDialog').scrollTop=0;closeGuideMenu();
}
function openHistory(packNumber){
 const pack=state.history.find(p=>p.number===packNumber);if(!pack)return;
 if(pack.number===state.lastPack?.number&&pendingPack()){switchTab('opener');return;}
 $('#infoDialog').classList.add('history-dialog');$('#infoTitle').textContent=`Pack #${number(packNumber)} · All 11 cards`;
 $('#infoBody').innerHTML=`<p>A page from your opening history. Tap any card to take a closer look.</p><div class="pack-grid" aria-label="All 11 cards from saved pack ${packNumber}">${pack.cards.map((id,i)=>resultCard(CARD_MAP.get(id),i,{history:true})).join('')}</div>`;
 if(!$('#infoDialog').open)$('#infoDialog').showModal();$('#infoDialog').scrollTop=0;
}
function closeGuideMenu(){$('#infoDropdown').hidden=true;$('#moreInfo').setAttribute('aria-expanded','false');}
function exportCollection(){
 const data={app:'Pack Lab — Base Set',exportedAt:new Date().toISOString(),note:'Virtual collection only. No physical, monetary or redeemable value.',...state};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`base-set-collection-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Collection exported as JSON.');
}
function refreshExternalState(){
 if(busy)return;try{const raw=localStorage.getItem(STORAGE_KEY);state=raw?validatedState(JSON.parse(raw)):emptyState();showIdleOverride=false;renderOpener();updateStats();syncSound();}catch{}externalStatePending=false;
}

// One delegated listener keeps dynamically created cards and menu entries functional.
document.addEventListener('click',event=>{
 const target=event.target instanceof Element?event.target:null;if(!target)return;
 const quizChoice=target.closest('[data-quiz-choice]');if(quizChoice){answerQuiz(Number(quizChoice.dataset.quizChoice));return;}
 const memoryCard=target.closest('[data-memory-card]');if(memoryCard){flipMemory(Number(memoryCard.dataset.memoryCard));return;}
 const gameAction=target.closest('[data-game-action]')?.dataset.gameAction;
 if(gameAction){if(gameAction==='quiz-next')nextQuiz();if(gameAction==='quiz-reset'){quiz=null;nextQuiz();}if(gameAction==='memory-reset')newMemory();const next=gameAction.startsWith('quiz')?$('.quiz-option'):$('.memory-card');next?.focus({preventScroll:true});return;}
 if(Date.now()<suppressPointerClickUntil&&target.closest('.pack-photo,.big-card')){event.preventDefault();return;}
 const close=target.closest('[data-close-dialog]');if(close){close.closest('dialog')?.close();return;}
 const tab=target.closest('[data-tab]');if(tab){event.preventDefault();switchTab(tab.dataset.tab);return;}
 const sale=target.closest('[data-sell-card]');if(sale){sellCards('one',Number(sale.dataset.sellCard));return;}
 const card=target.closest('[data-card]');if(card){openCard(Number(card.dataset.card));return;}
 const historyButton=target.closest('[data-history]');if(historyButton){openHistory(Number(historyButton.dataset.history));return;}
 const favorite=target.closest('[data-favorite]');if(favorite){const id=Number(favorite.dataset.favorite);state.favorites=state.favorites.includes(id)?state.favorites.filter(value=>value!==id):[...state.favorites,id];saveState();openCard(id);if(activeTab==='collection')renderCollection();return;}
 const filter=target.closest('[data-filter]');if(filter){setLibraryFilter(filter.dataset.filter);return;}
 const mode=target.closest('[data-mode]');if(mode&&!busy){state.settings.mode=mode.dataset.mode;saveState();syncControls();if(pendingPack())toast('Opening style changed for your next pack.');return;}
 const art=target.closest('[data-art]');if(art&&!busy){state.settings.art=art.dataset.art;saveState();renderIdle();return;}
 const layout=target.closest('[data-layout]');if(layout){state.settings.layout=layout.dataset.layout==='album'?'album':'grid';saveState();renderCollection();return;}
 const action=target.closest('[data-action]')?.dataset.action;
 if(action){
  if(action==='reset-balance')resetBalance();
  else if(action==='sell-duplicates')sellCards('duplicates');
  else if(action==='refresh-prices')priceBook?.refresh(true);
  else if(action==='sound')toggleSound();
  else if(action==='open')mainAction();
  else if(action==='reveal')revealNext();
  else if(action==='next-pack'&&!busy)openPack(false);
  else if(action==='retry-images'&&!busy){resolvedImages.clear();warmedImages.clear();$('#assetWarning').hidden=true;renderOpener();renderHighlights();if(activeTab==='library')renderLibrary();if(activeTab==='collection')renderCollection();toast('Retrying the reference images.');}
  else if(action==='choose-pack'&&!busy){showIdleOverride=true;renderIdle();bringStageIntoView();}
  else if(action==='odds'||action==='about'||action==='sources')openInfo(action);
  else if(action==='holos'){switchTab('library');setLibraryFilter('holo');}
  else if(action==='export')exportCollection();
  else if(action==='import')$('#importFile').click();
  else if(action==='reset'){if(busy)toast('Finish this opening before resetting.');else $('#resetDialog').showModal();}
  else if(action==='clear-library'){$('#librarySearch').value='';$('#libraryKind').value='all';setLibraryFilter('all');}
 }
 if(!target.closest('.nav-dropdown')){$('#infoDropdown').hidden=true;$('#moreInfo').setAttribute('aria-expanded','false');}
});
$('#mainAction').addEventListener('click',mainAction);$('#secondaryAction').addEventListener('click',secondaryAction);
$('#menuToggle').addEventListener('click',()=>{const open=!$('#navBar').classList.contains('mobile-open');setMobileMenu(open);if(open)$('#navSearch').focus();});
$('#sidebarScrim').addEventListener('click',()=>{setMobileMenu(false);$('#menuToggle').focus();});
$('#navSearch').addEventListener('input',()=>{const query=normalized($('#navSearch').value.trim());const matches=[];$$('.main-nav [role="tab"]').forEach(button=>{button.hidden=!normalized(button.textContent).includes(query);button.tabIndex=-1;if(!button.hidden)matches.push(button);});const focusTab=matches.find(button=>button.dataset.tab===activeTab)||matches[0];if(focusTab)focusTab.tabIndex=0;$$('.nav-heading').forEach(heading=>heading.hidden=Boolean(query));$('#navNoResults').hidden=matches.length>0;});
$('#navSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){const first=$$('.main-nav [role="tab"]').find(button=>!button.hidden);if(first){event.preventDefault();switchTab(first.dataset.tab);}}});
$('#moreInfo').addEventListener('click',()=>{const open=$('#infoDropdown').hidden;$('#infoDropdown').hidden=!open;$('#moreInfo').setAttribute('aria-expanded',String(open));});
['librarySearch','collectionSearch'].forEach(id=>{let timer;const render=id==='librarySearch'?renderLibrary:renderCollection;$(`#${id}`).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,100);});});
['libraryKind','librarySort'].forEach(id=>$(`#${id}`).addEventListener('change',renderLibrary));
['collectionView','collectionSort'].forEach(id=>$(`#${id}`).addEventListener('change',renderCollection));
$('#confirmReset').addEventListener('click',()=>{if(busy||economyBusy)return;const settings={...state.settings};state=emptyState();quiz=null;state.settings=settings;showIdleOverride=false;saveState(true);$('#resetDialog').close();renderOpener();updateStats();if(activeTab==='library')renderLibrary();toast('Your Pack Lab collection has been reset.');});
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){$('#infoDropdown').hidden=true;$('#moreInfo').setAttribute('aria-expanded','false');const wasOpen=$('#navBar').classList.contains('mobile-open');setMobileMenu(false);if(wasOpen)$('#menuToggle').focus();}
 if(event.key==='Tab'&&$('#navBar').classList.contains('mobile-open')&&window.matchMedia('(max-width:700px)').matches){const items=$$('a,button,input',$('#navBar')).filter(el=>!el.hidden&&el.tabIndex>=0),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 if(event.target instanceof Element&&event.target.matches('[role="tab"]')&&['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key)){
  const tabs=$$('[role="tab"]').filter(el=>!el.hidden),index=tabs.indexOf(event.target);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+tabs.length)%tabs.length;event.preventDefault();switchTab(tabs[next].dataset.tab,{focus:true});return;
 }
 if(event.code==='Space'&&!event.repeat&&activeTab==='opener'&&!$('dialog[open]')&&!(event.target instanceof Element&&event.target.closest('button,a,input,select,textarea,summary,[contenteditable]'))){event.preventDefault();mainAction();}
});
window.addEventListener('resize',()=>{setMobileMenu(false);if(reelAnimation){try{reelAnimation.finish();}catch{}}});
window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY)return;if(busy){externalStatePending=true;return;}refreshExternalState();toast('Collection updated from another tab.');});

// The shine follows a pointer only on fine-pointer devices. Touch and reduced-motion users get still cards.
let activeTilt=null,tiltFrame=0,tiltPoint=null;
function clearTilt(){if(!activeTilt)return;['--tilt-x','--tilt-y','--shine-x','--shine-y'].forEach(property=>activeTilt.style.removeProperty(property));activeTilt=null;}
document.addEventListener('pointermove',event=>{
 if(busy||reducedMotion()||event.pointerType==='touch'||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
 const surface=event.target instanceof Element?event.target.closest('.tilt-surface'):null;
 if(surface!==activeTilt){clearTilt();activeTilt=surface;}if(!surface)return;
 tiltPoint={x:event.clientX,y:event.clientY};if(tiltFrame)return;
 tiltFrame=requestAnimationFrame(()=>{tiltFrame=0;const el=activeTilt;if(!el||!tiltPoint)return;const bounds=el.getBoundingClientRect();if(!bounds.width||!bounds.height)return;const x=Math.max(0,Math.min(1,(tiltPoint.x-bounds.left)/bounds.width)),y=Math.max(0,Math.min(1,(tiltPoint.y-bounds.top)/bounds.height));el.style.setProperty('--tilt-x',`${(0.5-y)*9}deg`);el.style.setProperty('--tilt-y',`${(x-0.5)*11}deg`);el.style.setProperty('--shine-x',`${x*100}%`);el.style.setProperty('--shine-y',`${y*100}%`);});
},{passive:true});
document.addEventListener('pointerout',event=>{if(activeTilt&&!(event.relatedTarget instanceof Node&&activeTilt.contains(event.relatedTarget)))clearTilt();},{passive:true});
window.addEventListener('blur',clearTilt);
window.addEventListener('hashchange',()=>{const tab=ROUTES[location.hash];if(tab&&tab!==activeTab)switchTab(tab);});
$$('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(!$('dialog[open]'))document.body.style.overflow='';}));
const modalObserver=new MutationObserver(()=>{document.body.style.overflow=$('dialog[open]')?'hidden':'';});
$$('dialog').forEach(dialog=>modalObserver.observe(dialog,{attributes:true,attributeFilter:['open']}));

// A foil gesture and a card swipe share the same atomic actions as buttons.
let pointerGesture=null,suppressPointerClickUntil=0;
document.addEventListener('pointerdown',event=>{
 if(busy||event.button!==0||!(event.target instanceof Element))return;
 const seam=event.target.closest('.tear-seam'),card=event.target.closest('.big-card');
 if(!seam&&!card)return;
 const target=seam||card;pointerGesture={target,x:event.clientX,y:event.clientY,id:event.pointerId,type:seam?'tear':'swipe',width:target.getBoundingClientRect().width};
 target.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 const g=pointerGesture;if(!g||event.pointerId!==g.id)return;
 const dx=event.clientX-g.x,dy=event.clientY-g.y;
 if(g.type==='tear'){
  const progress=Math.min(1,Math.abs(dx)/Math.max(75,g.width*.6));
  if(Math.abs(dy)>70&&Math.abs(dx)<25){cancelGesture();return;}
  if(progress>.1){g.target.closest('.pack-photo')?.classList.add('is-dragging');g.target.closest('.pack-photo')?.style.setProperty('--tear-progress',progress);}
 }
},{passive:true});
function cancelGesture(){const g=pointerGesture;if(!g)return;const pack=g.target.closest('.pack-photo');pack?.classList.remove('is-dragging');pack?.style.removeProperty('--tear-progress');if(g.target.hasPointerCapture?.(g.id))g.target.releasePointerCapture(g.id);pointerGesture=null;}
document.addEventListener('pointerup',event=>{
 const g=pointerGesture;if(!g||event.pointerId!==g.id)return;
 const dx=event.clientX-g.x,dy=event.clientY-g.y;
 const complete=g.type==='tear'?Math.abs(dx)>Math.max(55,g.width*.35):Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3;
 cancelGesture();
 if(complete){suppressPointerClickUntil=Date.now()+550;g.type==='tear'?mainAction():revealNext();}
});
document.addEventListener('pointercancel',cancelGesture);
window.addEventListener('blur',cancelGesture);

// Imports are validated before a separate, explicit replacement action.
let pendingImport=null;
$('#importFile').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{if(file.size>5e6)throw new Error('large');pendingImport=validatedState(JSON.parse(await file.text()));$('#importSummary').textContent=`${pendingImport.packs} packs, ${Object.keys(pendingImport.inventory).length} discoveries and ${pendingImport.favorites.length} favourites, ready to restore.`;$('#importDialog').showModal();}
 catch{pendingImport=null;toast('That file is not a valid Pack Lab collection.');}finally{event.target.value='';}
});
$('#confirmImport').addEventListener('click',()=>{if(!pendingImport||busy||economyBusy)return;state=pendingImport;pendingImport=null;quiz=null;showIdleOverride=false;saveState(true);$('#importDialog').close();renderOpener();updateStats();syncSound();if(activeTab==='library')renderLibrary();toast('Your collection is home.');});

let priceStorage;try{priceStorage=localStorage;}catch{}
priceBook=PackLabPricing.create(CARDS,{storage:priceStorage,seed:globalThis.PACK_LAB_PRICE_SNAPSHOT,onUpdate:refreshPriceViews});
renderHighlights();renderOpener();updateStats();syncSound();setMobileMenu(false);
priceBook.refresh();
const startingTab=ROUTES[location.hash];if(startingTab&&startingTab!=='opener')switchTab(startingTab);
if(storageCorrupt)toast('The saved data could not be read. A new session has been started.');
// A read-only diagnostic interface: no setters and no forced rewards.
Object.defineProperty(window,'PACK_LAB_DIAGNOSTICS',{value:Object.freeze({version:2,poolSizes:Object.freeze(Object.fromEntries(Object.entries(POOLS).map(([key,values])=>[key,values.length]))),samplePack:()=>generatePack(),getTotals:()=>({...totals()}),validate:()=>state.packs*11===totals().total+state.economy.soldCards}),writable:false});
})();
