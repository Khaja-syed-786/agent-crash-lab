// Real-browser cross-origin matrix against a local lab instance. Loopback only; no runtime is contacted
// (all exercised routes use scripted fixtures; installed Ollama is not contacted). Usage, from the repository root:
//   node docs/security/artifacts/browser/run-browser-matrix.mjs [output.json]
// Env: CHROME (browser binary; default google-chrome/chromium on PATH), LAB_PORT (5099), EVIL_PORT (5199).
// Requires Node >= 22 (built-in WebSocket) and a Chromium-family browser with --remote-debugging-port.
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from '../../../../server.js';

const LAB_PORT=Number(process.env.LAB_PORT||5099),EVIL_PORT=Number(process.env.EVIL_PORT||5199);
const LAB=`http://127.0.0.1:${LAB_PORT}`,delay=ms=>new Promise(r=>setTimeout(r,ms));
const CHROME=process.env.CHROME||['google-chrome','chromium','chromium-browser'].find(b=>spawnSync('which',[b]).status===0);
if(!CHROME)throw Error('No Chromium-family browser found; set CHROME');
let browserVersion='unavailable';
const attackHtml=readFileSync(new URL('./attack.html',import.meta.url),'utf8');

// Lab server: unmodified createServer(), wrapped only to log what reached it.
const requests=[];
const lab=createServer();
lab.on('request',(req,res)=>res.on('finish',()=>requests.push({method:req.method,url:req.url.replace(/=\d+$/,'=<ts>'),status:res.statusCode,origin:req.headers.origin??null,host:req.headers.host??null,xLabRequest:req.headers['x-lab-request']??null,contentType:req.headers['content-type']??null})));
await new Promise(r=>lab.listen(LAB_PORT,'127.0.0.1',r));
const evil=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(attackHtml);});
await new Promise(r=>evil.listen(EVIL_PORT,'127.0.0.1',r));

const runCount=async()=>(await (await fetch(LAB+'/api/runs')).json()).length;
// Positive control and seed: one same-origin scripted run (no model).
const seed=await fetch(LAB+'/api/run',{method:'POST',headers:{'Content-Type':'application/json','Origin':LAB,'X-Lab-Request':'1'},body:JSON.stringify({mode:'baseline',scenario:'direct-leak',policyVersion:'exact-marker-v1'})});
if(!seed.ok)throw Error('same-origin positive control failed: '+seed.status);

async function attack(evilOrigin){
  const profile=await mkdtemp(join(tmpdir(),'acl-browser-'));
  const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,`--host-resolver-rules=MAP evil.test 127.0.0.1`,'about:blank'],{stdio:'ignore',windowsHide:true});
  let socket,nextId=0;const pending=new Map(),corsFailures=[];
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  try{
    let port;for(let i=0;i<100&&!port;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await delay(100);}}
    const browserInfo=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();browserVersion=browserInfo.Browser;
    socket=new WebSocket(browserInfo.webSocketDebuggerUrl);await once(socket,'open');
    socket.addEventListener('message',({data})=>{const m=JSON.parse(data);
      if(m.id&&pending.has(m.id)){const j=pending.get(m.id);clearTimeout(j.timer);pending.delete(m.id);m.error?j.reject(Error(JSON.stringify(m.error))):j.resolve(m.result);return;}
      if(m.method==='Network.loadingFailed'&&(m.params.corsErrorStatus||m.params.blockedReason))corsFailures.push({errorText:m.params.errorText,blockedReason:m.params.blockedReason??null,corsError:m.params.corsErrorStatus?.corsError??null});});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    await send('Network.enable',{},sessionId);await send('Runtime.enable',{},sessionId);
    await send('Page.navigate',{url:`${evilOrigin}/?lab=${encodeURIComponent(LAB)}&rebind=${encodeURIComponent(`http://evil.test:${LAB_PORT}`)}`},sessionId);
    for(let i=0;i<200;i++){
      const r=await send('Runtime.evaluate',{expression:'window.__results?JSON.stringify(window.__results):null',returnByValue:true},sessionId);
      if(r.result.value)return {pageResults:JSON.parse(r.result.value),corsFailures};
      await delay(150);
    }
    throw Error('attack page did not finish');
  }finally{
    try{if(socket?.readyState===1){await send('Browser.close');socket.close();}}catch{}
    if(chrome.exitCode===null){chrome.kill();await Promise.race([once(chrome,'exit'),delay(3000)]);}
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

const passes=[];
try{
  for(const evilOrigin of [`http://127.0.0.1:${EVIL_PORT}`,`http://localhost:${EVIL_PORT}`]){
    const before=await runCount();requests.length=0;
    const {pageResults,corsFailures}=await attack(evilOrigin);
    await delay(500); // let the hidden-iframe form submission land
    passes.push({evilOrigin,runsBefore:before,runsAfter:await runCount(),serverSaw:[...requests],pageResults,corsFailures});
  }
  const sameOrigin=await fetch(LAB+'/api/runs');
  const report={harness:'docs/security/artifacts/browser/run-browser-matrix.mjs',browser:browserVersion,node:process.version,lab:LAB,
    positiveControl:{seedStatus:seed.status,sameOriginRunsStatus:sameOrigin.status,sameOriginBodyReadable:(await sameOrigin.text()).length>0},
    passes:passes.map(p=>({...p,runCreated:p.runsAfter!==p.runsBefore}))};
  const text=JSON.stringify(report,null,1);
  if(process.argv[2])await writeFile(process.argv[2],text+'\n');
  console.log(text);
  for(const p of report.passes){if(p.runCreated||p.pageResults.length!==11||p.pageResults.some(r=>r.bodyReadable===true||r.readable===true||r.contentReadable===true))throw Error('Cross-origin browser regression');}
  for(const p of report.passes)console.error(`${p.evilOrigin}: runsBefore=${p.runsBefore} runsAfter=${p.runsAfter} requestsReachingServer=${p.serverSaw.length}`);
}finally{lab.close();evil.close();}
