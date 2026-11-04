// Only this fixed local endpoint and this already-installed model are permitted.
import {loadInstalledModel} from './installed-model.js';
export const MODEL='llama3.2:latest';
export const MODEL_DIGEST='a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72';
export const ENDPOINT='http://127.0.0.1:11434';
export const LIMITS=Object.freeze({metadataMs:5000,callMs:60000,trialMs:240000,maxCalls:4,requestBytes:12*1024,responseBytes:32*1024,actionBytes:2*1024,transcriptBytes:192*1024});
export const OPTIONS=Object.freeze({num_ctx:4096,num_predict:384,temperature:0.2});
export const PROMPT_VERSION='local-roles-v1';
export const ACTION_SCHEMA={anyOf:['read_document','handoff','publish','finish','refuse'].map(action=>({type:'object',properties:{action:{const:action},...(['read_document'].includes(action)?{}:{text:{type:'string'}})},required:['action',...(['handoff','publish'].includes(action)?['text']:[])],additionalProperties:false}))};
export class TrialError extends Error{
  constructor(status,message,extra={}){super(message);this.status=status;Object.assign(this,extra);}
}
export function boundedLimits(overrides={}){
  const limits={...LIMITS};
  for(const [key,value] of Object.entries(overrides)){
    if(!(key in limits)||!Number.isInteger(value)||value<1||value>limits[key])throw Error('Limits can only be tightened');
    limits[key]=value;
  }
  return limits;
}
export function createTranscript(limit){
  const records=[];let bytes=2,truncated=false;
  return {records,get bytes(){return bytes;},get truncated(){return truncated;},append(entry){
    const serialized=JSON.stringify(entry),size=Buffer.byteLength(serialized)+1;
    if(bytes+size>limit){truncated=true;throw new TrialError('limit_exceeded','Transcript limit reached',{captureTruncated:true});}
    records.push(JSON.parse(serialized));bytes+=size;
  }};
}
export function validateAction(action,actor,expected,maxBytes=LIMITS.actionBytes){
  if(!action||Array.isArray(action)||typeof action!=='object')throw new TrialError('invalid_output','Action must be an object');
  if(!['action','text'].includes(Object.keys(action)[0])||Object.keys(action).some(k=>!['action','text'].includes(k)))throw new TrialError('invalid_output','Unknown action fields');
  if(!['read_document','handoff','publish','finish','refuse'].includes(action.action))throw new TrialError('invalid_output','Unknown action');
  const needsText=['handoff','publish'].includes(action.action);
  if((needsText&&typeof action.text!=='string')||('text' in action&&(typeof action.text!=='string'||!action.text.trim()||Buffer.byteLength(action.text)>maxBytes)))throw new TrialError('invalid_output','Missing, empty, or oversized action text');
  if(action.action==='read_document'&&'text' in action)throw new TrialError('invalid_output','read_document accepts no arguments');
  if(!['finish','refuse',expected].includes(action.action)||!({researcher:['read_document','handoff','finish','refuse'],writer:['publish','finish','refuse']}[actor]?.includes(action.action)))throw new TrialError('invalid_output','Wrong role or out-of-order action');
  return action;
}
export function createOllamaAdapter({fetchImpl=globalThis.fetch,limits:overrides={},metadataLoader=loadInstalledModel}={}){
  const limits=boundedLimits(overrides);
  async function request(path,body,{deadline,ledger,actor='runtime',inference=false}){
    if(!['/api/version','/api/tags','/api/chat'].includes(path))throw Error('Unsupported local endpoint');
    const startedAt=new Date().toISOString(),started=Date.now();
    const entry={kind:inference?'model-call':'metadata',actor,path,startedAt,request:body===undefined?null:structuredClone(body),rawResponse:'',captureTruncated:false};
    const bodyText=body===undefined?undefined:JSON.stringify(body);
    if(bodyText&&Buffer.byteLength(bodyText)>limits.requestBytes)throw new TrialError('limit_exceeded','Request limit reached');
    const remaining=deadline-Date.now();if(remaining<=0)throw new TrialError('timeout','Trial deadline exceeded');
    const controller=new AbortController();
    const untilAbort=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new TrialError('timeout','Request deadline exceeded',{cancellationUncertain:inference})),{once:true}));
    const timer=setTimeout(()=>controller.abort(),Math.min(remaining,inference?limits.callMs:limits.metadataMs));
    let failure,reader;
    try{
      const response=await Promise.race([untilAbort,fetchImpl(ENDPOINT+path,{method:body===undefined?'GET':'POST',body:bodyText,headers:body===undefined?{}:{'Content-Type':'application/json'},redirect:'error',signal:controller.signal})]);
      entry.httpStatus=response.status;
      if(response.redirected||(response.url&&response.url!==ENDPOINT+path))throw new TrialError('runtime_failure','Redirect or endpoint mismatch');
      reader=response.body?.getReader();if(!reader)throw new TrialError('runtime_failure','Missing response body');
      const chunks=[];let size=0;
      while(true){
        const {done,value}=await Promise.race([untilAbort,reader.read()]);if(done)break;
        const remainingBytes=limits.responseBytes-size;
        if(value.length>remainingBytes){chunks.push(value.slice(0,remainingBytes));entry.captureTruncated=true;entry.rawResponse=Buffer.concat(chunks).toString('utf8');controller.abort();throw new TrialError('limit_exceeded','Response byte limit exceeded',{cancellationUncertain:inference,captureTruncated:true});}
        chunks.push(value);size+=value.length;
        entry.rawResponse=Buffer.concat(chunks).toString('utf8');
      }
      if(controller.signal.aborted||Date.now()>deadline)throw new TrialError('timeout','Request deadline exceeded',{cancellationUncertain:inference});
      if(!response.ok)throw new TrialError('runtime_failure',`Ollama HTTP ${response.status}`);
      let data;try{data=JSON.parse(entry.rawResponse);}catch{throw new TrialError(inference?'invalid_output':'runtime_failure','Malformed runtime JSON');}
      if(data?.error)throw new TrialError('runtime_failure',String(data.error).slice(0,512));
      return data;
    }catch(error){
      failure=error instanceof TrialError?error:new TrialError(controller.signal.aborted?'timeout':'runtime_failure',controller.signal.aborted?'Request deadline exceeded':String(error.message).slice(0,512),{cancellationUncertain:inference});
      if(entry.captureTruncated)failure.captureTruncated=true;
      entry.error={status:failure.status,message:failure.message};
      if(failure.status==='timeout')entry.captureTruncated=true;
      throw failure;
    }finally{
      clearTimeout(timer);entry.durationMs=Date.now()-started;
      // Every transport response is retained before any proposed action can execute.
      try{ledger.append(entry);}catch(error){if(failure?.cancellationUncertain)error.cancellationUncertain=true;throw error;}
      if(controller.signal.aborted&&reader)void reader.cancel().catch(()=>{});
    }
  }
  return {limits,async preflight(context){
    const version=await request('/api/version',undefined,context);
    const tags=await request('/api/tags',undefined,context);
    const model=tags.models?.find(m=>m.name===MODEL);
    if(!model||model.digest!==MODEL_DIGEST)throw new TrialError('runtime_failure','Installed model missing or digest changed; no download attempted');
    if(model.remote_host||model.remote_model||model.details?.format!=='gguf'||!model.capabilities?.includes('completion'))throw new TrialError('runtime_failure','Cloud or unsupported model rejected');
    let timer,metadata;
    try{
      metadata=await Promise.race([metadataLoader({expectedDigest:MODEL_DIGEST,maxBytes:limits.responseBytes}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new TrialError('timeout','Local metadata deadline exceeded')),Math.max(1,Math.min(limits.metadataMs,context.deadline-Date.now())));})]);
      context.ledger.append({kind:'local-metadata',verification:metadata});
    }catch(error){throw error instanceof TrialError?error:new TrialError('runtime_failure',error.message);}finally{clearTimeout(timer);}
    return {name:MODEL,digest:model.digest,endpoint:ENDPOINT,runtimeVersion:version.version,details:model.details,capabilities:model.capabilities,...metadata};
  },async chat(messages,{seed,actor,...context}){
    const conservativeInputBound=512+messages.reduce((sum,m)=>sum+Buffer.byteLength(m.content)+64,0);
    if(conservativeInputBound+OPTIONS.num_predict>OPTIONS.num_ctx)throw new TrialError('limit_exceeded','Conversation exceeds conservative context budget; no truncation attempted');
    const body={model:MODEL,messages,format:ACTION_SCHEMA,stream:false,options:{...OPTIONS,seed},keep_alive:'5m'};
    const data=await request('/api/chat',body,{...context,actor,inference:true});
    if(data.model!==MODEL)throw new TrialError('runtime_failure','Response model identity mismatch');
    if(data.done!==true||data.done_reason!=='stop'||!Number.isInteger(data.prompt_eval_count)||data.prompt_eval_count<1||data.prompt_eval_count+OPTIONS.num_predict>OPTIONS.num_ctx||!Number.isInteger(data.eval_count)||data.eval_count<1||data.eval_count>OPTIONS.num_predict)throw new TrialError('invalid_output','Incomplete, truncated, or invalid token accounting');
    if(data.message?.role!=='assistant'||typeof data.message.content!=='string'||data.message.tool_calls?.length)throw new TrialError('invalid_output','Expected a single JSON action response');
    let action;try{action=JSON.parse(data.message.content);}catch{throw new TrialError('invalid_output','Model content is not valid action JSON');}
    return {action,message:data.message,metrics:{promptTokens:data.prompt_eval_count,outputTokens:data.eval_count,doneReason:data.done_reason,totalDurationNs:data.total_duration,loadDurationNs:data.load_duration}};
  }};
}
