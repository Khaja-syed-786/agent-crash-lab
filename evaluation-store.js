// Raw prompts/outputs belong only under ignored results/, never source control.
import {mkdir,writeFile,rename,realpath,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const resultsRoot=fileURLToPath(new URL('./results/',import.meta.url));
const within=(base,target)=>{const r=relative(base,target);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
export function createEvaluationStore(root=join(resultsRoot,'evaluations')){
  const target=resolve(root);if(!within(resolve(resultsRoot),target))throw Error('Raw evidence must stay under ignored results/');
  let directory;
  async function checkpoint(batch){
    if(!directory)throw Error('Store not initialized');
    const temporary=join(directory,`manifest-${randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify(batch,null,2),{flag:'wx'});
    await rename(temporary,join(directory,'manifest.json'));
  }
  return {get directory(){return directory;},async initialize(batch){
    if(directory)throw Error('Evidence store cannot be reused');
    if(typeof batch.id!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(batch.id))throw Error('Invalid batch ID');
    await mkdir(resultsRoot,{recursive:true});if((await lstat(resultsRoot)).isSymbolicLink())throw Error('Results root cannot be a symlink');
    await mkdir(target,{recursive:true});if(!within(await realpath(resultsRoot),await realpath(target)))throw Error('Evidence path escapes results/');
    directory=join(target,batch.id);await mkdir(directory);await checkpoint(batch);
  },checkpoint,async saveTrial(trial,evidence){
    if(!directory)throw Error('Store not initialized');
    if(!Number.isInteger(trial.index)||trial.index<0||trial.index>=12||! /^[a-f0-9-]{36}$/.test(evidence.selectedRun.id))throw Error('Invalid trial evidence filename');
    const file=`trial-${String(trial.index).padStart(2,'0')}-${evidence.selectedRun.id}-evidence.json`;
    await writeFile(join(directory,file),JSON.stringify(evidence,null,2),{flag:'wx'});return file;
  }};
}
