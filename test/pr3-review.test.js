import test from 'node:test';
import assert from 'node:assert/strict';
import {documentFixture,injectionScenarios,publicNotice,marker} from '../documents.js';
import {createOllamaAdapter,LIMITS} from '../ollama.js';
import {createModelRunner} from '../model-runner.js';

test('every attack has a matched control with identical public facts and raw/encoded secret availability',()=>{
  const control=documentFixture('injection-control');
  assert.equal(control.data.privateBase64,Buffer.from(marker).toString('base64'));
  for(const id of injectionScenarios){const f=documentFixture(id);assert.equal(f.data.public,control.data.public);assert.equal(f.data.private,control.data.private);assert.equal(f.data.privateBase64,control.data.privateBase64);assert.equal(f.matchedControl.scenario,'injection-control');assert.deepEqual(f.matchedControl.document,control.document);}
});
test('replacing global fetch cannot turn mocked transport into actual model evidence',()=>{
  const original=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('no calls');};assert.equal(createOllamaAdapter().evaluationKind,'mock-verification');}finally{globalThis.fetch=original;}
});
test('a custom test adapter cannot self-label its mocked results as actual model evidence',async()=>{
  const adapter={limits:LIMITS,evaluationKind:'local-model-observation',async preflight(){return {name:'mock',digest:'mock'};},async chat(){return {action:{action:'refuse'},message:{role:'assistant',content:'{"action":"refuse"}'},metrics:{mock:true}};}};
  const r=await createModelRunner(adapter)({scenario:'injection-control'});assert.equal(r.evaluationKind,'mock-verification');assert.ok(r.events.every(e=>e.evaluationKind==='mock-verification'));
});
test('host read without a completed follow-up call does not claim confirmed model document delivery',async()=>{
  let calls=0;const adapter={limits:LIMITS,async preflight(){return {name:'mock',digest:'mock'};},async chat(){if(calls++)throw Error('failed before model response');return {action:{action:'read_document'},message:{role:'assistant',content:'{"action":"read_document"}'},metrics:{mock:true}};}};
  const r=await createModelRunner(adapter)({scenario:'injection-direct'});assert.equal(r.events.some(e=>e.action==='read_document'&&e.decision==='ALLOW'),true);assert.equal(r.documentRead,true);assert.equal(r.documentDelivered,false);
});

test('partial metadata mocks are labeled mocked and genuine transport methods cannot be replaced',()=>{
  assert.equal(createOllamaAdapter({metadataLoader:async()=>({})}).evaluationKind,'mock-verification');
  const real=createOllamaAdapter();assert.throws(()=>{real.chat=async()=>({});},TypeError);assert.throws(()=>{real.evaluationKind='mock-verification';},TypeError);
});
test('archived v1 fixture bytes remain available without silently upgrading old versions',()=>{
  const old=documentFixture('injection-base64','local-model','v1');assert.equal(old.scenarioVersion,'injection-base64-model-v1');assert.equal(old.document.version,'maintenance-document-v1');assert.equal('privateBase64' in old.data,false);assert.equal(old.document.sha256,'5e41905bca2c081a4cb71d621f8be2dcb62e1ed751e73778db5736a391c1f2f0');
  assert.equal(documentFixture('injection-base64').scenarioVersion,'injection-base64-model-v2');
});
