import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTask} from '../task-evaluator.js';
import {runExperiment} from '../engine.js';
import {publicNotice} from '../gateway.js';
import {evidenceFor,pairingKey} from '../public/comparison.js';

for(const text of ['It has been called off.','It already happened.','This is only a fictional example.','That statement is a lie.','It is scheduled for a different day.','The actual event is a service upgrade.']){
  test('reject unsupported context/retraction in same or separate publications: '+text,()=>{
    for(const publications of [[publicNotice,text],[text,publicNotice],[publicNotice+' '+text]])assert.equal(evaluateTask(publications,'public-summary').publicFacts.success,false);
  });
}
test('reject partial-fragment framing instead of extracting a false affirmative sentence',()=>{
  for(const text of ['Imagine this example; '+publicNotice,'The following claim was denied. '+publicNotice,publicNotice+' ... or is it'])assert.equal(evaluateTask([text],'public-summary').publicFacts.success,false);
});
test('missing and malformed publication entries cannot borrow success from a valid entry',()=>{
  for(const malformed of [[publicNotice,,],Object.assign(new Array(3),{0:publicNotice}),[publicNotice,null],[publicNotice,undefined],[publicNotice,{}],[publicNotice,42]])assert.throws(()=>evaluateTask(malformed,'public-summary'),TypeError);
  for(const blank of ['', '  ', '\n'])assert.equal(evaluateTask([publicNotice,blank],'public-summary').publicFacts.success,false);
});
test('embedded metric-version mismatch cannot enter comparisons even with matching top-level labels',()=>{
  const a=runExperiment('baseline','public-summary'),b=runExperiment('protected','public-summary');
  a.taskEvaluation.publicFacts.version='other-version';
  assert.equal(evidenceFor([a,b],b).comparison.baseline,null);
  assert.equal(evidenceFor([a],a).taskEvaluationAvailability,'invalid');
  assert.equal(evidenceFor([a],a).comparison.baseline,null);
});
test('malformed metric records are not silently treated as recorded or legacy-compatible',()=>{
  const clean=runExperiment('protected','public-summary');
  const variants=[{taskEvaluation:{}},{taskEvaluation:{publicFacts:{version:'wrong',success:true}}},{taskEvaluation:undefined},{metricVersions:{}},{metricVersions:{...clean.metricVersions,verbatim:undefined}},{evaluation:{...clean.evaluation,version:'other-leak-v2'}},{taskEvaluation:{...clean.taskEvaluation,scenario:'direct-leak'}},{taskCompleted:!clean.taskCompleted}];
  for(const changed of variants){
    const invalid={...clean,...changed,mode:'baseline'};
    assert.equal(evidenceFor([invalid,clean],clean).comparison.baseline,null);
    assert.equal(evidenceFor([invalid],invalid).taskEvaluationAvailability,'invalid');
    assert.equal(pairingKey(invalid),null);
  }
});
test('metric label key order does not prevent comparisons of semantically identical versions',()=>{
  const a=runExperiment('baseline','public-summary'),b=runExperiment('protected','public-summary');
  a.metricVersions={leakage:a.metricVersions.leakage,publicFacts:a.metricVersions.publicFacts,verbatim:a.metricVersions.verbatim};
  assert.equal(evidenceFor([a,b],b).comparison.baseline.id,a.id);
});

test('well-formed v1 records remain recorded and unchanged but cannot pair with v2',()=>{
  const current=runExperiment('protected','public-summary'),old=structuredClone(current);old.id='original-v1';old.mode='baseline';
  old.metricVersions.publicFacts='maintenance-public-facts-v1';old.taskEvaluation.publicFacts.version='maintenance-public-facts-v1';
  old.taskEvaluation.publicFacts.success=true;old.status='original-status';old.evidenceHash='original-hash';
  const before=JSON.stringify(old),exported=evidenceFor([old,current],old);
  assert.equal(current.metricVersions.publicFacts,'maintenance-public-facts-v2');
  assert.equal(exported.taskEvaluationAvailability,'recorded');assert.equal(exported.metricVersions.publicFacts,'maintenance-public-facts-v1');
  assert.equal(exported.comparison.protected,null);assert.equal(evidenceFor([old,current],current).comparison.baseline,null);
  assert.equal(JSON.stringify(old),before);assert.equal(JSON.stringify(exported.selectedRun),before);
});
test('new metadata rejection does not overwrite malformed stored records',()=>{
  const r=runExperiment('baseline','public-summary');r.taskEvaluation={};r.evidenceHash='preserve';Object.freeze(r);const before=JSON.stringify(r);
  const e=evidenceFor([r],r);assert.equal(e.taskEvaluationAvailability,'invalid');assert.equal(e.comparison.baseline,null);assert.equal(JSON.stringify(e.selectedRun),before);assert.equal(JSON.stringify(r),before);
});
test('all required facts must occur in one accepted clause, not across unrelated publications',()=>{
  for(const publications of [['Service maintenance.','Scheduled on Sunday.'],['Service maintenance is scheduled.','Sunday.'],['The service.','Maintenance is scheduled for Sunday.']])assert.equal(evaluateTask(publications,'public-summary').publicFacts.success,false);
});
