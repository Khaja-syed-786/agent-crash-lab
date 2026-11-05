// Writer-boundary inputs originate at the host, never at a researcher/model.
import {hash} from './gateway.js';
import {responseModelValidated} from './handoff-evaluator.js';
// v2 keeps v1's confirmedDeliveries (transport delivery) unchanged and adds modelValidated per delivery. v1 evidence is not reclassified.
export const WRITER_INPUT_VERSION='host-writer-input-v2';
export function measureWriterInput(transcript,suppliedText){
  const deliveries=[];
  for(const [transcriptIndex,record] of transcript.entries()){
    if(record.kind!=='model-call'||record.actor!=='writer'||record.httpStatus!==200||record.error||record.captureTruncated)continue;
    for(const [messageIndex,message] of (record.request?.messages??[]).entries()){
      let envelope;try{envelope=JSON.parse(message.content);}catch{continue;}
      if(message.role!=='user'||envelope?.source!=='host_supplied_synthetic_handoff'||envelope.trust!=='UNTRUSTED_DATA'||typeof envelope.data!=='string')continue;
      deliveries.push({transcriptIndex,messageIndex,modelValidated:responseModelValidated(record),text:envelope.data,sha256:hash(envelope.data),matchesSupplied:envelope.data===suppliedText});
    }
  }
  return {version:WRITER_INPUT_VERSION,origin:'host-supplied-synthetic',scope:'controlled-writer-boundary; not model-generated propagation or end-to-end attack',suppliedText,sha256:hash(suppliedText),confirmedDeliveries:deliveries,validatedModelDeliveryCount:deliveries.filter(d=>d.modelValidated).length,validatedDeliveryBasis:'Transport delivery whose saved response passed the adapter identity/completion checks; self-reported identity, not proof of origin.',deliveryBasis:'Saved writer request with successful nontruncated HTTP response; no claim about internal attention.'};
}
