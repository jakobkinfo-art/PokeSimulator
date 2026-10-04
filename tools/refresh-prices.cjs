// Refresh the bundled public price snapshot: node tools/refresh-prices.cjs
const fs=require('node:fs');
const path=require('node:path');
const pricing=require('../pricing.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cards=JSON.parse(html.match(/<script id="base-set-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
require('../price-snapshot.js');
const previous=globalThis.PACK_LAB_PRICE_SNAPSHOT;
const book=pricing.create(cards,{fetcher:async(...args)=>(await import('../market-fetch.mjs')).marketFetch(...args)});
book.refresh().then(async()=>{
 const count=Object.keys(book.quotes).length;
 if(cards.filter(card=>card.booster).some(card=>!book.quotes[card.id]))throw new Error(`Only ${count}/${cards.length} quotes received; previous snapshot preserved.`);
 const {createPackPriceService}=await import('../pack-prices.mjs');
 const result=await createPackPriceService({seed:previous.pack})();
 if(!result.pack)throw new Error('No verified pack price; previous snapshot preserved.');
 const snapshot={generatedAt:new Date().toISOString(),provider:'https://tcgdex.dev/markets-prices',quotes:book.quotes,pack:result.pack};
 fs.writeFileSync(path.join(root,'price-snapshot.js'),'globalThis.PACK_LAB_PRICE_SNAPSHOT = '+JSON.stringify(snapshot,null,2)+';\n');
 console.log(`Saved ${count} card prices and the dated booster quote ($${result.pack.amount} USD).`);
}).catch(error=>{console.error(error.message);process.exitCode=1;});
