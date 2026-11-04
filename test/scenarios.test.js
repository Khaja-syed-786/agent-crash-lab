import test from 'node:test';
import assert from 'node:assert/strict';
import {runExperiment,verifyEvents,scenarios} from '../engine.js';
import {evaluatePublications} from '../evaluator.js';
import {comparisonFor,evidenceFor} from '../public/comparison.js';
import {createServer} from '../server.js';

for(const scenario of scenarios){
  for(const mode of ['baseline','protected']){
    test(`${scenario} / ${mode}: independent outcome and gateway decisions`,()=>{
      const r=runExperiment(mode,scenario);
      const blocked=mode==='protected' && scenario==='direct-leak';
      const leak=scenario!=='public-summary' && !blocked;
      assert.equal(r.scenario,scenario);
      assert.equal(r.execution,'scripted-fixture');
      assert.equal(r.policyVersion,'exact-marker-v1');
      assert.equal(r.blockedAttempts,blocked?1:0);
      assert.deepEqual(r.events.filter(e=>e.action==='publish').map(e=>e.decision),blocked?['BLOCK','ALLOW']:['ALLOW']);
      assert.equal(r.taskCompleted,true);
      assert.equal(r.evaluation.leakDetected,leak);
      assert.equal(r.leakDetected,r.evaluation.leakDetected);
      assert.deepEqual(r.evaluation.findings,leak?[{publicationIndex:0,representation:scenario==='base64-leak'?'base64':'raw'}]:[]);
      assert.equal(r.publications.length,1);
      assert.equal(verifyEvents(r.events),true);
    });
  }
}
test('evaluator checks published text independently, including both representations',()=>{
  const marker='CUSTOMER-DEMO-042', encoded='Q1VTVE9NRVItREVNTy0wNDI=';
  assert.deepEqual(evaluatePublications(['Service maintenance is scheduled for Sunday.']).findings,[]);
  assert.deepEqual(evaluatePublications([marker,encoded,marker+' '+encoded]).findings,[
    {publicationIndex:0,representation:'raw'}, {publicationIndex:1,representation:'base64'},
    {publicationIndex:2,representation:'raw'}, {publicationIndex:2,representation:'base64'}
  ]);
  assert.equal(evaluatePublications([]).leakDetected,false);
});
test('unsupported scenarios fail closed',()=>{
  for(const scenario of ['unknown','',null,{},['direct-leak']])assert.throws(()=>runExperiment('protected',scenario),/Unsupported scenario/);
});
test('comparisons and exported evidence cannot pair different scenarios',()=>{
  const direct=runExperiment('baseline','direct-leak');
  const encoded=runExperiment('protected','base64-leak');
  const publicRun=runExperiment('baseline','public-summary');
  const runs=[encoded,publicRun,direct];
  assert.deepEqual(comparisonFor(runs,'direct-leak'),{scenario:'direct-leak',baseline:direct,protected:null});
  assert.deepEqual(comparisonFor(runs,'base64-leak'),{scenario:'base64-leak',baseline:null,protected:encoded});
  const newer=runExperiment('baseline','direct-leak');runs.unshift(newer);
  assert.equal(comparisonFor(runs,'direct-leak').baseline.id,newer.id);
  // Selecting an older history item must still export only its own scenario.
  const evidence=JSON.parse(JSON.stringify(evidenceFor(runs,direct)));
  assert.equal(evidence.selectedRun.id,direct.id);
  assert.equal(evidence.comparison.baseline.id,newer.id);
  assert.equal(evidence.comparison.protected,null);
  const encodedEvidence=evidenceFor(runs,encoded);
  assert.equal(encodedEvidence.execution,'scripted-fixture');
  assert.equal(encodedEvidence.comparison.baseline,null);
  assert.equal(encodedEvidence.selectedRun.evaluation.findings[0].representation,'base64');
  assert.equal(encodedEvidence.selectedRun.events.filter(e=>e.decision==='BLOCK').length,0);
  assert.throws(()=>evidenceFor(runs,null));
});
test('HTTP scenario selection, validation, history and dashboard assets',async t=>{
  const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>s.close(r)));
  const base=`http://127.0.0.1:${s.address().port}`;
  const headers={Origin:base,'X-Lab-Request':'1','Content-Type':'application/json'};
  const post=body=>fetch(base+'/api/run',{method:'POST',headers,body:JSON.stringify(body)});
  for(const scenario of scenarios){
    const res=await post({mode:'protected',scenario});assert.equal(res.status,200);
    const r=await res.json();assert.equal(r.scenario,scenario);
    assert.equal(r.evaluation.leakDetected,scenario==='base64-leak');
  }
  for(const scenario of ['unknown',null,42])assert.equal((await post({mode:'protected',scenario})).status,400);
  assert.equal((await(await fetch(base+'/api/runs')).json()).length,3);
  const html=await(await fetch(base)).text();
  for(const scenario of scenarios)assert.ok(html.includes(`value="${scenario}"`));
  assert.ok(html.includes('type="module"'));
  assert.equal((await fetch(base+'/comparison.js')).status,200);
  assert.equal((await fetch(base+'/evaluator.js')).status,404);
});
