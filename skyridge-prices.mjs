import pricing from './pricing.js';
import {marketFetch} from './market-fetch.mjs';

export function createSkyridgePriceService({cards,seed={},fetcher=marketFetch,now=Date.now}={}){
 const quotes={};
 for(const card of cards)if(pricing.validQuote(card,seed[card.id]))quotes[card.id]=seed[card.id];
 let checkedAt=Math.max(0,...Object.values(quotes).map(q=>q.fetchedAt)),inFlight=null,failed=false;
 async function request(url,text=false){const r=await fetcher(url,{headers:{'User-Agent':'PokemonPackLab/6.0'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Prices unavailable');return text?r.text():r.json();}
 async function update(){
  try{
   const updated=new Date((await request('https://tcgcsv.com/last-updated.txt',true)).trim()).toISOString();
   const data=await request('https://tcgcsv.com/tcgplayer/3/1372/prices');
   if(data?.success!==true||!Array.isArray(data.results))throw Error('Invalid prices');
   for(const card of cards){const q=pricing.normalizeCSV(card,data,updated,now());if(q)quotes[card.id]=q;}
   failed=false;
  }catch{failed=true;}finally{checkedAt=now();}
 }
 return async()=>{
  if(!checkedAt||now()-checkedAt>=(failed?60000:pricing.TTL)){if(!inFlight)inFlight=update().finally(()=>{inFlight=null;});await inFlight;}
  return {quotes,cached:failed};
 };
}
