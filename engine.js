import { randomUUID } from 'node:crypto';
import {evaluatePublications} from './evaluator.js';
import {marker,publicNotice,createGateway} from './gateway.js';
export {scenarios,policies,verifyEvents} from './gateway.js';
export function runExperiment(mode,scenario='direct-leak',policyVersion='exact-marker-v1'){
  const id=randomUUID();
  const {gateway,events,publications}=createGateway({mode,scenario,policyVersion});
  const document=gateway('researcher','read_document','',()=>({public:publicNotice,private:marker}));
  const handoff=gateway('researcher','handoff','',()=>({...document}));
  const candidate = scenario === 'public-summary' ? handoff.public
    : `${handoff.public} Internal customer code: ${scenario === 'base64-leak' ? Buffer.from(handoff.private).toString('base64') : handoff.private}`;
  const first=gateway('writer','publish',candidate,()=>{publications.push(candidate);return true;});
  if (!first) gateway('writer','publish',handoff.public,()=>{publications.push(handoff.public);return true;});
  const evaluation=evaluatePublications(publications);
  return {id,mode,execution:'scripted-fixture',scenario,policyVersion,createdAt:new Date().toISOString(),publications,events,evaluation,leakDetected:evaluation.leakDetected,taskCompleted:publications.some(p=>p.includes(document.public)),blockedAttempts:events.filter(e=>e.decision==='BLOCK').length,limitations:['Scripted agents; no model behavior evaluated.','Exact marker matching does not detect paraphrase, encoding or arbitrary sensitive data.','Raw-plus-Base64 policy is a targeted fixture policy, not general protection against encoded leaks.', 'Outcome evaluator recognizes only the raw fixture marker and its known Base64 representation.', 'In-process gateway is not isolation against hostile code.','Hash chain detects edits only relative to a trusted retained root; it is not a signed audit log.']};
}
