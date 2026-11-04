// Runs arrive newest first; each mode is selected only within this scenario.
export function comparisonFor(runs, scenario) {
  return {scenario, baseline:runs.find(r => r.scenario === scenario && r.mode === 'baseline') ?? null,
    protected:runs.find(r => r.scenario === scenario && r.mode === 'protected') ?? null};
}
export function evidenceFor(runs, selected) {
  if (!selected) throw new Error('Select a run before exporting');
  return {schemaVersion:2, execution:'scripted-fixture', exportedAt:new Date().toISOString(),
    selectedRun:selected, comparison:comparisonFor(runs, selected.scenario)};
}
