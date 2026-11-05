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
// Absence is historical; partial provenance is invalid. No content is re-evaluated here.
export function documentRecordState(run){
  if(run.scenarioVersion==null&&run.document==null&&run.evaluationKind==null)return 'legacy';
  const allowedKind=run.execution==='scripted-fixture'?run.evaluationKind==='scripted-fixture':run.execution==='local-model'&&['mock-verification','local-model-observation'].includes(run.evaluationKind);
  if(!allowedKind)return 'invalid';
  const doc=run.document;
  if(typeof run.scenarioVersion!=='string'||!run.scenarioVersion.trim()||!doc||Array.isArray(doc)||typeof doc!=='object')return 'invalid';
  if(!['id','version'].every(key=>typeof doc[key]==='string'&&doc[key].trim())||typeof doc.sha256!=='string'||! /^[a-f0-9]{64}$/.test(doc.sha256))return 'invalid';
  return 'recorded';
}
export function pairingKey(run){
  const state=metricRecordState(run),documentState=documentRecordState(run);if(state==='invalid'||documentState==='invalid')return null;
  // Canonical field order: equivalent manifests must not depend on JSON key insertion order.
  const v=run.metricVersions,metricVersions=state==='legacy'?null:{verbatim:v.verbatim,publicFacts:v.publicFacts,leakage:v.leakage};
  const document=documentState==='legacy'?null:{id:run.document.id,version:run.document.version,sha256:run.document.sha256};
  const provenance={experimentVersion:run.experimentVersion??null,inputOrigin:run.inputOrigin??null,writerInputVersion:run.writerInput?.version??null,handoffMeasurementVersion:run.handoffMeasurement?.version??null,statusTaxonomyVersion:run.statusTaxonomyVersion??null,scenarioVersion:run.scenarioVersion??null,document,matchedControl:run.matchedControl??null,evaluationKind:run.evaluationKind??null};
  if(run.execution!=='local-model')return JSON.stringify({execution:'scripted-fixture',metricVersions,...provenance});
  return JSON.stringify({execution:run.execution,metricVersions,...provenance,digest:run.model?.digest,promptVersion:run.promptVersion,schemaVersion:run.schemaVersion,generation:run.generation,trialIndex:run.trialIndex,source:run.source,limits:run.limits});
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
  return {schemaVersion:6,experimentVersion:selected.experimentVersion??null,inputOrigin:selected.inputOrigin??null,writerInputVersion:selected.writerInput?.version??null,handoffMeasurementVersion:selected.handoffMeasurement?.version??null,scenarioVersion:selected.scenarioVersion??null,matchedControl:selected.matchedControl??null,document:selected.document??null,documentAvailability:documentRecordState(selected)==='legacy'?'not-recorded':documentRecordState(selected),evaluationKind:selected.evaluationKind??'not-recorded',metricVersions:selected.metricVersions??null,taskEvaluationAvailability:state==='legacy'?'not-recorded':state,execution:selected.execution,scenario:selected.scenario,policyVersion:selected.policyVersion,exportedAt:new Date().toISOString(),selectedRun:selected,comparison:comparisonFor(runs,selected.scenario,selected.policyVersion,selected)};
}
