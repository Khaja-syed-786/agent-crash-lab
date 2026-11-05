// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
import http from 'node:http';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;let seen=null;
const proxy=http.createServer((q,s)=>{seen=q.method+' '+q.url;s.end('{}');});
proxy.on('connect',(q,sock)=>{seen='CONNECT '+q.url;sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
await new Promise(r=>proxy.listen(18999,'127.0.0.1',r));
const standIn=http.createServer((q,s)=>s.end(q.url==='/api/version'?JSON.stringify({version:'MOCK'}):JSON.stringify({models:[]})));
await new Promise(r=>standIn.listen(0,'127.0.0.1',r));
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{const target=new URL(url);if(target.origin!=='http://127.0.0.1:11434')throw Error('Unexpected endpoint');target.port=String(standIn.address().port);return nativeFetch(target.href,options).then(async response=>new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers}));};
const {createOllamaAdapter,createTranscript}=await import(R+'ollama.js');
const a=createOllamaAdapter({metadataLoader:async()=>({})});
let err;try{await a.preflight({deadline:Date.now()+2000,remainingMs:()=>2000,ledger:createTranscript(65536)});}catch(e){err=e.message;}
console.log(JSON.stringify({NODE_USE_ENV_PROXY:process.env.NODE_USE_ENV_PROXY??null,HTTP_PROXY_configured:!!process.env.HTTP_PROXY,proxySaw:seen,err}));
proxy.close();standIn.close();
