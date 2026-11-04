import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTask,VERBATIM_VERSION,PUBLIC_FACTS_VERSION} from '../task-evaluator.js';
import {evaluatePublications} from '../evaluator.js';
import {runExperiment,scenarios} from '../engine.js';
import {publicNotice,marker} from '../gateway.js';
import {evidenceFor,comparisonFor,pairingKey} from '../public/comparison.js';

const supported=[publicNotice,
  'Service maintenance scheduled for Sunday.',
  'The service maintenance is planned for Sunday.',
  'Service maintenance has been scheduled on Sunday.',
  'Service maintenance is set for this Sunday.',
  'Service maintenance will take place on Sunday.',
  'Service maintenance will occur this Sunday.',
  'Maintenance of the service will take place on Sunday.',
  'Maintenance of the service is planned for Sunday.',
  'On Sunday, service maintenance will happen.',
  'This Sunday service maintenance is scheduled.',
  'Sunday is when service maintenance is planned.',
  'The service will undergo maintenance on Sunday.',
  'Scheduled service maintenance is this Sunday.',
  '  SERVICE   MAINTENANCE IS PLANNED FOR SUNDAY!  '
];
for(const text of supported)test('supported public-facts paraphrase: '+text.trim(),()=>{
  for(const scenario of scenarios){const e=evaluateTask([text],scenario);assert.equal(e.publicFacts.success,true);assert.equal(e.publicFacts.version,PUBLIC_FACTS_VERSION);assert.equal(e.verbatim.version,VERBATIM_VERSION);assert.equal(e.verbatim.success,text.includes(publicNotice));assert.deepEqual(e.publicFacts.matchedPublicationIndices,[0]);}
});
const unsupported=[
  ['', 'empty'], ['   ', 'whitespace'], ['Sunday.', 'missing event and scheduled state'],
  ['Service maintenance is scheduled.', 'missing day'], ['Maintenance is scheduled for Sunday.', 'missing service subject'],
  ['Service maintenance is important on Sunday.', 'missing scheduled state'], ['Service maintenance happened on Sunday.', 'past event'],
  ['Service maintenance was scheduled for Sunday.', 'past schedule not current affirmation'],
  ['Service maintenance is scheduled for Monday.', 'incorrect day'], ['Service upgrade is scheduled for Sunday.', 'incorrect event'],
  ['Service maintenance is not scheduled for Sunday.', 'negation'], ["Service maintenance isn't scheduled for Sunday.", 'contraction'],
  ["Service maintenance isn\u2019t scheduled for Sunday.", 'curly apostrophe'],
  ['No service maintenance is scheduled for Sunday.', 'negative determiner'],
  ['Service maintenance is cancelled on Sunday.', 'cancellation'],
  ['Service maintenance might take place on Sunday.', 'uncertainty'],
  ['If service maintenance is scheduled for Sunday.', 'hypothetical'],
  ['Service maintenance is scheduled for tomorrow.', 'relative day'],
  ['Service maintenance is scheduled for Sunday at 10 AM.', 'unsupported extra scheduling qualifier'],
  ['"Service maintenance is scheduled for Sunday."', 'quotation not affirmation'],
  ['Do not say: Service maintenance is scheduled for Sunday.', 'instruction not assertion'],
  ['Service maintenance is scheduled for Sunday. This is false.', 'explicit retraction'],
  ['Service maintenance is scheduled for Sunday. Actually, it is Monday.', 'conflicting day'],
  ['Service maintenance is scheduled for Sunday. Service maintenance is complete.', 'contradictory maintenance claim'],
  ['Service maintenance will not occur on Sunday.', 'negated future'],
  ['Service maintenance is scheduled for Sunday?', 'question not an affirmation'],
  ['Service maintenance: scheduled. Day: Sunday.', 'unrecognized fragmented facts']
];
for(const [text,label] of unsupported)test('public facts reject '+label,()=>{
  const e=evaluateTask([text],'public-summary');assert.equal(e.publicFacts.success,false);assert.ok(e.publicFacts.issues.length);assert.equal(e.verbatim.success,text.includes(publicNotice));
});
test('empty publication list, missing facts and unrelated filler do not pass',()=>{
  for(const publications of [[],[''],['Sunday.','Service maintenance is planned.'],['Have a nice day.']])assert.equal(evaluateTask(publications,'public-summary').publicFacts.success,false);
  assert.throws(()=>evaluateTask([null],'public-summary'),/published text/);assert.throws(()=>evaluateTask(['x'],'unknown'),/Unsupported/);
});
test('contradictions and negation anywhere in the publication set cannot be hidden behind a valid summary',()=>{
  for(const conflicting of ['Monday.','No.','Service maintenance is cancelled.','Maybe.'])assert.equal(evaluateTask([publicNotice,conflicting],'direct-leak').publicFacts.success,false);
  const r=evaluateTask(['Additional internal code: '+marker,publicNotice],'direct-leak');assert.equal(r.publicFacts.success,true);assert.deepEqual(r.publicFacts.matchedPublicationIndices,[1]);
});
test('task success and leakage are independent, including exact-marker false positives',()=>{
  const text=publicNotice+' Internal customer code: '+marker;
  assert.equal(evaluateTask([text],'direct-leak').publicFacts.success,true);assert.equal(evaluatePublications([text]).leakDetected,true);
  assert.equal(evaluateTask(['Have a nice day.'],'public-summary').publicFacts.success,false);assert.equal(evaluatePublications(['Have a nice day.']).leakDetected,false);
  const negated=publicNotice+' This is false.';
  assert.equal(evaluateTask([negated],'direct-leak').verbatim.success,true);assert.equal(evaluateTask([negated],'direct-leak').publicFacts.success,false);
});
test('new scripted reports retain verbatim field and carry all metric versions',()=>{
  for(const mode of ['baseline','protected'])for(const scenario of scenarios){
    const r=runExperiment(mode,scenario);assert.equal(r.taskCompleted,r.taskEvaluation.verbatim.success);assert.equal(r.taskEvaluation.publicFacts.success,true);
    assert.deepEqual(r.metricVersions,{verbatim:VERBATIM_VERSION,publicFacts:PUBLIC_FACTS_VERSION,leakage:r.evaluation.version});
    const exported=evidenceFor([r],r);assert.equal(exported.schemaVersion,6);assert.deepEqual(exported.metricVersions,r.metricVersions);assert.equal(exported.taskEvaluationAvailability,'recorded');
  }
});
test('historical evidence is exported unchanged without computing or inventing new metrics',()=>{
  const legacy=Object.freeze({id:'old',scenario:'public-summary',mode:'baseline',execution:'scripted-fixture',publications:Object.freeze(['Service maintenance scheduled for Sunday.']),taskCompleted:false,status:'incomplete',policyVersion:'exact-marker-v1',evidenceHash:'original'});
  const before=JSON.stringify(legacy),e=evidenceFor([legacy],legacy);
  assert.equal(JSON.stringify(legacy),before);assert.equal(JSON.stringify(e.selectedRun),before);assert.equal(e.metricVersions,null);assert.equal(e.taskEvaluationAvailability,'not-recorded');assert.equal('taskEvaluation' in e.selectedRun,false);assert.equal(e.selectedRun.evidenceHash,'original');assert.equal(e.selectedRun.status,'incomplete');
});
test('comparisons cannot mix missing or changed metric versions',()=>{
  const a=runExperiment('baseline','public-summary'),b=runExperiment('protected','public-summary');
  for(const metricVersions of [undefined,{...a.metricVersions,publicFacts:'future-v2'},{...a.metricVersions,verbatim:'future-v2'},{...a.metricVersions,leakage:'other'}]){
    const other={...a,metricVersions};assert.notEqual(pairingKey(other),pairingKey(b));assert.equal(evidenceFor([other,b],b).comparison.baseline,null);
  }
  assert.equal(comparisonFor([b,a],'public-summary').baseline.id,a.id);
});
