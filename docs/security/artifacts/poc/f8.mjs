// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;
const {createOllamaAdapter,MODEL,MODEL_DIGEST}=await import(R+'ollama.js');
const {createModelRunner}=await import(R+'model-runner.js');
const {publicNotice}=await import(R+'gateway.js');
const j=d=>new Response(JSON.stringify(d));
// researcher: read_document, then handoff; writer: publish BUT response model identity is an impostor
const outputs=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
let call=0;
const fetchImpl=async(u)=>{
  if(u.endsWith('/api/version'))return j({version:'MOCK'});
  if(u.endsWith('/api/tags'))return j({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]});
  const action=outputs[call++];
  // writer is the 3rd chat call -> return impostor model name to trigger identity mismatch
  const model=call===3?'impostor:latest':MODEL;
  return j({model,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(action)}});
};
const a=createOllamaAdapter({fetchImpl,metadataLoader:async()=>({})});
const run=await createModelRunner(a)({mode:'baseline',scenario:'public-summary'});
console.log(JSON.stringify({
  status:run.status,
  errorMessage:run.error?.message,
  measurementVersion:run.handoffMeasurement.version,
  handoff_deliveredRecords:run.handoffMeasurement.deliveredRecords.length,
  validatedModelDeliveryCount:run.handoffMeasurement.validatedModelDeliveryCount??'absent (pre-remediation)',
  deliveryBasis:run.handoffMeasurement.deliveryBasis.slice(0,60)
},null,1));
