// Bounded read-only metadata inspection; never loads weights or contacts a registry.
import {open,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {hash} from './gateway.js';
export async function loadInstalledModel({expectedDigest,maxBytes,root=process.env.OLLAMA_MODELS||join(homedir(),'.ollama','models'),readBytes}={}){
  let total=0;
  const read=async path=>{
    let bytes;
    if(readBytes)bytes=await readBytes(path);
    else{
      const file=await open(path,'r');
      try{const data=Buffer.alloc(maxBytes+1);let length=0;while(length<data.length){const part=await file.read(data,length,data.length-length,null);if(!part.bytesRead)break;length+=part.bytesRead;}bytes=data.subarray(0,length);}finally{await file.close();}
    }
    total+=bytes.length;if(total>maxBytes)throw Error('Local metadata byte limit exceeded');return bytes;
  };
  const blob=async layer=>{
    if(!/^sha256:[a-f0-9]{64}$/.test(layer?.digest)||!Number.isSafeInteger(layer.size)||layer.size<0||layer.size>maxBytes)throw Error('Invalid metadata layer');
    const bytes=await read(join(root,'blobs',layer.digest.replace(':','-')));
    if(bytes.length!==layer.size||hash(bytes.toString('utf8'))!==layer.digest.slice(7))throw Error('Local metadata checksum mismatch');
    return bytes;
  };
  const raw=await read(join(root,'manifests','registry.ollama.ai','library','llama3.2','latest'));
  const installed=JSON.parse(raw.toString('utf8'));let manifest=installed;
  if(hash(raw.toString('utf8'))!==expectedDigest){
    // Ollama 0.40 wraps older manifests while retaining the original model digest.
    const nested=installed.layers?.find(l=>l.digest==='sha256:'+expectedDigest&&l.mediaType==='application/vnd.docker.distribution.manifest.v2+json');
    if(!nested)throw Error('Local manifest digest mismatch');
    manifest=JSON.parse((await blob(nested)).toString('utf8'));
    const originalLayers=installed.layers.filter(l=>l!==nested);
    if(JSON.stringify(originalLayers)!==JSON.stringify(manifest.layers)||JSON.stringify(installed.config)!==JSON.stringify(manifest.config))throw Error('Wrapped manifest changes pinned model layers');
  }
  const config=JSON.parse((await blob(manifest.config)).toString('utf8'));
  if(config.model_format!=='gguf'||config.remote_host||config.remote_model)throw Error('Only installed local GGUF models are allowed');
  const weight=manifest.layers?.find(l=>l.mediaType==='application/vnd.ollama.image.model');
  if(!weight||!/^sha256:[a-f0-9]{64}$/.test(weight.digest)||!Number.isSafeInteger(weight.size))throw Error('Missing local model weight layer');
  if(!readBytes){const info=await stat(join(root,'blobs',weight.digest.replace(':','-')));if(info.size!==weight.size)throw Error('Installed weights missing or wrong size');}
  const result={manifestDigest:expectedDigest,templateHash:hash(''),systemHash:hash(''),parametersHash:hash(''),configHash:hash(JSON.stringify(config)),modelWeightDigest:weight.digest};
  for(const [kind,key] of [['template','templateHash'],['system','systemHash'],['params','parametersHash']]){
    const layer=manifest.layers.find(l=>l.mediaType==='application/vnd.ollama.image.'+kind);
    if(layer)result[key]=hash((await blob(layer)).toString('utf8'));
  }
  return {...result,metadataBytes:total,verification:'Pinned manifest and small metadata hashes; weight file presence/size checked, weights not rehashed.'};
}
