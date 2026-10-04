import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const allowed=url=>['https://tcgcsv.com/last-updated.txt','https://tcgcsv.com/tcgplayer/3/604/prices'].includes(url)||/^https:\/\/api\.tcgdex\.net\/v2\/en\/cards\/base1-\d{1,3}$/.test(url);

// Node 18/22 can lack the Windows enterprise root certificates. In that case,
// use Windows' HTTPS client and its normal certificate validation, never an
// insecure TLS option. Only these public market-data URLs may use the fallback.
export async function marketFetch(url,options={}){
 try{return await fetch(url,options);}
 catch(error){
  if(process.platform!=='win32'||!allowed(url)||!['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN'].includes(error.cause?.code))throw error;
  const script=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $response=Invoke-WebRequest -UseBasicParsing -Uri '${url}' -Headers @{'User-Agent'='PokemonPackLab/5.0'} -TimeoutSec 8; [Console]::Write($response.Content)`;
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:2*1024*1024,signal:options.signal});
  return new Response(stdout,{status:200});
 }
}
