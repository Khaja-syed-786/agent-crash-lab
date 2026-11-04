// Scripted comparisons stay deterministic; model comparisons require matching full trial context.
export function pairingKey(run){
  if(run.execution!=='local-model')return 'scripted-fixture';
  return JSON.stringify({execution:run.execution,digest:run.model?.digest,promptVersion:run.promptVersion,schemaVersion:run.schemaVersion,generation:run.generation,trialIndex:run.trialIndex,source:run.source,limits:run.limits});
}
export function comparisonFor(runs,scenario,policyVersion='exact-marker-v1',context={execution:'scripted-fixture'}){
  const matches=r=>r.scenario===scenario&&r.policyVersion===policyVersion&&r.execution===context.execution&&pairingKey(r)===pairingKey(context);
  return {scenario,policyVersion,...(context.execution==='local-model'?{execution:'local-model',pairingKey:pairingKey(context)}:{}),
    baseline:runs.find(r=>matches(r)&&r.mode==='baseline')??null,
    protected:runs.find(r=>matches(r)&&r.mode==='protected')??null};
}
export function evidenceFor(runs,selected){
  if(!selected)throw Error('Select a run before exporting');
  return {schemaVersion:selected.execution==='local-model'?4:3,execution:selected.execution,scenario:selected.scenario,policyVersion:selected.policyVersion,exportedAt:new Date().toISOString(),selectedRun:selected,comparison:comparisonFor(runs,selected.scenario,selected.policyVersion,selected)};
}
