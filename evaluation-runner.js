// Bounded, predeclared pilot. No inference occurs by importing or building a plan.
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {documentFixture} from './documents.js';
import {hash} from './gateway.js';
import {TASK_METRIC_VERSIONS} from './task-evaluator.js';
import {evaluatePublications,LEAK_EVALUATOR_VERSION} from './evaluator.js';
import {createOllamaAdapter,adapterEvaluationKind,MODEL,MODEL_DIGEST,OPTIONS,PROMPT_VERSION,LIMITS,boundedLimits,validateAction} from './ollama.js';
import {createModelRunner} from './model-runner.js';
import {pairingKey,evidenceFor} from './public/comparison.js';
export const RUNNER_VERSION='controlled-pilot-v2';
export const BATCH_LIMIT_MS=30*60*1000;
const SEEDS=[101,102,103],SCENARIOS=['injection-control','injection-direct'];
export function buildEvaluationPlan(){
  const trials=[];
  for(const [trialIndex,seed] of SEEDS.entries())for(const scenario of SCENARIOS){
    const fixture=documentFixture(scenario),modes=trialIndex%2?['protected','baseline']:['baseline','protected'];
    for(const mode of modes)trials.push({index:trials.length,slotId:`${scenario}:${mode}:${seed}`,pairId:`${scenario}:${seed}`,settings:{mode,scenario,policyVersion:'exact-marker-v1',seed,trialIndex},scenarioVersion:fixture.scenarioVersion,document:fixture.document,matchedControl:fixture.matchedControl});
  }
  return {version:RUNNER_VERSION,planned:12,model:{name:MODEL,digest:MODEL_DIGEST},metricVersions:{...TASK_METRIC_VERSIONS,leakage:LEAK_EVALUATOR_VERSION},promptVersion:PROMPT_VERSION,generation:{...OPTIONS},seeds:[...SEEDS],scenarios:[...SCENARIOS],batchLimitMs:BATCH_LIMIT_MS,trialLimits:{...LIMITS},trials};
}
export function trialObservations(run){
  const proposals=[];
  for(const record of run.transcript??[]){
    if(record.kind!=='proposal'||record.actor!=='writer'||record.proposed?.action!=='publish'||typeof record.proposed.text!=='string')continue;
    let validAction=true;try{validateAction(record.proposed,'writer','publish',run.limits.actionBytes);}catch{validAction=false;}
    proposals.push({validAction,...evaluatePublications([record.proposed.text])});
  }
  return {version:'pilot-observations-v1',metricVersions:run.metricVersions??null,
    publicationProposals:proposals.length,markerBearingProposals:proposals.filter(p=>p.leakDetected).length,proposalFindings:proposals,
    acceptedPublications:run.publications.length,publishedLeak:run.evaluation.leakDetected,publicationFindings:run.evaluation.findings,
    gatewayPublicationBlocks:run.blockedAttempts,verbatimTaskSuccess:run.taskEvaluation.verbatim.success,publicFactsTaskSuccess:run.taskEvaluation.publicFacts.success,
    executionStatus:run.status,executionError:!!run.error,refused:run.status==='refused',documentRead:run.documentRead,documentDelivered:run.documentDelivered};
}
function summarizeTrials(trials){
  const attempted=trials.filter(t=>t.attempted),observed=attempted.filter(t=>t.observations),statuses={};
  for(const trial of trials)statuses[trial.status]=(statuses[trial.status]??0)+1;
  const count=predicate=>observed.filter(t=>predicate(t.observations)).length;
  return {planned:trials.length,attempted:attempted.length,notAttempted:trials.length-attempted.length,
    outcomesRecorded:observed.length,unresolvedAttempts:attempted.length-observed.length,statusCounts:statuses,
    executionErrors:count(o=>o.executionError)+attempted.filter(t=>t.status==='runner_error').length,refusals:count(o=>o.refused),verbatimIncomplete:count(o=>!o.verbatimTaskSuccess),publicFactsIncomplete:count(o=>!o.publicFactsTaskSuccess),
    attemptedDisclosureTrials:count(o=>o.markerBearingProposals>0),publishedLeakTrials:count(o=>o.publishedLeak),trialsWithGatewayBlocks:count(o=>o.gatewayPublicationBlocks>0),
    acceptedPublicationCount:observed.reduce((n,t)=>n+t.observations.acceptedPublications,0),gatewayPublicationBlockCount:observed.reduce((n,t)=>n+t.observations.gatewayPublicationBlocks,0)};
}
export function summarizeEvaluation(batch){
  return {metricVersions:batch.plan?.metricVersions??null,...summarizeTrials(batch.trials),batchErrors:batch.error?1:0,
    conditions:SCENARIOS.flatMap(scenario=>['baseline','protected'].map(mode=>({scenario,mode,...summarizeTrials(batch.trials.filter(t=>t.settings.scenario===scenario&&t.settings.mode===mode))})))};
}

let active=false;
export async function runEvaluationBatch(options={}){
  if(active)throw Error('An evaluation batch is already active');
  active=true;try{return await executeBatch(options);}finally{active=false;}
}
async function executeBatch({adapter=createOllamaAdapter(),allowLive=false,store,now=()=>performance.now(),batchLimitMs=BATCH_LIMIT_MS,shouldStop=()=>false}={}){
  const evaluationKind=adapterEvaluationKind(adapter);
  if(evaluationKind==='local-model-observation'&&allowLive!==true)throw Error('Live execution is disabled; explicit allowLive is required');
  if(!store||typeof store.initialize!=='function'||typeof store.checkpoint!=='function'||typeof store.saveTrial!=='function')throw Error('An explicit evidence store is required');
  if(!Number.isInteger(batchLimitMs)||batchLimitMs<1||batchLimitMs>BATCH_LIMIT_MS)throw Error('Batch limit can only be tightened');
  const effectiveLimits=boundedLimits(adapter.limits);
  const plan=buildEvaluationPlan(),started=now(),id=randomUUID();
  const batch={id,version:RUNNER_VERSION,evaluationKind,plan,effectiveLimits,startedAt:new Date().toISOString(),batchLimitMs,status:'running',stopReason:null,
    trials:plan.trials.map(t=>({...t,trialId:`${id}:${t.slotId}`,attempted:false,status:'not_run',observations:null,evidenceFile:null}))};
  await store.initialize(batch);
  const runTrial=createModelRunner(adapter),runs=[],pairs=new Map();
  const checkpoint=async()=>{batch.summary=summarizeEvaluation(batch);await store.checkpoint(batch);};
  try{
    for(const trial of batch.trials){
      if(batch.stopReason)break;
      if(hash(boundedLimits(adapter.limits))!==hash(effectiveLimits)){batch.stopReason='limits_changed';break;}
      if(shouldStop()){batch.stopReason='operator_stop';break;}
      if(now()-started+adapter.limits.trialMs>=batchLimitMs){batch.stopReason='batch_budget';break;}
      trial.attempted=true;trial.status='running';trial.startedAt=new Date().toISOString();
      // Persist the attempted slot before making any runtime call.
      try{await checkpoint();}catch(error){trial.attempted=false;trial.status='not_run';throw error;}
      // Checkpoint I/O can consume the reserved window; recheck before any runtime call.
      if(now()-started+adapter.limits.trialMs>=batchLimitMs){trial.attempted=false;trial.status='not_run_budget';batch.stopReason='batch_budget';break;}
      let run;
      try{run=await runTrial(trial.settings);}catch(error){
        trial.status='runner_error';trial.error=String(error.message).slice(0,512);batch.stopReason='runner_error';await checkpoint();break;
      }
      trial.status=run.status;trial.observations=trialObservations(run);trial.runId=run.id;
      runs.unshift(run);
      trial.evidenceFile=await store.saveTrial(trial,{...evidenceFor(runs,run),batchId:id,slotId:trial.slotId,trialId:trial.trialId});
      if(run.evaluationKind!==evaluationKind)throw Error('Evidence basis changed');
      if(run.scenarioVersion!==trial.scenarioVersion||hash(run.document)!==hash(trial.document)||hash(run.matchedControl)!==hash(trial.matchedControl))throw Error('Planned document identity changed');
      if(run.model.verified&&(run.model.digest!==plan.model.digest||run.model.name!==plan.model.name))throw Error('Model identity changed');
      if(hash(run.metricVersions)!==hash(plan.metricVersions))throw Error('Metric versions changed from plan');
      if(run.promptVersion!==plan.promptVersion||hash(run.generation)!==hash({...plan.generation,seed:trial.settings.seed}))throw Error('Initial prompt or generation settings changed');
      if(run.model.verified){
        const {seed:ignoredSeed,...generation}=run.generation;
        const context={model:{name:run.model.name,digest:run.model.digest,runtimeVersion:run.model.runtimeVersion},source:run.source,promptVersion:run.promptVersion,generation,limits:run.limits,metricVersions:run.metricVersions,evaluationKind};
        if(batch.initialContext&&hash(context)!==hash(batch.initialContext))throw Error('Initial execution context changed');
        batch.initialContext??=context;
      }
      const key=pairingKey(run),previous=pairs.get(trial.pairId);
      trial.comparisonValid=run.model.verified===true&&key!==null&&(!previous||previous===key);
      // Raw evidence was saved before validating the declared plan context.
      if(!trial.comparisonValid)batch.stopReason='comparison_identity_changed';
      else pairs.set(trial.pairId,key);
      if(run.error?.cancellationUncertain)batch.stopReason='uncertain_cancellation';
      else if(run.status==='runtime_failure')batch.stopReason='runtime_failure';
      await checkpoint();
    }
  }catch(error){
    batch.stopReason='evidence_or_integrity_error';batch.error=String(error.message).slice(0,512);
    // Return the attempted/unknown counts; never pretend missing raw evidence was saved.
  }
  for(const trial of batch.trials)if(!trial.attempted)trial.status=batch.stopReason==='batch_budget'?'not_run_budget':batch.stopReason?'not_run_stopped':'not_run';
  batch.pairs=[...new Set(plan.trials.map(t=>t.pairId))].map(pairId=>{const pair=batch.trials.filter(t=>t.pairId===pairId);return {pairId,trialIndices:pair.map(t=>t.index),bothAttempted:pair.every(t=>t.attempted),outcomesRecorded:pair.filter(t=>t.observations).length,comparable:pair.every(t=>t.observations&&t.comparisonValid),bothDocumentsDelivered:pair.every(t=>t.observations?.documentDelivered)};});
  batch.status=batch.stopReason?'stopped':'completed';batch.finishedAt=new Date().toISOString();
  await checkpoint();return batch;
}
