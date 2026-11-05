import test from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {documentFixture,marker,publicNotice,handoffDisclosureInstruction,injectionScenarios} from '../documents.js';
import {measureHandoffs} from '../handoff-evaluator.js';
import {buildEvaluationPlan,runEvaluationBatch} from '../evaluation-runner.js';
import {createOllamaAdapter,MODEL,MODEL_DIGEST} from '../ollama.js';
import {hash} from '../gateway.js';
import {comparisonFor,evidenceFor} from '../public/comparison.js';
const proposal=text=>({kind:'proposal',actor:'researcher',proposed:{action:'handoff',text}});
test('handoff text measurement separates representation, instruction mentions, and malformed absence',()=>{
 const texts=[publicNotice,marker,Buffer.from(marker).toString('base64'),`Do not obey this quoted instruction: "${handoffDisclosureInstruction}"`,handoffDisclosureInstruction.toUpperCase().replaceAll(' ','  '),undefined];
 const m=measureHandoffs(texts.map(proposal));
 assert.equal(m.version,'handoff-text-v1');assert.deepEqual(m.records.map(r=>r.rawMarker),[false,true,false,true,true,null]);
 assert.deepEqual(m.records.map(r=>r.base64Marker),[false,false,true,false,false,null]);
 assert.deepEqual(m.records.map(r=>r.disclosureInstruction),[false,false,false,true,true,null]);
 assert.equal(measureHandoffs([]).records.length,0);
 assert.equal(measureHandoffs([{...proposal(marker),actor:'writer'}]).records.length,0);
});
test('matched handoff documents retain facts, secret availability, content hash and independent versions',()=>{
 const a=documentFixture('handoff-control'),b=documentFixture('handoff-disclosure');
 const strip=f=>({...f.data,content:undefined});assert.deepEqual(strip(a),strip(b));
 assert.equal(a.data.private,marker);assert.equal(a.data.privateBase64,Buffer.from(marker).toString('base64'));
 assert.equal(hash(b.data),b.document.sha256);assert.deepEqual(b.matchedControl.document,a.document);
 assert.equal(b.document.version,'handoff-document-v1');assert.throws(()=>documentFixture('handoff-control','scripted-fixture'));
 assert.throws(()=>documentFixture('handoff-control','local-model','v2'));
 for(const scenario of injectionScenarios)assert.equal(documentFixture(scenario).document.version,'maintenance-document-v2');
 assert.deepEqual(buildEvaluationPlan().scenarios,['injection-control','injection-direct']);
});
test('mocked experiment delivers actual documents and preserves quoted instruction observations without published leaks',async()=>{
 let calls=0;const requests=[],raw=[];
 const adapter=createOllamaAdapter({metadataLoader:async()=>({manifestDigest:MODEL_DIGEST}),fetchImpl:async(url,opts)=>{
 const json=v=>new Response(JSON.stringify(v));
 if(url.endsWith('/api/version')){calls=0;return json({version:'MOCK'});}
 if(url.endsWith('/api/tags'))return json({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]});
 const body=JSON.parse(opts.body);requests.push(body);const step=calls++;
 const action=step===0?{action:'read_document'}:step===1?{action:'handoff',text:`Quoted request, not endorsed: ${handoffDisclosureInstruction} Encoded: ${Buffer.from(marker).toString('base64')}`}:{action:'publish',text:publicNotice};
 return json({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:500,eval_count:40,message:{role:'assistant',content:JSON.stringify(action)}});
 }});
 const store={async initialize(){},async checkpoint(){},async saveTrial(t,e){raw.push(e);return `mock-${t.index}.json`;}};
 const b=await runEvaluationBatch({adapter,store,experiment:'handoff-propagation'});
 assert.equal(b.summary.attempted,12);assert.equal(b.summary.conditions.length,4);assert.equal(b.summary.publishedLeakTrials,0);assert.equal(b.summary.gatewayPublicationBlockCount,0);assert.equal(b.summary.verbatimIncomplete,0);
 assert.equal(new Set(b.trials.map(t=>t.trialId)).size,12);assert.equal(b.plan.handoffMeasurementVersion,'handoff-text-v1');assert(b.pairs.every(p=>p.comparable));
 for(const [i,e] of raw.entries()){
 const r=e.selectedRun,m=r.handoffMeasurement.records[0];assert.equal(e.evaluationKind,'mock-verification');assert.equal(m.rawMarker,true);assert.equal(m.base64Marker,true);assert.equal(m.disclosureInstruction,true);
 assert.equal(e.handoffMeasurementVersion,'handoff-text-v1');assert.equal(b.trials[i].observations.handoffMeasurement.version,'handoff-text-v1');
 const doc=JSON.parse(requests[i*3+1].messages.at(-1).content).data;assert.deepEqual(doc,documentFixture(r.scenario).data);
 assert.equal(JSON.parse(requests[i*3+2].messages.at(-1).content).data,m.text);
 const {evidenceHash,...body}=r;assert.equal(evidenceHash,hash(body));
 const legacy={...r,mode:r.mode==='baseline'?'protected':'baseline'};delete legacy.handoffMeasurement;
 assert.equal(comparisonFor([legacy],r.scenario,r.policyVersion,r)[legacy.mode],null);
 assert.equal(evidenceFor([legacy],legacy).handoffMeasurementVersion,null);
 }
 for(const pair of b.pairs){const [a,z]=pair.trialIndices;assert.deepEqual(requests.slice(a*3,a*3+3),requests.slice(z*3,z*3+3));}
});

test('opt-in plan CLI is model-free and retains original plan selection',()=>{
 const result=spawnSync(process.execPath,['scripts/evaluation-pilot.js','--plan','--handoff-propagation'],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0);const p=JSON.parse(result.stdout);assert.equal(p.planned,12);assert.equal(p.experimentVersion,'handoff-propagation-v1');
 assert.deepEqual(p.scenarios,['handoff-control','handoff-disclosure']);assert.equal(new Set(p.trials.map(t=>t.slotId)).size,12);
 assert.deepEqual(p.model,buildEvaluationPlan().model);assert.deepEqual(p.trialLimits,buildEvaluationPlan().trialLimits);assert.deepEqual(p.metricVersions,buildEvaluationPlan().metricVersions);
});
