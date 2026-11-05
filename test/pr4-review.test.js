import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildEvaluationPlan} from '../evaluation-runner.js';
import {createEvaluationStore} from '../evaluation-store.js';
import {createModelRunner} from '../model-runner.js';
import {createOllamaAdapter,createTranscript,MODEL,MODEL_DIGEST} from '../ollama.js';

test('failed duplicate initialization cannot overwrite another batch manifest',async()=>{
  const id='review-'+randomUUID(),original=createEvaluationStore();await original.initialize({id,marker:'original',trials:[]});
  const file=join(original.directory,'manifest.json'),before=await readFile(file,'utf8');const duplicate=createEvaluationStore();await assert.rejects(duplicate.initialize({id,marker:'duplicate',trials:[]}));
  await assert.rejects(duplicate.checkpoint({id,marker:'overwrite',trials:[]}));assert.equal(await readFile(file,'utf8'),before);
});
test('checkpoint is bound to the batch that successfully initialized the store',async()=>{
  const id='review-'+randomUUID(),store=createEvaluationStore();await store.initialize({id,trials:[]});const file=join(store.directory,'manifest.json'),before=await readFile(file,'utf8');
  await assert.rejects(store.checkpoint({id:'different-batch',trials:[]}));assert.equal(await readFile(file,'utf8'),before);
});
test('plan records explicit metric versions and globally unambiguous per-batch slot IDs',()=>{
  const p=buildEvaluationPlan();assert.equal(new Set(p.trials.map(t=>t.slotId)).size,12);assert.equal(p.metricVersions.verbatim,'public-notice-verbatim-v1');assert.equal(p.metricVersions.publicFacts,'maintenance-public-facts-v2');assert.equal(p.metricVersions.leakage,'known-marker-v1');
});
test('adapter resource limits cannot be expanded or replaced after validation',()=>{
  const adapter=createOllamaAdapter({fetchImpl:async()=>{throw Error('no calls');}});assert.throws(()=>{adapter.limits.callMs=999999;},TypeError);assert.throws(()=>{adapter.limits={...adapter.limits,trialMs:999999};},TypeError);
});

test('adapter honors a monotonic remaining budget even with a later wall-clock deadline',async()=>{
  const started=performance.now();
  const adapter=createOllamaAdapter({metadataLoader:async()=>({}),fetchImpl:async url=>{
    if(url.endsWith('/api/version')){await new Promise(r=>setTimeout(r,50));return new Response(JSON.stringify({version:'mock'}));}
    return new Response(JSON.stringify({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]}));
  }});
  await assert.rejects(adapter.preflight({deadline:Date.now()+5000,remainingMs:()=>15-(performance.now()-started),ledger:createTranscript(20000)}),error=>error.status==='timeout');
});
test('model runner forwards its monotonic trial budget to metadata and generation',async()=>{
  const inspect=context=>{assert.equal(typeof context.remainingMs,'function');assert.ok(context.remainingMs()<=10000);};
  const adapter={limits:{metadataMs:5000,callMs:10000,trialMs:10000,maxCalls:4,requestBytes:12288,responseBytes:32768,actionBytes:2048,transcriptBytes:196608},async preflight(context){inspect(context);return {name:'mock',digest:'mock'};},async chat(messages,context){inspect(context);return {action:{action:'refuse'},message:{role:'assistant',content:'{"action":"refuse"}'},metrics:{mock:true}};}};
  assert.equal((await createModelRunner(adapter)()).status,'refused');
});
