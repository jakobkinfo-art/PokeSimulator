(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PackLabPricing=api;
})(globalThis,()=>{
 'use strict';
 const TTL=24*60*60*1000,CACHE_KEY='packLab.prices.base1.v1';
 const PACK_PRODUCT_ID=138130;
 const PACK_SOURCE_URL='https://www.tcgplayer.com/product/138130/pokemon-base-set-base-set-booster-pack-revised-unlimited-edition';
 const toCents=amount=>Math.round((amount+Number.EPSILON)*100);
 function normalize(card,data,fetchedAt=Date.now()){
  if(data?.id!==`base1-${card.id}`)return null;
  const pricing=data.pricing?.tcgplayer;
  if(pricing?.unit!=='USD')return null;
  // Never substitute first edition or reverse holo prices for these cards.
  const variants=card.rarity==='holo'?['unlimited-holofoil','holofoil']:['unlimited','normal'];
  for(const variant of variants){
   const amount=pricing[variant]?.marketPrice;
   if(typeof amount==='number'&&Number.isFinite(amount)&&amount>0&&amount<=1e7&&Number.isFinite(Date.parse(pricing.updated))){
    return {amount,currency:'USD',source:'TCGplayer',variant,updated:pricing.updated,fetchedAt};
   }
  }
  return null;
 }
 function validQuote(card,q){
  return q?.source==='TCGplayer'&&q.currency==='USD'&&typeof q.amount==='number'&&Number.isFinite(q.amount)&&q.amount>0&&q.amount<=1e7&&Number.isFinite(Date.parse(q.updated))&&Number.isFinite(q.fetchedAt)&&q.fetchedAt>0&&q.fetchedAt<=Date.now()+60000&&(card.rarity==='holo'?['unlimited-holofoil','holofoil']:['unlimited','normal']).includes(q.variant);
 }
 function quote(card,q){
  if(!validQuote(card,q))return {cents:null,source:'Price unavailable',unavailable:true};
  return {...q,cents:toCents(q.amount),unavailable:false,stale:Date.now()-Date.parse(q.updated)>TTL*2};
 }
 function normalizePack(data,updated,fetchedAt=Date.now()){
  const price=data?.results?.find(p=>p.productId===PACK_PRODUCT_ID&&p.subTypeName==='Normal');
  if(data?.success!==true||typeof price?.marketPrice!=='number'||!Number.isFinite(price.marketPrice)||price.marketPrice<0.01||price.marketPrice>1e7||!Number.isFinite(Date.parse(updated)))return null;
  return {productId:PACK_PRODUCT_ID,name:'Base Set Booster Pack [Revised Unlimited Edition]',amount:price.marketPrice,currency:'USD',source:'TCGplayer via TCGCSV',updated:new Date(updated).toISOString(),fetchedAt};
 }
 function packQuote(q){
  if(q?.productId!==PACK_PRODUCT_ID||q.currency!=='USD'||q.source!=='TCGplayer via TCGCSV'||!Number.isFinite(q.amount)||q.amount<0.01||q.amount>1e7||!Number.isFinite(Date.parse(q.updated))||!Number.isFinite(q.fetchedAt)||q.fetchedAt>Date.now()+60000)return {cents:null,unavailable:true};
  return {...q,cents:toCents(q.amount),unavailable:false,stale:Date.now()-Date.parse(q.updated)>TTL*2};
 }
 function create(cards,{storage,seed={},fetcher=globalThis.fetch,onUpdate=()=>{}}={}){
  const quotes={};let refreshing=false,pack=null;
  function mergePack(q){if(!packQuote(q).unavailable&&(!pack||q.fetchedAt>pack.fetchedAt))pack=q;}
  function merge(input){for(const card of cards){const q=input?.[card.id];if(validQuote(card,q)&&(!quotes[card.id]||q.fetchedAt>quotes[card.id].fetchedAt))quotes[card.id]=q;}}
  merge(seed.quotes);
  mergePack(seed.pack);
  try{const cached=JSON.parse(storage?.getItem(CACHE_KEY)||'null');merge(cached?.quotes);mergePack(cached?.pack);}catch{}
  function persist(){try{storage?.setItem(CACHE_KEY,JSON.stringify({quotes,pack}));}catch{}}
  async function refresh(force=false){
   if(refreshing||typeof fetcher!=='function')return;
   refreshing=true;onUpdate();let failures=0,successes=0;
   const queue=cards.filter(card=>force||!quotes[card.id]||Date.now()-quotes[card.id].fetchedAt>=TTL);
   async function worker(){
    while(queue.length&&failures<4){
     const card=queue.shift(),controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
     try{
      const response=await fetcher(`https://api.tcgdex.net/v2/en/cards/base1-${card.id}`,{signal:controller.signal});
      if(!response.ok)throw new Error('Price request failed');
      const q=normalize(card,await response.json());
      if(q){quotes[card.id]=q;successes++;} // Keep the last known quote on missing data.
     }catch{failures++;}finally{clearTimeout(timeout);}
    }
   }
   async function refreshPack(){
    if(pack&&Date.now()-pack.fetchedAt<TTL)return;
    // TCGCSV has restrictive CORS: use the local server's cached endpoint.
    if(typeof location==='undefined'||!['http:','https:'].includes(location.protocol))return;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetcher('/api/pack-price',{signal:controller.signal});if(!response.ok)throw new Error('Pack price request failed');const data=await response.json();if(packQuote(data.pack).unavailable)throw new Error('Invalid pack price');mergePack(data.pack);if(data.cached)failures++;}
    catch{failures++;}finally{clearTimeout(timeout);}
   }
   try{await Promise.all([...Array.from({length:4},worker),refreshPack()]);persist();}
   finally{refreshing=false;onUpdate({failures,successes});}
  }
  return {quotes,get:card=>quote(card,quotes[card.id]),getPack:()=>packQuote(pack),refresh,get refreshing(){return refreshing;}};
 }
 return {TTL,CACHE_KEY,PACK_PRODUCT_ID,PACK_SOURCE_URL,toCents,normalize,validQuote,quote,normalizePack,packQuote,create};
});
