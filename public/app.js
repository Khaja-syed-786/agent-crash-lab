import {comparisonFor,evidenceFor} from './comparison.js';
const $=id=>document.getElementById(id);
let selected=null, runs=[];
const names={'direct-leak':'Direct synthetic-secret leak','public-summary':'Harmless public summary','base64-leak':'Base64-encoded synthetic-secret leak'};
function el(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
const execution=()=>$('execution').value;
const matching=r=>r.scenario===$('scenario').value&&r.policyVersion===$('policy').value&&r.execution===execution();
function show(run){
  selected=run;$('export').disabled=!run;
  $('timeline').replaceChildren();$('outcome').replaceChildren();
  if(!run){$('status').textContent='Ready for '+execution()+' with this scenario and policy.';$('timeline-label').textContent='No run selected';$('timeline').textContent='No run selected for this scenario and policy.';return;}
  $('status').textContent='Viewing '+(run.execution==='local-model'?'local-model ('+run.status+')':'scripted')+' '+run.mode+' fixture: '+names[run.scenario]+' / '+run.policyVersion;
  $('timeline-label').textContent=names[run.scenario]+' / '+run.policyVersion+' / '+run.mode+' / '+run.execution+' / '+run.id;
  for(const event of run.events){const row=el('div','','event');row.append(el('span',String(event.sequence).padStart(2,'0'),'seq'),el('strong',event.actor+' / '+event.action),el('span',event.decision,event.decision==='BLOCK'?'bad':'good'),el('p',event.details));$('timeline').append(row);}
  $('outcome').append(el('p',run.evaluation.leakDetected?'Evaluator: leak detected':'Evaluator: no known marker found',run.evaluation.leakDetected?'bad':'good'));
  $('outcome').append(el('p',run.taskEvaluation?'Task facts: '+(run.taskEvaluation.publicFacts.success?'pass':'fail')+' / '+run.taskEvaluation.publicFacts.version:'Task facts: not recorded; historical run unchanged'));
  for(const finding of run.evaluation.findings)$('outcome').append(el('p',`Publication ${finding.publicationIndex+1}: ${finding.representation} synthetic marker`));
}
function renderComparison(){
  const context=selected&&matching(selected)?selected:runs.find(matching)??{execution:execution()};
  const pair=comparisonFor(runs,$('scenario').value,$('policy').value,context);
  $('policy-label').textContent=$('policy').value;
  for(const mode of ['baseline','protected']){
    const box=$(mode+'-result'),r=pair[mode];box.replaceChildren();
    if(!r){box.textContent='No '+mode+' run for this scenario and policy.';continue;}
    box.append(el('p','Evaluator: '+(r.evaluation.leakDetected?'leak detected':'no known marker found'),r.evaluation.leakDetected?'bad':'good'),el('p','Verbatim public summary: '+(r.taskCompleted?'completed':'incomplete')+(r.metricVersions?' ('+r.metricVersions.verbatim+')':' (legacy; version not recorded)')),el('p','Gateway blocked attempts: '+r.blockedAttempts),el('small',r.id));
    box.append(el('p',r.taskEvaluation?'Required public facts: '+(r.taskEvaluation.publicFacts.success?'pass':'fail')+' ('+r.taskEvaluation.publicFacts.version+')':'Required public facts: not recorded (legacy run)'));
    if(r.status)box.append(el('p','Run status: '+r.status));
  }
}
async function refresh(){
  const res=await fetch('/api/runs');if(!res.ok)throw Error('Unable to read run history');runs=await res.json();
  const box=$('history');box.replaceChildren();
  for(const r of runs){const b=el('button',r.execution+' / '+names[r.scenario]+' / '+r.policyVersion+' / '+r.mode+' / '+new Date(r.createdAt).toLocaleTimeString(),'history');b.onclick=()=>{$('scenario').value=r.scenario;$('policy').value=r.policyVersion;$('execution').value=r.execution;show(r);renderComparison();};box.append(b);}
  if(!runs.length)box.textContent='No runs in this server session.';
  renderComparison();
}
async function run(mode){
  const scenario=$('scenario').value, policyVersion=$('policy').value, selectedExecution=execution();
  $('baseline').disabled=$('protected').disabled=$('scenario').disabled=$('policy').disabled=$('execution').disabled=true;
  $('status').textContent='Executing '+selectedExecution+' '+mode+' fixture: '+names[scenario]+' / '+policyVersion;
  try{
    const res=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({mode,scenario,policyVersion,...(selectedExecution==='local-model'?{execution:selectedExecution,seed:101,trialIndex:0}:{})})});
    const r=await res.json();if(!res.ok)throw Error(r.error);
    await refresh();$('scenario').value=r.scenario;$('policy').value=r.policyVersion;$('execution').value=r.execution;show(r);renderComparison();$('status').textContent=(r.execution==='local-model'?'Local-model '+r.status+': ':'Completed scripted ')+mode+' fixture: '+names[scenario]+' / '+policyVersion;
  }catch(e){$('status').textContent='Run failed: '+e.message;}
  finally{$('baseline').disabled=$('protected').disabled=$('scenario').disabled=$('policy').disabled=$('execution').disabled=false;}
}
$('execution').onchange=$('policy').onchange=$('scenario').onchange=()=>{show(runs.find(matching)??null);renderComparison();};
$('baseline').onclick=()=>run('baseline');$('protected').onclick=()=>run('protected');
$('export').onclick=()=>{
  const data=evidenceFor(runs,selected);
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='agent-crash-lab-'+selected.scenario+'-'+selected.policyVersion+(selected.execution==='local-model'?'-local-model-'+selected.id:'')+'-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
refresh().then(()=>{show(runs.find(matching)??null);renderComparison();}).catch(e=>$('status').textContent=e.message);
