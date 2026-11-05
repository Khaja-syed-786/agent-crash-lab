// F6 integration: scripts/model-trial.js --pair must reject stale or edited evidence before any runtime contact.
// The CLI runs in a temp cwd with a preload that records (and blocks) every fetch and socket connect, so no runtime is reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createOllamaAdapter,MODEL,MODEL_DIGEST} from '../ollama.js';
import {createModelRunner} from '../model-runner.js';
import {publicNotice,hash} from '../gateway.js';

const CLI=fileURLToPath(new URL('../scripts/model-trial.js',import.meta.url));
const PRELOAD=`import net from 'node:net';import {appendFileSync} from 'node:fs';
const log=what=>appendFileSync(process.env.ACL_CONTACT_LOG,what+'\\n');
globalThis.fetch=async url=>{log('fetch '+url);throw Error('runtime contact blocked by test');};
net.Socket.prototype.connect=function(){log('socket connect');throw Error('socket blocked by test');};`;
const json=d=>new Response(JSON.stringify(d));
// Labelled mock run (mock-verification), never actual inference.
async function mockRun(){
  const outputs=[{action:'read_document'},{action:'handoff',text:publicNotice},{action:'publish',text:publicNotice}];
  const fetchImpl=async url=>url.endsWith('/api/version')?json({version:'MOCK'}):url.endsWith('/api/tags')?json({models:[{name:MODEL,digest:MODEL_DIGEST,details:{format:'gguf'},capabilities:['completion']}]}):json({model:MODEL,done:true,done_reason:'stop',prompt_eval_count:100,eval_count:10,message:{role:'assistant',content:JSON.stringify(outputs.shift())}});
  const run=await createModelRunner(createOllamaAdapter({fetchImpl,metadataLoader:async()=>({manifestDigest:MODEL_DIGEST})}))({mode:'protected'});
  // Fabricated counterpart metadata for CLI validation only, never actual-model evidence.
  run.evaluationKind='local-model-observation';run.model.metadataHashVersion='raw-bytes-v1';
  const {evidenceHash,...body}=run;run.evidenceHash=hash(body);return run;
}
async function runCli(selectedRun){
  const dir=await mkdtemp(join(tmpdir(),'acl-pair-'));
  try{
    await mkdir(join(dir,'results'));
    await writeFile(join(dir,'results','counterpart.json'),JSON.stringify({selectedRun}));
    const contactLog=join(dir,'contacts.log');await writeFile(contactLog,'');
    const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(PRELOAD),CLI,'--mode','baseline','--pair','results/counterpart.json'],
      {cwd:dir,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,ACL_CONTACT_LOG:contactLog}});
    return {status:r.status,stdout:r.stdout,stderr:r.stderr,contacts:(await readFile(contactLog,'utf8')).split('\n').filter(Boolean),results:await readdir(join(dir,'results'))};
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('control: consistent paired evidence is accepted and the CLI proceeds to a (blocked) runtime contact',async()=>{
  const r=await runCli(await mockRun());
  assert.match(r.stdout,/Starting ONE live local Ollama trial/);
  assert.ok(r.contacts.length>0,'the preload must detect runtime contact, otherwise the rejection tests prove nothing');
});
for(const [name,tamper] of [
  ['edited publications with stale evidenceHash',run=>{run.publications=['edited'];run.leakDetected=true;}],
  ['dropped final event with stale evidenceHash',run=>{run.events=run.events.slice(0,-1);}],
  ['legacy counterpart without evidenceHash',run=>{delete run.evidenceHash;}],
  ['recomputed evidenceHash over a broken event chain',run=>{run.events[0].details='edited';const {evidenceHash,...body}=run;run.evidenceHash=hash(body);}],
]){
  test(`--pair rejects ${name} before any runtime contact`,async()=>{
    const run=await mockRun();tamper(run);
    const r=await runCli(run);
    // Behavioural assertions first: on unpatched code these fail because the stale counterpart is accepted and the runtime is contacted.
    assert.deepEqual(r.contacts,[],'no fetch or socket connect may happen');
    assert.doesNotMatch(r.stdout,/Starting ONE live/);
    assert.deepEqual(r.results,['counterpart.json'],'no new evidence file may be written');
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/Pair evidence hash or event chain is inconsistent/);
  });
}

test('review: hash-consistent but incompatible pair is rejected before runtime contact',async()=>{
 const run=await mockRun();run.mode='baseline';const {evidenceHash,...body}=run;run.evidenceHash=hash(body);
 const r=await runCli(run);assert.deepEqual(r.contacts,[]);assert.notEqual(r.status,0);
});

for(const [name,change] of [
 ['seed',r=>{r.generation.seed=102;}],
 ['metric version',r=>{r.metricVersions.publicFacts='different';}],
 ['status version',r=>{delete r.statusTaxonomyVersion;}],
 ['source provenance',r=>{r.source.commit='f'.repeat(40);}],
 ['mock basis',r=>{r.evaluationKind='mock-verification';}],
])test(`review: incompatible ${name} is refused before runtime contact`,async()=>{
 const r=await mockRun();change(r);const {evidenceHash,...body}=r;r.evidenceHash=hash(body);
 const result=await runCli(r);assert.deepEqual(result.contacts,[]);assert.notEqual(result.status,0);assert.match(result.stderr,/Pair evidence context/);
});
