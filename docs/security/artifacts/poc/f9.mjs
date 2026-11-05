// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;
const {createOllamaAdapter,MODEL,MODEL_DIGEST,LIMITS}=await import(R+'ollama.js');
const {runEvaluationBatch}=await import(R+'evaluation-runner.js');
const {publicNotice}=await import(R+'gateway.js');
const j=d=>new Response(JSON.stringify(d));
// Build an adapter-like object whose preflight runtimeVersion flips after 4 trials.
let trialNo=0;
function makeAdapter(){
  // reuse createOllamaAdapter with injected fetch to stay mock
  let localCall=0;
  const outputs=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
  const fetchImpl=async(u)=>{
    if(u.endsWith('/api/version')) {
      // version changes on the 5th trial (index 4)
      return j({version: trialNo>=4 ? 'OLLAMA_CHANGED_MIDBATCH' : 'OLLAMA_STABLE'});
    }
    if(u.endsWith('/api/tags'))return j({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]});
    const action=outputs[localCall++ % 3];
    return j({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(action)}});
  };
  return createOllamaAdapter({fetchImpl,metadataLoader:async()=>({})});
}
const adapter=makeAdapter();
// wrap preflight to bump trialNo per trial
const realPreflight=adapter.preflight.bind(adapter);
// adapter.preflight is frozen? only for real fetch; mock not frozen. override via proxy object:
const wrapped={limits:adapter.limits,evaluationKind:adapter.evaluationKind,
  preflight:async(ctx)=>{const r=await realPreflight(ctx);trialNo++;return r;},
  chat:adapter.chat.bind(adapter)};
Object.defineProperty(wrapped,'limits',{value:adapter.limits});
// minimal in-memory store
const store={initialize:async()=>{},checkpoint:async()=>{},saveTrial:async()=>'mem'};
const batch=await runEvaluationBatch({adapter:wrapped,store,experiment:'original'});
console.log(JSON.stringify({
  status:batch.status, stopReason:batch.stopReason, error:batch.error,
  planned:batch.summary.planned, attempted:batch.summary.attempted,
  summaryVersion:batch.summary.summaryVersion??'absent (v1)',
  outcomesRecorded:batch.summary.outcomesRecorded,
  validatedOutcomes:batch.summary.validatedOutcomes??'absent (v1)',
  integrityRejectedOutcomes:batch.summary.integrityRejectedOutcomes??'absent (v1)',
  trial5_integrity:batch.trials[4].integrity??'absent (v1)',
  statusCounts:batch.summary.statusCounts,
  trial5_status:batch.trials[4].status,
  trial5_comparisonValid:batch.trials[4].comparisonValid,
  trial5_counted_in_outcomes: !!batch.trials[4].observations
},null,1));
