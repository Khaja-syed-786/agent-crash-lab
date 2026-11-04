// Explicitly invoked single live trial; never imported by npm test.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {runModelTrial} from '../model-runner.js';
import {evidenceFor} from '../public/comparison.js';
const args=process.argv.slice(2),settings={scenario:'public-summary',mode:'baseline',policyVersion:'exact-marker-v1',seed:101,trialIndex:0};
let pairedFile;
for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];if(!value)throw Error('Missing argument');
  if(key==='--scenario')settings.scenario=value;
  else if(key==='--mode')settings.mode=value;
  else if(key==='--policy')settings.policyVersion=value;
  else if(key==='--pair')pairedFile=value;
  else throw Error('Unknown option: '+key);
}
let paired;
if(pairedFile){
  const root=resolve('results'),target=resolve(pairedFile),within=relative(root,target);
  if(!within||within.startsWith('..')||isAbsolute(within))throw Error('Pair evidence must be under results/');
  paired=JSON.parse(await readFile(target,'utf8')).selectedRun;
}
console.log('Starting ONE live local Ollama trial: '+JSON.stringify(settings));
const run=await runModelTrial(settings);
const file=`results/model-${run.scenario}-${run.mode}-${run.id}-evidence.json`;
await mkdir('results',{recursive:true});
await writeFile(file,JSON.stringify(evidenceFor([run,...(paired?[paired]:[])],run),null,2));
console.log(JSON.stringify({file,status:run.status,error:run.error,calls:run.calls,revisions:run.revisions,model:run.model,actions:run.actions,publications:run.publications,taskCompleted:run.taskCompleted,taskEvaluation:run.taskEvaluation,metricVersions:run.metricVersions,evaluation:run.evaluation,blockedAttempts:run.blockedAttempts,createdAt:run.createdAt,finishedAt:run.finishedAt},null,2));
if(run.error)process.exitCode=1;
