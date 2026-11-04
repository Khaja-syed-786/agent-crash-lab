import test from 'node:test';
import assert from 'node:assert/strict';
import {runExperiment,verifyEvents,scenarios,policies} from '../engine.js';
import {evaluatePublications} from '../evaluator.js';
import {comparisonFor,evidenceFor} from '../public/comparison.js';
import {createServer} from '../server.js';

for(const policy of policies)for(const scenario of scenarios)for(const mode of ['baseline','protected']){
  test(`${policy} / ${scenario} / ${mode}: policy and evaluator matrix`,()=>{
    const r=runExperiment(mode,scenario,policy);
    const blocked=mode==='protected'&&(scenario==='direct-leak'||(scenario==='base64-leak'&&policy==='raw-base64-fixture-v1'));
    assert.equal(r.policyVersion,policy);
    assert.equal(r.blockedAttempts,blocked?1:0);
    assert.deepEqual(r.events.filter(e=>e.action==='publish').map(e=>e.decision),blocked?['BLOCK','ALLOW']:['ALLOW']);
    assert.equal(r.taskCompleted,true);
    assert.equal(r.publications.length,1);
    if(blocked||scenario==='public-summary')assert.deepEqual(r.publications,['Service maintenance is scheduled for Sunday.']);
    assert.equal(r.evaluation.leakDetected,scenario!=='public-summary'&&!blocked);
    assert.deepEqual(r.evaluation,evaluatePublications(r.publications));
    assert.equal(verifyEvents(r.events),true);
    for(const event of r.events){assert.equal(event.policyVersion,policy);assert.equal(event.mode,mode);assert.equal(event.scenario,scenario);}
    const evidence=JSON.parse(JSON.stringify(evidenceFor([r],r)));
    assert.equal(evidence.schemaVersion,3);
    assert.equal(evidence.policyVersion,policy);
    assert.equal(evidence.scenario,scenario);
    assert.equal(evidence.comparison.policyVersion,policy);
    assert.equal(evidence.comparison[mode].id,r.id);
    assert.equal(evidence.comparison[mode==='baseline'?'protected':'baseline'],null);
  });
}
test('comparisons and evidence isolate policy as well as scenario',()=>{
  const exactBaseline=runExperiment('baseline','base64-leak','exact-marker-v1');
  const targetedProtected=runExperiment('protected','base64-leak','raw-base64-fixture-v1');
  const otherScenario=runExperiment('baseline','direct-leak','raw-base64-fixture-v1');
  const exactProtected=runExperiment('protected','base64-leak','exact-marker-v1');
  const targetedBaseline=runExperiment('baseline','base64-leak','raw-base64-fixture-v1');
  const runs=[otherScenario,targetedProtected,exactBaseline];
  assert.equal(comparisonFor(runs,'base64-leak','raw-base64-fixture-v1').baseline,null);
  assert.equal(comparisonFor(runs,'base64-leak','exact-marker-v1').protected,null);
  runs.unshift(exactProtected,targetedBaseline);
  for(const selected of [exactBaseline,targetedProtected]){
    const evidence=evidenceFor(runs,selected);
    for(const r of [evidence.comparison.baseline,evidence.comparison.protected]){
      assert.equal(r.scenario,selected.scenario);assert.equal(r.policyVersion,selected.policyVersion);
    }
  }
  assert.equal(evidenceFor(runs,exactProtected).selectedRun.evaluation.leakDetected,true);
  assert.equal(evidenceFor(runs,targetedProtected).selectedRun.evaluation.leakDetected,false);
});
test('policy identifiers are covered by the event hash chain',()=>{
  const r=runExperiment('protected','base64-leak','raw-base64-fixture-v1');
  r.events[0].policyVersion='exact-marker-v1';assert.equal(verifyEvents(r.events),false);
});
test('unsupported policy values fail closed',()=>{
  for(const policy of ['unknown','',null,{},['exact-marker-v1']])assert.throws(()=>runExperiment('protected','direct-leak',policy),/Unsupported policy/);
});
test('HTTP policy matrix, validation, default compatibility and retained history',async t=>{
  const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
  const base=`http://127.0.0.1:${s.address().port}`;
  const headers={Origin:base,'X-Lab-Request':'1','Content-Type':'application/json'};
  const post=body=>fetch(base+'/api/run',{method:'POST',headers,body:JSON.stringify(body)});
  for(const policyVersion of policies)for(const scenario of scenarios)for(const mode of ['baseline','protected']){
    const response=await post({mode,scenario,policyVersion});assert.equal(response.status,200);
    const r=await response.json();assert.equal(r.policyVersion,policyVersion);
    const blocked=mode==='protected'&&(scenario==='direct-leak'||(scenario==='base64-leak'&&policyVersion==='raw-base64-fixture-v1'));
    assert.equal(r.blockedAttempts,blocked?1:0);assert.equal(r.taskCompleted,true);
    assert.equal(r.evaluation.leakDetected,scenario!=='public-summary'&&!blocked);
    assert.ok(r.events.every(e=>e.policyVersion===policyVersion));
  }
  for(const policyVersion of ['unknown',null,42])assert.equal((await post({mode:'protected',policyVersion})).status,400);
  const defaultRun=await(await post({mode:'protected'})).json();
  assert.equal(defaultRun.policyVersion,'exact-marker-v1');assert.equal(defaultRun.scenario,'direct-leak');
  const history=await(await fetch(base+'/api/runs')).json();assert.equal(history.length,13);
  for(const policy of policies)for(const scenario of scenarios){
    const evidence=evidenceFor(history,history.find(r=>r.policyVersion===policy&&r.scenario===scenario));
    assert.ok(evidence.comparison.baseline&&evidence.comparison.protected);
    assert.ok([evidence.comparison.baseline,evidence.comparison.protected].every(r=>r.policyVersion===policy&&r.scenario===scenario));
  }
});
