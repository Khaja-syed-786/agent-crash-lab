// Validate recorded version metadata without evaluating or modifying publication content.
export function metricRecordState(run){
  if(run.metricVersions==null&&run.taskEvaluation==null)return 'legacy';
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const versions=run.metricVersions,task=run.taskEvaluation;
  if(!object(versions)||!object(task))return 'invalid';
  const keys=['verbatim','publicFacts','leakage'];
  if(Object.keys(versions).length!==keys.length||!keys.every(key=>Object.hasOwn(versions,key)&&typeof versions[key]==='string'&&versions[key].trim()))return 'invalid';
  if(task.scenario!==run.scenario||!object(task.verbatim)||!object(task.publicFacts))return 'invalid';
  if(typeof task.verbatim.success!=='boolean'||typeof task.publicFacts.success!=='boolean'||run.taskCompleted!==task.verbatim.success)return 'invalid';
  if(task.verbatim.version!==versions.verbatim||task.publicFacts.version!==versions.publicFacts||run.evaluation?.version!==versions.leakage)return 'invalid';
  return 'recorded';
}
export function pairingKey(run){
  const state=metricRecordState(run);if(state==='invalid')return null;
  // Canonical field order: equivalent manifests must not depend on JSON key insertion order.
  const v=run.metricVersions,metricVersions=state==='legacy'?null:{verbatim:v.verbatim,publicFacts:v.publicFacts,leakage:v.leakage};
  if(run.execution!=='local-model')return JSON.stringify({execution:'scripted-fixture',metricVersions});
  return JSON.stringify({execution:run.execution,metricVersions,digest:run.model?.digest,promptVersion:run.promptVersion,schemaVersion:run.schemaVersion,generation:run.generation,trialIndex:run.trialIndex,source:run.source,limits:run.limits});
}
export function comparisonFor(runs,scenario,policyVersion='exact-marker-v1',context){
  context??=runs.find(r=>r.scenario===scenario&&r.policyVersion===policyVersion&&r.execution==='scripted-fixture')??{execution:'scripted-fixture'};
  const key=pairingKey(context);
  const matches=r=>key!==null&&r.scenario===scenario&&r.policyVersion===policyVersion&&r.execution===context.execution&&pairingKey(r)===key;
  return {scenario,policyVersion,...(context.execution==='local-model'?{execution:'local-model',pairingKey:key}:{}),
    baseline:runs.find(r=>matches(r)&&r.mode==='baseline')??null,
    protected:runs.find(r=>matches(r)&&r.mode==='protected')??null};
}
export function evidenceFor(runs,selected){
  if(!selected)throw Error('Select a run before exporting');
  const state=metricRecordState(selected);
  return {schemaVersion:5,metricVersions:selected.metricVersions??null,taskEvaluationAvailability:state==='legacy'?'not-recorded':state,execution:selected.execution,scenario:selected.scenario,policyVersion:selected.policyVersion,exportedAt:new Date().toISOString(),selectedRun:selected,comparison:comparisonFor(runs,selected.scenario,selected.policyVersion,selected)};
}
