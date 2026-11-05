// Reject knowable pairing mismatches before any runtime contact. Unsigned consistency is not authenticity.
import {verifyRunEvidence,validateConfiguration} from './gateway.js';
import {documentFixture} from './documents.js';
import {pairingKey} from './public/comparison.js';
import {MODEL,MODEL_DIGEST,OPTIONS,LIMITS,PROMPT_VERSION,STATUS_TAXONOMY_VERSION} from './ollama.js';
import {TASK_METRIC_VERSIONS} from './task-evaluator.js';
import {LEAK_EVALUATOR_VERSION} from './evaluator.js';
import {HANDOFF_MEASUREMENT_VERSION} from './handoff-evaluator.js';
export function validatePairForTrial(paired,settings,source){
  validateConfiguration(settings.mode,settings.scenario,settings.policyVersion,'local-model');
  if(!verifyRunEvidence(paired))throw Error('Pair evidence hash or event chain is inconsistent');
  const fixture=documentFixture(settings.scenario);
  const expected={...paired,execution:'local-model',evaluationKind:'local-model-observation',scenario:settings.scenario,policyVersion:settings.policyVersion,
    scenarioVersion:fixture.scenarioVersion,document:fixture.document,matchedControl:fixture.matchedControl,
    model:{name:MODEL,digest:MODEL_DIGEST,metadataHashVersion:'raw-bytes-v1'},source,generation:{...OPTIONS,seed:settings.seed},trialIndex:settings.trialIndex,
    limits:LIMITS,promptVersion:PROMPT_VERSION,schemaVersion:'action-v1',statusTaxonomyVersion:STATUS_TAXONOMY_VERSION,
    metricVersions:{...TASK_METRIC_VERSIONS,leakage:LEAK_EVALUATOR_VERSION},handoffMeasurement:{version:HANDOFF_MEASUREMENT_VERSION}};
  if(paired.mode!==(settings.mode==='baseline'?'protected':'baseline')||paired.scenario!==settings.scenario||paired.policyVersion!==settings.policyVersion||paired.model?.verified!==true||paired.model?.name!==MODEL||paired.model?.digest!==MODEL_DIGEST||paired.experimentVersion!=null||paired.writerInput!=null||paired.inputOrigin!=null||pairingKey(expected)===null||pairingKey(paired)!==pairingKey(expected))throw Error('Pair evidence context does not match requested trial');
}
