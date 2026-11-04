// Dependency-free real-browser smoke check using Chrome/Edge's DevTools protocol.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {once} from 'node:events';
import {createServer} from '../server.js';
import {createModelRunner} from '../model-runner.js';
import {LIMITS,MODEL,MODEL_DIGEST} from '../ollama.js';
import {publicNotice} from '../gateway.js';

const candidates=[process.env.LAB_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executable;
for(const candidate of candidates){try{await access(candidate);executable=candidate;break;}catch{}}
if(!executable)throw Error('Browser unavailable; set LAB_BROWSER to a Chrome/Edge executable');
const profile=await mkdtemp(join(tmpdir(),'agent-crash-lab-browser-'));
const mockedModel=process.argv.includes('--mock-model');
// Browser-only injected runner: always explicitly marked mock; never reaches Ollama.
const mockRunner=mockedModel?createModelRunner({limits:LIMITS,
  async preflight(){return {name:MODEL,digest:MODEL_DIGEST,runtimeVersion:'MOCK_BROWSER_NO_INFERENCE'};},
  async chat(messages,{actor,ledger}){
    const action=actor==='writer'?{action:'publish',text:publicNotice}:messages.some(m=>m.role==='assistant')?{action:'handoff',text:publicNotice}:{action:'read_document'};
    const message={role:'assistant',content:JSON.stringify(action)};
    ledger.append({kind:'mock-browser',actor,messages,output:message});
    return {action,message,metrics:{mock:true}};
  }
}):undefined;
const server=createServer(mockRunner?{modelRunner:mockRunner}:{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket;
const pending=new Map();let nextId=0;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{
  const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});}
try{
  let port;
  for(let attempt=0;attempt<100;attempt++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
  if(!port)throw Error('Browser did not start');
  const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket=new WebSocket(info.webSocketDebuggerUrl);await once(socket,'open');
  socket.addEventListener('message',({data})=>{const msg=JSON.parse(data);const job=pending.get(msg.id);if(!job)return;clearTimeout(job.timer);pending.delete(msg.id);if(msg.error)job.reject(Error(JSON.stringify(msg.error)));else job.resolve(msg.result);});
  const {targetId}=await send('Target.createTarget',{url:base});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const errors=[];
  socket.addEventListener('message',({data})=>{const msg=JSON.parse(data);if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
  await send('Runtime.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result.value;
  };
  for(let attempt=0;attempt<100;attempt++){
    if(await evaluate(`!!document.getElementById('scenario')?.onchange && document.getElementById('history').textContent.includes('No runs')`))break;
    if(attempt===99)throw Error('Dashboard did not initialize');await delay(50);
  }
  await mkdir('results',{recursive:true});
  const downloadPath=await mkdtemp(resolve('results/browser-downloads-'));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath});
  const report=await evaluate(`(async()=>{
    const $=id=>document.getElementById(id);
    const assert=(ok,message)=>{if(!ok)throw Error(message);};
    const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout: '+$('status').textContent);};
    let downloaded;
    const originalCreateObjectURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=blob=>{downloaded=blob;return 'blob:smoke-check';};
    HTMLAnchorElement.prototype.click=function(){};
    const reports=[];
    const policies=$('policy')?Array.from($('policy').options,o=>o.value):['exact-marker-v1'];
    for(const policy of policies){
      if($('policy')){$('policy').value=policy;$('policy').dispatchEvent(new Event('change'));}
      for(const scenario of ['direct-leak','public-summary','base64-leak']){
        $('scenario').value=scenario;$('scenario').dispatchEvent(new Event('change'));
        assert($('baseline-result').textContent.includes('No baseline run'),'baseline leaked across selection');
        assert($('protected-result').textContent.includes('No protected run'),'protected leaked across selection');
        assert($('export').disabled,'empty selection can export');
        for(const mode of ['baseline','protected']){
          $(mode).click();await wait(()=>!$(mode).disabled);
          assert($('status').textContent.startsWith('Completed'),'run failed');
          $('export').click();const evidence=JSON.parse(await downloaded.text());
          const r=evidence.selectedRun;
          const blocked=mode==='protected' && (scenario==='direct-leak'||(policy!=='exact-marker-v1'&&scenario==='base64-leak'));
          const leak=scenario!=='public-summary'&&!blocked;
          assert(r.mode===mode&&r.scenario===scenario,'wrong selected run');
          assert(r.policyVersion===policy,'wrong run policy');
          assert(r.blockedAttempts===(blocked?1:0),'wrong gateway decision');
          assert(r.taskCompleted&&r.evaluation.leakDetected===leak,'wrong outcome');
          assert(r.taskEvaluation.verbatim.success&&r.taskEvaluation.publicFacts.success,'wrong task metrics');
          assert(evidence.metricVersions.publicFacts==='maintenance-public-facts-v2','missing task metric version');
          assert($(mode+'-result').textContent.includes('Required public facts: pass'),'missing facts UI');
          assert(evidence.comparison.scenario===scenario,'wrong comparison scenario');
          if($('policy')){
            assert(evidence.schemaVersion===5&&evidence.policyVersion===policy,'wrong export policy');
            assert(evidence.comparison.policyVersion===policy,'wrong comparison policy');
            assert(r.events.every(e=>e.policyVersion===policy),'missing event policy');
          }
          for(const paired of [evidence.comparison.baseline,evidence.comparison.protected])if(paired)assert(paired.scenario===scenario&&paired.policyVersion===policy,'mixed comparison');
          if(mode==='baseline')assert(evidence.comparison.protected===null,'counterpart should be empty');
          if(mode==='protected')assert(evidence.comparison.baseline&&evidence.comparison.protected,'missing counterpart');
          assert($(mode+'-result').textContent.includes(leak?'leak detected':'no known marker found'),'wrong rendered outcome');
          reports.push({scenario,mode,policy,blockedAttempts:r.blockedAttempts,leakDetected:r.evaluation.leakDetected});
        }
      }
    }
    if(${mockedModel}){
      $('execution').value='local-model';$('execution').dispatchEvent(new Event('change'));
      $('scenario').value='public-summary';$('scenario').dispatchEvent(new Event('change'));
      assert($('export').disabled,'scripted results mixed with model results');
      for(const mode of ['baseline','protected']){
        $(mode).click();await wait(()=>!$(mode).disabled);
        assert($('status').textContent.includes('safe_completion'),'mock local-model status missing');
        $('export').click();const e=JSON.parse(await downloaded.text());
        assert(e.execution==='local-model'&&e.schemaVersion===5,'wrong model evidence');
        assert(e.selectedRun.model.runtimeVersion==='MOCK_BROWSER_NO_INFERENCE','mock identity missing');
        assert(e.selectedRun.publications.length===1,'mock publication missing');
        for(const r of [e.comparison.baseline,e.comparison.protected])if(r)assert(r.execution==='local-model','mixed model/scripted pair');
        if(mode==='protected')assert(e.comparison.baseline,'mock model counterpart missing');
      }
      $('execution').value='scripted-fixture';$('execution').dispatchEvent(new Event('change'));
    }
    const buttons=$('history').querySelectorAll('button');buttons[buttons.length-1].click();
    $('export').click();const historical=JSON.parse(await downloaded.text());
    assert($('scenario').value===historical.selectedRun.scenario,'history scenario mismatch');
    if($('policy'))assert($('policy').value===historical.selectedRun.policyVersion,'history policy mismatch');
    assert($('status').textContent.includes(historical.selectedRun.policyVersion),'stale history status');
    URL.createObjectURL=originalCreateObjectURL;HTMLAnchorElement.prototype.click=originalClick;
    $('export').click();
    return {checks:reports,downloadFile:'agent-crash-lab-'+historical.selectedRun.scenario+($('policy')?'-'+historical.selectedRun.policyVersion:'')+'-evidence.json'};
  })()`);
  let downloadedEvidence;
  for(let attempt=0;attempt<100;attempt++){
    try{downloadedEvidence=JSON.parse(await readFile(join(downloadPath,report.downloadFile),'utf8'));break;}catch{await delay(50);}
  }
  if(!downloadedEvidence?.selectedRun||downloadedEvidence.comparison.scenario!==downloadedEvidence.selectedRun.scenario)throw Error('Actual evidence download failed');
  if(downloadedEvidence.policyVersion!==downloadedEvidence.selectedRun.policyVersion)throw Error('Downloaded policy mismatch');
  if(errors.length)throw Error('Browser exceptions: '+errors.join(', '));
  await mkdir('results',{recursive:true});
  await writeFile('results/browser-check-evidence.json',JSON.stringify(report,null,2));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  if(!await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))throw Error('Mobile layout overflows');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const {cssContentSize}=await send('Page.getLayoutMetrics',{},sessionId);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1}},sessionId);
  await writeFile('results/browser-check.png',Buffer.from(screenshot.data,'base64'));
  console.log(JSON.stringify({browser:info.Browser,checks:report.checks.length,results:report.checks,download:report.downloadFile,screenshot:'results/browser-check.png'},null,2));
}finally{
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}
  if(browser.exitCode===null){const closed=once(browser,'exit');browser.kill();await Promise.race([closed,delay(3000)]);}
  for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Browser closed'));}pending.clear();
  await new Promise(r=>server.close(r));
  // Delete only this explicitly created temporary browser profile.
  if(dirname(resolve(profile))!==resolve(tmpdir())||!profile.includes('agent-crash-lab-browser-'))throw Error('Unexpected profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
