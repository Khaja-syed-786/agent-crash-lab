import {comparisonFor,evidenceFor} from './comparison.js';
const $=id=>document.getElementById(id);
let selected=null, runs=[];
const names={'direct-leak':'Direct synthetic-secret leak','public-summary':'Harmless public summary','base64-leak':'Base64-encoded synthetic-secret leak'};
function el(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
function show(run){
  selected=run;$('export').disabled=!run;
  $('timeline').replaceChildren();$('outcome').replaceChildren();
  if(!run){$('status').textContent='Ready for a scripted run with this scenario and policy.';$('timeline-label').textContent='No run selected';$('timeline').textContent='No run selected for this scenario and policy.';return;}
  $('status').textContent='Viewing scripted '+run.mode+' fixture: '+names[run.scenario]+' / '+run.policyVersion;
  $('timeline-label').textContent=names[run.scenario]+' / '+run.policyVersion+' / '+run.mode+' / '+run.id;
  for(const event of run.events){const row=el('div','','event');row.append(el('span',String(event.sequence).padStart(2,'0'),'seq'),el('strong',event.actor+' / '+event.action),el('span',event.decision,event.decision==='BLOCK'?'bad':'good'),el('p',event.details));$('timeline').append(row);}
  $('outcome').append(el('p',run.evaluation.leakDetected?'Evaluator: leak detected':'Evaluator: no known marker found',run.evaluation.leakDetected?'bad':'good'));
  for(const finding of run.evaluation.findings)$('outcome').append(el('p',`Publication ${finding.publicationIndex+1}: ${finding.representation} synthetic marker`));
}
function renderComparison(){
  const pair=comparisonFor(runs,$('scenario').value,$('policy').value);
  $('policy-label').textContent=$('policy').value;
  for(const mode of ['baseline','protected']){
    const box=$(mode+'-result'),r=pair[mode];box.replaceChildren();
    if(!r){box.textContent='No '+mode+' run for this scenario and policy.';continue;}
    box.append(el('p','Evaluator: '+(r.evaluation.leakDetected?'leak detected':'no known marker found'),r.evaluation.leakDetected?'bad':'good'),el('p','Public summary: '+(r.taskCompleted?'completed':'incomplete')),el('p','Gateway blocked attempts: '+r.blockedAttempts),el('small',r.id));
  }
}
async function refresh(){
  const res=await fetch('/api/runs');if(!res.ok)throw Error('Unable to read run history');runs=await res.json();
  const box=$('history');box.replaceChildren();
  for(const r of runs){const b=el('button',names[r.scenario]+' / '+r.policyVersion+' / '+r.mode+' / '+new Date(r.createdAt).toLocaleTimeString(),'history');b.onclick=()=>{$('scenario').value=r.scenario;$('policy').value=r.policyVersion;renderComparison();show(r);};box.append(b);}
  if(!runs.length)box.textContent='No runs in this server session.';
  renderComparison();
}
async function run(mode){
  const scenario=$('scenario').value, policyVersion=$('policy').value;
  $('baseline').disabled=$('protected').disabled=$('scenario').disabled=$('policy').disabled=true;
  $('status').textContent='Executing scripted '+mode+' fixture: '+names[scenario]+' / '+policyVersion;
  try{
    const res=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({mode,scenario,policyVersion})});
    const r=await res.json();if(!res.ok)throw Error(r.error);
    await refresh();$('scenario').value=r.scenario;$('policy').value=r.policyVersion;renderComparison();show(r);$('status').textContent='Completed scripted '+mode+' fixture: '+names[scenario]+' / '+policyVersion;
  }catch(e){$('status').textContent='Run failed: '+e.message;}
  finally{$('baseline').disabled=$('protected').disabled=$('scenario').disabled=$('policy').disabled=false;}
}
$('policy').onchange=$('scenario').onchange=()=>{renderComparison();show(runs.find(r=>r.scenario===$('scenario').value&&r.policyVersion===$('policy').value)??null);};
$('baseline').onclick=()=>run('baseline');$('protected').onclick=()=>run('protected');
$('export').onclick=()=>{
  const data=evidenceFor(runs,selected);
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='agent-crash-lab-'+selected.scenario+'-'+selected.policyVersion+'-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
refresh().then(()=>show(runs.find(r=>r.scenario===$('scenario').value&&r.policyVersion===$('policy').value)??null)).catch(e=>$('status').textContent=e.message);
