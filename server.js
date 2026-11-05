import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runExperiment,scenarios,policies} from './engine.js';
import {modelScenarios} from './documents.js';
import {runModelTrial} from './model-runner.js';
export function createServer({modelRunner=runModelTrial}={}){
 const history=[];
 return http.createServer(async(req,res)=>{
  const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(type==='application/json'?JSON.stringify(body):body);};
  const address=res.socket.localAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return send(403,{error:'Loopback only'});
  const host=req.headers.host;
  if(!host||!/^127\.0\.0\.1:\d+$/.test(host))return send(403,{error:'Invalid host; use 127.0.0.1'});
  if(req.method==='POST'){
   if(req.headers.origin!==`http://${host}`||req.headers['x-lab-request']!=='1')return send(403,{error:'Same-origin request required'});
   if(req.url!=='/api/run')return send(404,{error:'Unknown action'});
   let raw='';try{
    for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024)return send(413,{error:'Request too large'});}
    const input=JSON.parse(raw);
    if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['mode','scenario','policyVersion','execution','seed','trialIndex'].includes(k)))return send(400,{error:'Invalid request fields'});
    if(input.execution!==undefined&&!['scripted-fixture','local-model'].includes(input.execution))return send(400,{error:'Invalid execution'});
    if((input.seed!==undefined&&(!Number.isSafeInteger(input.seed)||input.seed<0||input.seed>2147483647))||(input.trialIndex!==undefined&&(!Number.isSafeInteger(input.trialIndex)||input.trialIndex<0)))return send(400,{error:'Invalid trial settings'});
    if(!['baseline','protected'].includes(input.mode))return send(400,{error:'Invalid mode'});
    if(input.scenario !== undefined && !(input.execution==='local-model'?modelScenarios:scenarios).includes(input.scenario))return send(400,{error:'Invalid scenario'});
    if(input.policyVersion !== undefined && !policies.includes(input.policyVersion))return send(400,{error:'Invalid policy'});
    let result;
    try{result=input.execution==='local-model'?await modelRunner({mode:input.mode,scenario:input.scenario,policyVersion:input.policyVersion,seed:input.seed,trialIndex:input.trialIndex}):runExperiment(input.mode,input.scenario,input.policyVersion);}catch(error){return send(409,{error:error.message});}
    history.unshift(result);history.splice(50);return send(200,result);
   }catch{return send(400,{error:'Invalid JSON request'});}
  }
  if(req.method!=='GET')return send(405,{error:'Method not allowed'});
  if(req.url==='/api/runs')return send(200,history);
  const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/comparison.js':['comparison.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  const asset=assets[req.url];if(!asset)return send(404,{error:'Not found'});
  try{return send(200,await readFile(new URL('./public/'+asset[0],import.meta.url)),asset[1]);}catch{return send(500,{error:'Asset unavailable'});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||5080);createServer().listen(port,'127.0.0.1',()=>console.log(`Agent Crash Lab: http://127.0.0.1:${port} — scripted fixtures / opt-in local Ollama`));}
