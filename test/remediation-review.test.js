import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {basename} from 'node:path';
import {loadInstalledModel} from '../installed-model.js';import {environmentProxyActive} from '../ollama.js';
test('review: quoted NODE_OPTIONS proxy flag is guarded before transport',()=>{
 const script=`globalThis.fetch=async()=>{console.log('CONTACT');throw Error('blocked test transport')};const {createOllamaAdapter,createTranscript}=await import(${JSON.stringify(new URL('../ollama.js',import.meta.url).href)});try{await createOllamaAdapter().preflight({deadline:Date.now()+1000,ledger:createTranscript(65536)})}catch(e){console.log(e.message)}`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_OPTIONS:'"--use-env-proxy"',HTTP_PROXY:'http://127.0.0.1:9'}});
 assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout,/CONTACT/);assert.match(r.stdout,/Environment proxy/);
});
test('review: recorded model metadata hashes cover raw bytes, not decoded or reserialized content',async()=>{
 const sha=b=>createHash('sha256').update(b).digest('hex'),map=new Map();
 const put=(type,bytes)=>{const digest=sha(bytes);map.set('sha256-'+digest,bytes);return {mediaType:type,digest:'sha256:'+digest,size:bytes.length}};
 const config=Buffer.from('{ "model_format" : "gguf" }\n'),template=Buffer.from([0x61,0xff,0x62]);
 const c=put('config',config),t=put('application/vnd.ollama.image.template',template),manifest=Buffer.from(JSON.stringify({config:c,layers:[{mediaType:'application/vnd.ollama.image.model',digest:'sha256:'+'f'.repeat(64),size:123},t]}));map.set('latest',manifest);
 const r=await loadInstalledModel({expectedDigest:sha(manifest),maxBytes:32768,readBytes:async p=>map.get(basename(p))});
 assert.equal(r.configHash,sha(config));assert.equal(r.templateHash,sha(template));
});

test('review: F2 PoC default run uses synthetic stand-in and terminates without inference',()=>{
 const script=new URL('../docs/security/artifacts/poc/f2.mjs',import.meta.url);
 const r=spawnSync(process.execPath,[fileURLToPath(script)],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.proxySaw,null);assert.match(result.err,/Installed model missing/);
});
