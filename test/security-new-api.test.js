// NEW-API AND NEW-FIELD TESTS for the remediation. On base 6981b53 these fail because the exports or fields do not exist yet;
// that is expected and is NOT evidence of the original defects (see test/security-defect-repro.test.js for those).
// Mock adapters only; loopback/ephemeral listeners only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createOllamaAdapter,environmentProxyActive,validateChatResponse,STATUS_TAXONOMY_VERSION,MODEL,MODEL_DIGEST} from '../ollama.js';
import {createModelRunner} from '../model-runner.js';
import {runEvaluationBatch,buildEvaluationPlan,SUMMARY_VERSION} from '../evaluation-runner.js';
import {verifyRunEvidence,publicNotice,marker,hash} from '../gateway.js';
import {assertPackageVersion} from '../scripts/release-tag.js';
import {measureHandoffs,HANDOFF_MEASUREMENT_VERSION} from '../handoff-evaluator.js';
import {measureWriterInput,WRITER_INPUT_VERSION} from '../writer-input-evaluator.js';

const json=data=>new Response(JSON.stringify(data));
const tags=()=>json({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]});
const envelope=(action,extra={})=>({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(action)},...extra});
function mockAdapter(chat,{version=()=>'MOCK'}={}){
  let step=0,trial=-1;
  return createOllamaAdapter({metadataLoader:async()=>({manifestDigest:MODEL_DIGEST}),fetchImpl:async url=>url.endsWith('/api/version')?(step=0,trial++,json({version:version(trial)})):url.endsWith('/api/tags')?tags():chat(step++,trial)});
}
const SAFE=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
function memoryStore(){return {async initialize(){},async checkpoint(){},async saveTrial(t){return `mock-${t.index}.json`;}};}

// ---- F2: proxy contract (pure function) ----
const P='http://127.0.0.1:9',E={NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P};
// [case, env, refuse]. Every row Node 22.23 routed via the proxy (docs/security/artifacts/node-env-proxy-matrix.md) must refuse.
const MATRIX=[
  ['default environment',{},false],['HTTP_PROXY without env-proxy support',{HTTP_PROXY:P},false],
  ['env-proxy + HTTPS_PROXY only (endpoint is http:)',{NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:P},false],
  ['env-proxy + HTTP_PROXY',E,true],['env-proxy + http_proxy',{NODE_USE_ENV_PROXY:'1',http_proxy:P},true],
  ['NODE_OPTIONS=--use-env-proxy + HTTP_PROXY',{NODE_OPTIONS:'--use-env-proxy',HTTP_PROXY:P},true],
  ['NO_PROXY=127.0.0.1',{...E,NO_PROXY:'127.0.0.1'},false],['no_proxy=127.0.0.1',{...E,no_proxy:'127.0.0.1'},false],
  ['NO_PROXY=127.0.0.1:11434',{...E,NO_PROXY:'127.0.0.1:11434'},false],['NO_PROXY=*',{...E,NO_PROXY:'*'},false],
  ['NO_PROXY with surrounding spaces',{...E,NO_PROXY:' 127.0.0.1 '},false],['NO_PROXY comma list',{...E,NO_PROXY:'example.test,127.0.0.1'},false],
  ['NO_PROXY whitespace list',{...E,NO_PROXY:'example.test 127.0.0.1'},false],
  ['NO_PROXY=localhost does not cover 127.0.0.1',{...E,NO_PROXY:'localhost'},true],['NO_PROXY CIDR is not honoured by Node',{...E,NO_PROXY:'127.0.0.0/8'},true],
  ['NO_PROXY for another port',{...E,NO_PROXY:'127.0.0.1:9999'},true],['empty no_proxy overrides NO_PROXY',{...E,no_proxy:'',NO_PROXY:'127.0.0.1'},true],
  ['lowercase no_proxy overrides NO_PROXY',{...E,no_proxy:'localhost',NO_PROXY:'127.0.0.1'},true],
  ['suffix token: conservative refusal (Node goes direct)',{...E,NO_PROXY:'.0.0.1'},true],
  ['empty http_proxy + HTTP_PROXY: conservative refusal (Node goes direct)',{NODE_USE_ENV_PROXY:'1',http_proxy:'',HTTP_PROXY:P},true],
];
for(const [name,env,refuse] of MATRIX)test(`F2 contract: ${name} -> ${refuse?'refuse':'allow'}`,()=>assert.equal(environmentProxyActive(env,[]),refuse));
test('F2 contract: --use-env-proxy in execArgv counts as enabled',()=>{
  assert.equal(environmentProxyActive({HTTP_PROXY:P},['--use-env-proxy']),true);
  assert.equal(environmentProxyActive({HTTP_PROXY:P,NO_PROXY:'127.0.0.1'},['--use-env-proxy']),false);
});

// ---- F2: Node routing assumption + adapter gate in a real child process ----
function listen(handler){return new Promise(resolve=>{const s=http.createServer(handler);s.listen(0,'127.0.0.1',()=>resolve(s));});}
function child(args,env){return new Promise(resolve=>{let out='';const c=spawn(process.execPath,args,{env:{PATH:process.env.PATH,...env},stdio:['ignore','pipe','pipe']});c.stdout.on('data',d=>out+=d);c.on('exit',code=>resolve({code,out}));});}
const FETCH=url=>`fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(2500)}).then(r=>r.text()).catch(()=>{}).finally(()=>process.exit(0))`;
test('F2: Node routing assumption behind the bypass rule (ephemeral loopback port, never 11434)',async t=>{
  const hits={proxy:0,direct:0};
  const proxy=await listen((q,s)=>{hits.proxy++;s.end('{}');});proxy.on('connect',(q,sock)=>{hits.proxy++;sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  const direct=await listen((q,s)=>{hits.direct++;s.end('ok');});
  const proxyUrl='http://127.0.0.1:'+proxy.address().port,url='http://127.0.0.1:'+direct.address().port+'/';
  const delta=async env=>{const before={...hits};await child(['-e',FETCH(url)],{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:proxyUrl,...env});return {proxy:hits.proxy-before.proxy,direct:hits.direct-before.direct};};
  try{
    const none=await delta({});if(none.proxy===0)return t.skip('this Node build does not honour NODE_USE_ENV_PROXY');
    assert.deepEqual(await delta({NO_PROXY:'127.0.0.1'}),{proxy:0,direct:1});
    assert.deepEqual(await delta({NO_PROXY:'localhost'}),{proxy:1,direct:0});
    // Windows cannot represent distinct uppercase/lowercase environment keys in a child.
    if(process.platform!=='win32')assert.deepEqual(await delta({no_proxy:'',NO_PROXY:'127.0.0.1'}),{proxy:1,direct:0});
    else assert.deepEqual(await delta({no_proxy:'localhost'}),{proxy:1,direct:0});
  }finally{proxy.close();direct.close();}
});
// A recording global fetch is installed before ollama.js loads, so the adapter treats it as the built-in fetch.
const ADAPTER=`const calls=[];const j=d=>new Response(JSON.stringify(d));
globalThis.fetch=async url=>{calls.push(url);return url.endsWith('/api/version')?j({version:'MOCK'}):j({models:[]});};
const {createOllamaAdapter,createTranscript}=await import(${JSON.stringify(new URL('../ollama.js',import.meta.url).href)});
let message='no error';try{await createOllamaAdapter({metadataLoader:async()=>({})}).preflight({deadline:Date.now()+2000,remainingMs:()=>2000,ledger:createTranscript(65536)});}catch(e){message=e.message;}
console.log(JSON.stringify({message,calls}));`;
const runAdapter=async env=>{const r=await child(['--input-type=module','-e',ADAPTER],env);assert.equal(r.code,0);return JSON.parse(r.out.trim().split('\n').at(-1));};
test('F2: adapter refuses before any transport call without a bypass, and when lowercase no_proxy masks NO_PROXY',async()=>{
  for(const env of [{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P},process.platform==='win32'?{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P,no_proxy:'localhost'}:{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P,no_proxy:'',NO_PROXY:'127.0.0.1'}]){
    const r=await runAdapter(env);assert.match(r.message,/Environment proxy enabled without a NO_PROXY bypass/);assert.deepEqual(r.calls,[]);
  }
});
test('F2: adapter proceeds when NO_PROXY=127.0.0.1 or no_proxy=127.0.0.1:11434 (documented operator bypass)',async()=>{
  for(const extra of [{NO_PROXY:'127.0.0.1'},{no_proxy:'127.0.0.1:11434'}]){
    const r=await runAdapter({NODE_USE_ENV_PROXY:'1',HTTP_PROXY:P,...extra});
    assert.doesNotMatch(r.message,/proxy/i);assert.equal(r.calls[0],'http://127.0.0.1:11434/api/version');
  }
});

// ---- F6: unsigned consistency helper ----
test('F6: verifyRunEvidence detects edits/truncation relative to the recorded hash (unsigned consistency only)',async()=>{
  const outputs=[...SAFE.slice(0,2),{action:'publish',text:publicNotice+' '+marker}];
  const r=await createModelRunner(mockAdapter(()=>json(envelope(outputs.shift()))))({mode:'baseline',scenario:'direct-leak'});
  assert.equal(verifyRunEvidence(r),true);
  const edited=structuredClone(r);edited.publications=[publicNotice];edited.leakDetected=false;assert.equal(verifyRunEvidence(edited),false);
  const truncated=structuredClone(r);truncated.events=truncated.events.slice(0,-1);assert.equal(verifyRunEvidence(truncated),false);
  const {evidenceHash,...missing}=r;assert.equal(verifyRunEvidence(missing),false);
  // A party who recomputes the hash over consistent edits passes: this is not authenticity.
  const recomputed=structuredClone(r);recomputed.publications=[publicNotice];const {evidenceHash:_,...body}=recomputed;recomputed.evidenceHash=hash(body);assert.equal(verifyRunEvidence(recomputed),true);
});

// ---- CI-1 ----
test('CI-1: assertPackageVersion matches core+prerelease and ignores build metadata',()=>{
  for(const [tag,version] of [['v0.1.0','0.1.0'],['v0.2.0-rc.1','0.2.0-rc.1'],['v0.2.0+build.1','0.2.0'],['v0.2.0','0.2.0+local']])assert.doesNotThrow(()=>assertPackageVersion(tag,version));
  for(const [tag,version] of [['v9.9.9','0.1.0'],['v0.1.0-rc.1','0.1.0'],['v0.1.0','0.1.0-rc.1'],['v0.1.0',undefined],['v0.1.0','v0.1.0']])assert.throws(()=>assertPackageVersion(tag,version),/does not match package\.json/);
});

// ---- F8: transport delivery vs validated-model delivery ----
test('F8: validateChatResponse is the adapter envelope contract',()=>{
  assert.doesNotThrow(()=>validateChatResponse(envelope({action:'refuse'})));
  assert.throws(()=>validateChatResponse(envelope({action:'refuse'},{model:'other:latest'})),/identity mismatch/);
  assert.throws(()=>validateChatResponse(envelope({action:'refuse'},{done_reason:'length'})),/token accounting/);
});
test('F8: handoff delivery to a writer whose response fails identity is transport-delivered but not model-validated',async()=>{
  assert.equal(HANDOFF_MEASUREMENT_VERSION,'handoff-text-v3');
  const outputs=[...SAFE];
  const r=await createModelRunner(mockAdapter(step=>json(envelope(outputs.shift(),step===2?{model:'impostor:latest'}:{}))))({mode:'baseline',scenario:'handoff-control'});
  assert.equal(r.status,'runtime_failure');
  assert.equal(r.handoffMeasurement.deliveredRecords.length,1,'v2 transport-delivery meaning is preserved');
  assert.equal(r.handoffMeasurement.deliveredRecords[0].modelValidated,false);assert.equal(r.handoffMeasurement.validatedModelDeliveryCount,0);
  const ok=[...SAFE],good=await createModelRunner(mockAdapter(()=>json(envelope(ok.shift()))))({mode:'baseline',scenario:'handoff-control'});
  assert.equal(good.handoffMeasurement.deliveredRecords[0].modelValidated,true);assert.equal(good.handoffMeasurement.validatedModelDeliveryCount,1);
});
test('F8: writer-boundary input with an identity-mismatched response is confirmed (transport) but not model-validated',async()=>{
  assert.equal(WRITER_INPUT_VERSION,'host-writer-input-v2');
  const r=await createModelRunner(mockAdapter(()=>json(envelope({action:'publish',text:publicNotice},{model:'impostor:latest'}))),{writerBoundary:true})({mode:'baseline',scenario:'writer-control'});
  assert.equal(r.status,'runtime_failure');
  assert.equal(r.writerInput.confirmedDeliveries.length,1,'v1 transport-delivery meaning is preserved');
  assert.equal(r.writerInput.confirmedDeliveries[0].modelValidated,false);assert.equal(r.writerInput.validatedModelDeliveryCount,0);
  assert.equal(measureWriterInput([],'x').validatedModelDeliveryCount,0);assert.equal(measureHandoffs([]).validatedModelDeliveryCount,0);
});
test('F8: writer-boundary pairs report model-validated input separately from transport confirmation',async()=>{
  const b=await runEvaluationBatch({adapter:mockAdapter(()=>json(envelope({action:'publish',text:publicNotice}))),store:memoryStore(),experiment:'writer-boundary'});
  assert(b.pairs.every(p=>p.bothWriterInputsConfirmed===true&&p.bothWriterInputsModelValidated===true));
});

// ---- F9: integrity-rejected outcomes ----
test('F9: an observation saved before a failed context check is recorded but not counted as validated',async()=>{
  const outputs=()=>[...SAFE];let queue=outputs();
  const adapter=mockAdapter(step=>{if(step===0)queue=outputs();return json(envelope(queue.shift()));},{version:trial=>trial===0?'MOCK-A':'MOCK-B'});
  const b=await runEvaluationBatch({adapter,store:memoryStore()});
  assert.match(b.error,/Initial execution context changed/);
  assert.equal(b.summary.summaryVersion,SUMMARY_VERSION);assert.equal(SUMMARY_VERSION,'pilot-summary-v2');
  assert.equal(b.summary.outcomesRecorded,2,'v1 meaning preserved: trials with saved observations');
  assert.equal(b.summary.validatedOutcomes,1);assert.equal(b.summary.integrityRejectedOutcomes,1);assert.equal(b.summary.comparableOutcomes,1);
  assert.deepEqual(b.trials.slice(0,2).map(t=>t.integrity),['validated','rejected']);assert.match(b.trials[1].integrityError,/context changed/);
  const condition=b.summary.conditions.find(c=>c.scenario===b.trials[1].settings.scenario&&c.mode===b.trials[1].settings.mode);
  assert.equal(condition.integrityRejectedOutcomes,1);assert.equal(condition.validatedOutcomes,0);
});

// ---- F10: versioned status taxonomy ----
test('F10: runs and plans carry the status taxonomy version and the batch enforces it',async()=>{
  assert.equal(STATUS_TAXONOMY_VERSION,'trial-status-v2');
  assert.equal(buildEvaluationPlan().statusTaxonomyVersion,STATUS_TAXONOMY_VERSION);
  const outputs=[...SAFE],r=await createModelRunner(mockAdapter(()=>json(envelope(outputs.shift()))))({mode:'baseline'});
  assert.equal(r.statusTaxonomyVersion,STATUS_TAXONOMY_VERSION);
});
