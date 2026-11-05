// ORIGINAL-DEFECT REPRODUCTIONS. Imports only APIs that already exist at base 6981b53, so on the base every failure here is
// the defect itself (behaviour), never a missing export. All model traffic is a labelled mock or a loopback stand-in;
// nothing contacts a runtime at 127.0.0.1:11434. F6 is reproduced by test/security-pair-cli.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createOllamaAdapter,MODEL,MODEL_DIGEST} from '../ollama.js';
import {createModelRunner} from '../model-runner.js';
import {loadInstalledModel} from '../installed-model.js';
import {runEvaluationBatch} from '../evaluation-runner.js';
import {publicNotice} from '../gateway.js';

const repo=fileURLToPath(new URL('..',import.meta.url));
const json=data=>new Response(JSON.stringify(data));
const tags=()=>json({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]});
const reply=(action,extra={})=>json({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(action),...extra}});
function mockAdapter(chat){
  let step=0;
  return createOllamaAdapter({metadataLoader:async()=>({manifestDigest:MODEL_DIGEST}),fetchImpl:async(url,o)=>url.endsWith('/api/version')?(step=0,json({version:'MOCK'})):url.endsWith('/api/tags')?tags():chat(step++,o)});
}
const SAFE=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
function memoryStore(){return {async initialize(){},async checkpoint(){},async saveTrial(t){return `mock-${t.index}.json`;}};}
function listen(handler){return new Promise(resolve=>{const s=http.createServer(handler);s.listen(0,'127.0.0.1',()=>resolve(s));});}
function child(args,env){return new Promise(resolve=>{let out='';const c=spawn(process.execPath,args,{env:{PATH:process.env.PATH,...env},stdio:['ignore','pipe','pipe']});c.stdout.on('data',d=>out+=d);c.on('exit',code=>resolve({code,out}));});}

test('F1: recorded source commit identifies the executing code, not the caller cwd',async t=>{
  let expected;try{expected=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{return t.skip('not a git checkout');}
  const dir=await mkdtemp(join(tmpdir(),'acl-cwd-'));
  try{
    execFileSync('git',['init','-q'],{cwd:dir});
    execFileSync('git',['-c','user.email=test@example.invalid','-c','user.name=test','commit','-q','--allow-empty','-m','unrelated'],{cwd:dir});
    const script=`import {createOllamaAdapter,MODEL,MODEL_DIGEST} from ${JSON.stringify(new URL('../ollama.js',import.meta.url).href)};
import {createModelRunner} from ${JSON.stringify(new URL('../model-runner.js',import.meta.url).href)};
const j=d=>new Response(JSON.stringify(d));
const a=createOllamaAdapter({metadataLoader:async()=>({}),fetchImpl:async u=>u.endsWith('/api/version')?j({version:'MOCK'}):u.endsWith('/api/tags')?j({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]}):j({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:'{"action":"refuse"}'}})});
console.log(JSON.stringify((await createModelRunner(a)({mode:'baseline'})).source));`;
    const out=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,encoding:'utf8'});
    assert.equal(out.status,0,out.stderr);
    assert.equal(JSON.parse(out.stdout.trim().split('\n').at(-1)).commit,expected);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('F2: with env-proxy + HTTP_PROXY and no NO_PROXY, no runtime request reaches the proxy (real built-in fetch)',async t=>{
  const hits={proxy:0,probe:0};
  const proxy=await listen((q,s)=>{hits.proxy++;s.end('{}');});proxy.on('connect',(q,sock)=>{hits.proxy++;sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  const probe=await listen((q,s)=>{hits.probe++;s.end('ok');});
  const proxyUrl='http://127.0.0.1:'+proxy.address().port;
  try{
    // Capability probe on an ephemeral port: skip where this Node build ignores NODE_USE_ENV_PROXY.
    await child(['-e',`fetch('http://127.0.0.1:${probe.address().port}/',{signal:AbortSignal.timeout(2500)}).catch(()=>{}).finally(()=>process.exit(0))`],{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:proxyUrl});
    if(hits.proxy===0)return t.skip('this Node build does not honour NODE_USE_ENV_PROXY');
    hits.proxy=0;
    // The stand-in proxy answers CONNECT with 502, so even on unpatched code nothing reaches 127.0.0.1:11434.
    const script=`const {createOllamaAdapter,createTranscript}=await import(${JSON.stringify(new URL('../ollama.js',import.meta.url).href)});
try{await createOllamaAdapter({metadataLoader:async()=>({})}).preflight({deadline:Date.now()+2500,remainingMs:()=>2500,ledger:createTranscript(65536)});}catch(e){console.log(e.message);}`;
    await child(['--input-type=module','-e',script],{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:proxyUrl});
    assert.equal(hits.proxy,0,'the fixed loopback endpoint was tunnelled through the environment proxy');
  }finally{proxy.close();probe.close();}
});

test('F3: metadata checksums cover raw bytes, so lossy-UTF-8-equivalent bytes are rejected',async()=>{
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const root=await mkdtemp(join(tmpdir(),'acl-models-'));
  try{
    const files=new Map(),put=b=>{const d=sha(b);files.set(join(root,'blobs','sha256-'+d),b);return {digest:'sha256:'+d,size:b.length};};
    const config=put(Buffer.from(JSON.stringify({model_format:'gguf'})));
    const genuine=Buffer.from('a�b','utf8'),forged=Buffer.from([0x61,0xF0,0x9F,0x98,0x62]);
    assert.equal(genuine.toString('utf8'),forged.toString('utf8'));assert.notEqual(sha(genuine),sha(forged));
    const template=put(genuine);
    const manifest=Buffer.from(JSON.stringify({config:{mediaType:'application/vnd.docker.container.image.v1+json',...config},layers:[{mediaType:'application/vnd.ollama.image.model',digest:'sha256:'+'0'.repeat(64),size:1},{mediaType:'application/vnd.ollama.image.template',...template}]}));
    files.set(join(root,'manifests/registry.ollama.ai/library/llama3.2/latest'),manifest);
    const readBytes=async path=>{if(!files.has(path))throw Error('missing');return files.get(path);};
    await loadInstalledModel({expectedDigest:sha(manifest),maxBytes:32768,root,readBytes});
    files.set(join(root,'blobs',template.digest.replace(':','-')),forged);
    await assert.rejects(loadInstalledModel({expectedDigest:sha(manifest),maxBytes:32768,root,readBytes}),/checksum mismatch/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('F4: runtime-supplied assistant message fields are not echoed into later requests',async()=>{
  const outputs=[...SAFE];
  const r=await createModelRunner(mockAdapter(()=>reply(outputs.shift(),{images:['QUJD'],thinking:'x'.repeat(3000)})))({mode:'baseline'});
  const calls=r.transcript.filter(x=>x.kind==='model-call');
  assert.equal(calls.length,3);
  for(const call of calls)for(const m of call.request.messages)assert.deepEqual(Object.keys(m).sort(),['content','role']);
  assert.equal(r.status,'safe_completion');
});

test('F5: uncertain cancellation halts every runner sharing the adapter',async()=>{
  const adapter=createOllamaAdapter({limits:{callMs:50},metadataLoader:async()=>({}),fetchImpl:async(url,o)=>url.endsWith('/api/version')?json({version:'MOCK'}):url.endsWith('/api/tags')?tags():new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted'))))});
  const first=await createModelRunner(adapter)({mode:'baseline'});
  assert.equal(first.error.cancellationUncertain,true);
  await assert.rejects(createModelRunner(adapter)({mode:'baseline'}),/halted/);
});

test('F10: an unparseable /api/chat HTTP envelope is a runtime failure, not model invalid_output',async()=>{
  const r=await createModelRunner(mockAdapter(()=>new Response('{"model":"llama3.2:la')))({mode:'baseline'});
  assert.equal(r.status,'runtime_failure');assert.match(r.error.message,/Malformed runtime JSON/);
});
test('F10: model-authored non-JSON content remains invalid_output (unchanged)',async()=>{
  const r=await createModelRunner(mockAdapter(()=>json({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:'not JSON'}})))({mode:'baseline'});
  assert.equal(r.status,'invalid_output');
});
test('F10: a malformed transport envelope stops the batch instead of continuing through all slots',async()=>{
  const b=await runEvaluationBatch({adapter:mockAdapter(()=>new Response('<html>proxy error</html>')),store:memoryStore()});
  assert.equal(b.stopReason,'runtime_failure');assert.equal(b.summary.attempted,1);assert.equal(b.summary.notAttempted,11);
});

test('CI-1: release-tag CLI refuses a well-formed tag that differs from package.json version',()=>{
  const script=fileURLToPath(new URL('../scripts/release-tag.js',import.meta.url));
  const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
  const bad=spawnSync(process.execPath,[script,'v9.9.9'],{encoding:'utf8'});
  assert.notEqual(bad.status,0,'v9.9.9 must be rejected while package.json is '+version);
  assert.equal(bad.stdout,'','no GITHUB_OUTPUT line may be emitted on rejection');
  const good=spawnSync(process.execPath,[script,'v'+version],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);
});
