// Labelled mock/loopback PoC. Run from a checkout root, or set ACL_REPO=<checkout>. No runtime or external host is contacted.
import {pathToFileURL as __u} from 'node:url';import {resolve as __r} from 'node:path';
const R=__u(__r(process.env.ACL_REPO??'.')+'/').href;
const {createGateway,verifyEvents}=await import(R+'gateway.js');
const g=createGateway({mode:'protected',scenario:'direct-leak',policyVersion:'exact-marker-v1',execution:'scripted-fixture'});
g.record('a','read_document','ALLOW','x',{policyApplied:false});
g.record('a','handoff','ALLOW','y',{policyApplied:false});
g.record('w','publish','BLOCK','blocked',{policyApplied:true});
g.record('w','publish','ALLOW','ok',{policyApplied:true});
const ev=g.events;
console.log(JSON.stringify({
  full_chain_valid: verifyEvents(ev),
  tail_truncated_valid: verifyEvents(ev.slice(0,-1)),   // drop last event
  first_two_only_valid: verifyEvents(ev.slice(0,2)),
  empty_chain_valid: verifyEvents([]),
  inplace_edit_valid: (()=>{const c=structuredClone(ev);c[0].details='TAMPERED';return verifyEvents(c);})()
}));
