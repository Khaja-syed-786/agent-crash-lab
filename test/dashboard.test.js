import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {runExperiment} from '../engine.js';
import {comparisonFor,evidenceFor} from '../public/comparison.js';

test('dashboard scenario changes, history selection and export stay paired',async()=>{
  // Minimal DOM harness runs the actual dashboard handlers without a browser dependency.
  function element(){return {textContent:'',value:'direct-leak',disabled:false,children:[],
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(){this.children=[];this.textContent='';},click(){this.onclick?.();}};}
  const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('policy').value='exact-marker-v1';
  const direct=runExperiment('baseline','direct-leak');
  const encoded=runExperiment('protected','base64-leak');
  let runs=[encoded,direct], exported, posted;
  const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace("import {comparisonFor,evidenceFor} from './comparison.js';",'');
  runInNewContext(source,{
    comparisonFor,evidenceFor,document:{getElementById:get,createElement:element},
    fetch:async(url,options)=>{
      if(options){posted=JSON.parse(options.body);const result=runExperiment(posted.mode,posted.scenario,posted.policyVersion);runs=[result,...runs];return {ok:true,json:async()=>result};}
      return {ok:true,json:async()=>runs};
    },Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout:()=>0
  });
  await new Promise(r=>setImmediate(r));
  assert.equal(get('protected-result').textContent,'No protected run for this scenario and policy.');
  get('scenario').value='public-summary';get('scenario').onchange();
  assert.equal(get('export').disabled,true);
  assert.equal(get('timeline-label').textContent,'No run selected');
  get('history').children[0].click();
  assert.equal(get('scenario').value,'base64-leak');
  assert.equal(get('baseline-result').textContent,'No baseline run for this scenario and policy.');
  assert.match(get('protected-result').children[0].textContent,/leak detected/);
  assert.match(get('protected-result').children[2].textContent,/0$/);
  get('export').click();
  const evidence=JSON.parse(await exported.text());
  assert.equal(evidence.selectedRun.id,encoded.id);
  assert.equal(evidence.comparison.scenario,'base64-leak');
  assert.equal(evidence.comparison.baseline,null);
  get('scenario').value='public-summary';get('scenario').onchange();
  await get('protected').onclick();
  assert.deepEqual(posted,{mode:'protected',scenario:'public-summary',policyVersion:'exact-marker-v1'});
  assert.equal(get('scenario').disabled,false);
  assert.match(get('protected-result').children[0].textContent,/no known marker/);
  get('export').click();
  const publicEvidence=JSON.parse(await exported.text());
  assert.equal(publicEvidence.comparison.scenario,'public-summary');
  assert.equal(publicEvidence.comparison.baseline,null);
  get('policy').value='raw-base64-fixture-v1';get('policy').onchange();
  assert.equal(get('export').disabled,true);
  assert.equal(get('protected-result').textContent,'No protected run for this scenario and policy.');
  get('scenario').value='base64-leak';get('scenario').onchange();
  await get('protected').onclick();
  assert.equal(posted.policyVersion,'raw-base64-fixture-v1');
  assert.match(get('protected-result').children[0].textContent,/no known marker/);
  assert.match(get('protected-result').children[2].textContent,/1$/);
  assert.equal(get('policy-label').textContent,'raw-base64-fixture-v1');
  get('export').click();
  const targetedEvidence=JSON.parse(await exported.text());
  assert.equal(targetedEvidence.policyVersion,'raw-base64-fixture-v1');
  assert.equal(targetedEvidence.comparison.baseline,null);
  // Revisit the original Base64 history entry: both selectors must return to its identity.
  get('history').children[2].click();
  assert.equal(get('scenario').value,'base64-leak');
  assert.equal(get('policy').value,'exact-marker-v1');
  assert.match(get('protected-result').children[0].textContent,/leak detected/);
  get('export').click();
  const originalEvidence=JSON.parse(await exported.text());
  assert.equal(originalEvidence.policyVersion,'exact-marker-v1');
  assert.equal(originalEvidence.selectedRun.id,encoded.id);
  assert.match(get('status').textContent,/Viewing scripted protected fixture: Base64-encoded synthetic-secret leak \/ exact-marker-v1/);
});
