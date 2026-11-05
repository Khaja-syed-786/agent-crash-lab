// PRESERVED-MEANING CHARACTERIZATION. These pass on base 6981b53 and after remediation: existing metrics keep their meaning,
// and the remediation adds new fields instead of redefining them. Mock adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOllamaAdapter,MODEL,MODEL_DIGEST} from '../ollama.js';
import {createModelRunner} from '../model-runner.js';
import {runEvaluationBatch} from '../evaluation-runner.js';
import {publicNotice} from '../gateway.js';

const json=data=>new Response(JSON.stringify(data));
const envelope=(action,extra={})=>({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(action)},...extra});
function mockAdapter(chat,{version=()=>'MOCK'}={}){
  let step=0,trial=-1;
  return createOllamaAdapter({metadataLoader:async()=>({manifestDigest:MODEL_DIGEST}),fetchImpl:async url=>url.endsWith('/api/version')?(step=0,trial++,json({version:version(trial)})):url.endsWith('/api/tags')?json({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]}):chat(step++,trial)});
}
const SAFE=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
function memoryStore(){return {async initialize(){},async checkpoint(){},async saveTrial(t){return `mock-${t.index}.json`;}};}

test('F8 baseline meaning: deliveredRecords counts transport delivery even when the writer response fails identity',async()=>{
  const outputs=[...SAFE];
  const r=await createModelRunner(mockAdapter(step=>json(envelope(outputs.shift(),step===2?{model:'impostor:latest'}:{}))))({mode:'baseline',scenario:'handoff-control'});
  assert.equal(r.status,'runtime_failure');assert.equal(r.handoffMeasurement.deliveredRecords.length,1);
});
test('F8 baseline meaning: writer-boundary confirmedDeliveries counts transport delivery even with an identity mismatch',async()=>{
  const r=await createModelRunner(mockAdapter(()=>json(envelope({action:'publish',text:publicNotice},{model:'impostor:latest'}))),{writerBoundary:true})({mode:'baseline',scenario:'writer-control'});
  assert.equal(r.status,'runtime_failure');assert.equal(r.writerInput.confirmedDeliveries.length,1);assert.equal(r.documentDelivered,false);
});
test('F9 baseline meaning: outcomesRecorded still counts a trial saved before a failed context check',async()=>{
  let queue;
  const b=await runEvaluationBatch({adapter:mockAdapter(step=>{if(step===0)queue=[...SAFE];return json(envelope(queue.shift()));},{version:trial=>trial===0?'MOCK-A':'MOCK-B'}),store:memoryStore()});
  assert.match(b.error,/Initial execution context changed/);assert.equal(b.stopReason,'evidence_or_integrity_error');
  assert.equal(b.summary.attempted,2);assert.equal(b.summary.outcomesRecorded,2);assert.equal(b.summary.notAttempted,10);
});

test('F7 documented property: the unsigned chain misses tail truncation; a retained final hash and count detect it',async()=>{
  const {verifyEvents}=await import('../gateway.js');
  let queue;const r=await createModelRunner(mockAdapter(step=>{if(step===0)queue=[...SAFE];return json(envelope(queue.shift()));}))({mode:'baseline'});
  const events=r.events;assert.ok(events.length>=2);
  const retained={finalHash:events.at(-1).hash,count:events.length};
  const truncated=events.slice(0,-1);
  assert.equal(verifyEvents(truncated),true,'documented limitation: chain alone does not detect dropped trailing events');
  assert.equal(verifyEvents([]),true,'documented limitation: an empty chain verifies');
  assert.notDeepEqual({finalHash:truncated.at(-1).hash,count:truncated.length},retained,'out-of-band final hash/count detects truncation');
});
