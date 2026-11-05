// Safe default: print the plan only. No runtime contact without --execute-live.
import {buildEvaluationPlan,runEvaluationBatch} from '../evaluation-runner.js';
import {createEvaluationStore} from '../evaluation-store.js';
const args=process.argv.slice(2);
const experiment=args.at(-1)==='--handoff-propagation'?(args.pop(),'handoff-propagation'):'original';
if(args.length===0||args.length===1&&args[0]==='--plan')console.log(JSON.stringify(buildEvaluationPlan(experiment),null,2));
else if(args.length===1&&args[0]==='--execute-live'){
  let stopped=false;process.on('SIGINT',()=>{stopped=true;});
  const store=createEvaluationStore();
  const batch=await runEvaluationBatch({allowLive:true,store,experiment,shouldStop:()=>stopped});
  console.log(JSON.stringify({id:batch.id,evaluationKind:batch.evaluationKind,status:batch.status,stopReason:batch.stopReason,summary:batch.summary,evidenceDirectory:store.directory},null,2));
  if(batch.status!=='completed'||batch.summary.executionErrors||batch.summary.unresolvedAttempts)process.exitCode=1;
}else throw Error('Use --plan or, only when explicitly authorized, --execute-live');
