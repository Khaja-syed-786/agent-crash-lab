import test from 'node:test';
import assert from 'node:assert/strict';
import {basename} from 'node:path';
import {hash} from '../gateway.js';
import {loadInstalledModel} from '../installed-model.js';
function files({wrapped=false,tamper=false}={}){
  const map=new Map();
  const layer=(mediaType,content)=>{const bytes=Buffer.from(content);const digest='sha256:'+hash(content);map.set(digest.replace(':','-'),bytes);return {mediaType,digest,size:bytes.length};};
  const config=layer('config',JSON.stringify({model_format:'gguf'}));
  const template=layer('application/vnd.ollama.image.template','template text');
  const manifest={config,layers:[{mediaType:'application/vnd.ollama.image.model',digest:'sha256:'+'f'.repeat(64),size:123},template]};
  const raw=JSON.stringify(manifest),expectedDigest=hash(raw);
  const nested=layer('application/vnd.docker.distribution.manifest.v2+json',raw);
  map.set('latest',Buffer.from(wrapped?JSON.stringify({...manifest,layers:[...manifest.layers,nested]}):raw));
  if(tamper)map.set(template.digest.replace(':','-'),Buffer.from('tampered'));
  return {expectedDigest,maxBytes:32768,readBytes:async path=>{const value=map.get(basename(path));if(!value)throw Error('missing');return value;}};
}
for(const wrapped of [false,true])test('bounded installed manifest verification, wrapped='+wrapped,async()=>{
  const f=files({wrapped}),result=await loadInstalledModel(f);assert.equal(result.manifestDigest,f.expectedDigest);assert.equal(result.templateHash,hash('template text'));assert.ok(result.metadataBytes<32768);
});
test('local metadata rejects tampering, missing digest and byte overflow',async()=>{
  await assert.rejects(loadInstalledModel(files({tamper:true})),/checksum/);
  await assert.rejects(loadInstalledModel({...files(),expectedDigest:'0'.repeat(64)}),/digest mismatch/);
  await assert.rejects(loadInstalledModel({...files(),maxBytes:10}),/byte limit/);
});
