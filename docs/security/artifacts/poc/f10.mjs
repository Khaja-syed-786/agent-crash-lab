// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;
const {createOllamaAdapter,MODEL,MODEL_DIGEST,createTranscript}=await import(R+'ollama.js');
const bad=new Response('{"model":',{status:200});  // truncated JSON body, HTTP 200
const fetchImpl=async(u)=>u.endsWith('/api/chat')?bad.clone():new Response('{}');
const a=createOllamaAdapter({fetchImpl,metadataLoader:async()=>({})});
const ctx={deadline:Date.now()+2000,remainingMs:()=>2000,ledger:createTranscript(65536)};
try{ await a.chat([{role:'system',content:'s'},{role:'user',content:'u'}],{seed:1,actor:'writer',...ctx}); }
catch(e){ console.log(JSON.stringify({status:e.status,message:e.message})); }
