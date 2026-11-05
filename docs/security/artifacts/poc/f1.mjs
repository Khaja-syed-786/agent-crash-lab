// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
import {execFileSync} from 'node:child_process';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;
const {createOllamaAdapter,MODEL,MODEL_DIGEST}=await import(R+'ollama.js');
const {createModelRunner}=await import(R+'model-runner.js');
const j=d=>new Response(JSON.stringify(d));
const a=createOllamaAdapter({metadataLoader:async()=>({}),fetchImpl:async u=>u.endsWith('/api/version')?j({version:'MOCK'}):u.endsWith('/api/tags')?j({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]}):j({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:'{"action":"refuse"}'}})});
const run=await createModelRunner(a)({mode:'baseline'});
console.log('source.commit='+run.source.commit+' dirty='+run.source.dirty);
