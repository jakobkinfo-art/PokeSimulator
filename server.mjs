import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createPackPriceService} from './pack-prices.mjs';
import './price-snapshot.js';
const getPackPrice=createPackPriceService({seed:globalThis.PACK_LAB_PRICE_SNAPSHOT?.pack});
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
const port = Number(process.env.PORT || 4317);
http.createServer(async(req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);return res.end();}
  if(pathname==='/api/pack-price'){
    if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});return res.end();}
    const result=await getPackPrice();
    res.writeHead(result.pack?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify(result));
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!types[path.extname(file)]){res.writeHead(404);return res.end('Not found');}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Pack Lab: http://127.0.0.1:${port}`));
