import pricing from './pricing.js';
import {marketFetch} from './market-fetch.mjs';

// One server-side daily lookup shared by all browser tabs. Retain dated quotes
// during outages; never substitute a made-up price or stamp an old quote as new.
export function createPackPriceService({seed,fetcher=marketFetch,now=Date.now}={}){
 let pack=pricing.packQuote(seed).unavailable?null:seed;
 let checkedAt=pack?.fetchedAt||0,inFlight=null,failed=false;
 async function request(url,asText=false){
  const response=await fetcher(url,{headers:{'User-Agent':'PokemonPackLab/5.0'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Market data unavailable');
  return asText?response.text():response.json();
 }
 async function update(){
  try{
   const updated=(await request('https://tcgcsv.com/last-updated.txt',true)).trim();
   if(!Number.isFinite(Date.parse(updated)))throw new Error('Invalid market timestamp');
   if(pack&&Date.parse(updated)<=Date.parse(pack.updated)){pack={...pack,fetchedAt:now()};failed=false;return;}
   const data=await request('https://tcgcsv.com/tcgplayer/3/604/prices');
   const next=pricing.normalizePack(data,updated,now());if(!next)throw new Error('No matching pack quote');
   pack=next;failed=false;
  }catch{failed=true;}
  finally{checkedAt=now();}
 }
 return async function getPackPrice(){
  if(now()-checkedAt>=(failed?60000:pricing.TTL)||!checkedAt){
   if(!inFlight)inFlight=update().finally(()=>{inFlight=null;});
   await inFlight;
  }
  return {pack,cached:failed};
 };
}
