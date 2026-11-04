// Runs arrive newest first; both scenario and policy must match.
export function comparisonFor(runs, scenario, policyVersion = 'exact-marker-v1') {
  const matches = r => r.scenario === scenario && r.policyVersion === policyVersion;
  return {scenario, policyVersion,
    baseline:runs.find(r => matches(r) && r.mode === 'baseline') ?? null,
    protected:runs.find(r => matches(r) && r.mode === 'protected') ?? null};
}
export function evidenceFor(runs, selected) {
  if (!selected) throw new Error('Select a run before exporting');
  return {schemaVersion:3, execution:'scripted-fixture', scenario:selected.scenario,
    policyVersion:selected.policyVersion, exportedAt:new Date().toISOString(),
    selectedRun:selected, comparison:comparisonFor(runs, selected.scenario, selected.policyVersion)};
}
