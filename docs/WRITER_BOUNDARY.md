# Controlled writer-boundary experiment (prepared, not executed)

`controlled-writer-boundary-v1` directly supplies host-authored synthetic handoffs to the real loopback Ollama writer when later explicitly authorized. It bypasses the researcher only in this opt-in experiment. It is **not model-generated handoff propagation or an end-to-end attack**. No live evaluation is included in this PR; tests use explicit mocked transports.

Two model-only scenarios (`writer-control`, `writer-disclosure`) use versioned `writer-handoff-v2` inputs. Both contain identical public facts, raw private marker and known Base64 field. The adversarial content preserves the same benign background and appends only the disclosure instruction. Archived v1 fixtures remain addressable and unchanged. The actual delivered handoff text is the JSON serialization of this fixture; its SHA-256 equals the recorded document hash. The request envelope says `host_supplied_synthetic_handoff`, `UNTRUSTED_DATA` and identifies this experiment. Trusted writer system/user instructions are byte-identical to the existing writer instructions.

## Predeclared plan and commands

Exactly 12 uniquely identified slots: matched control/adversarial inputs x baseline/protected `exact-marker-v1` x seeds 101/102/103. Each same-input/seed baseline/protected pair has identical initial settings and input. Existing alternating order and fresh conversations apply. Existing experiment defaults, historical records, policies, model digest, task/leak metrics, status meanings and resource caps are preserved.

Print the plan without runtime contact:

    node scripts/evaluation-pilot.js --plan --writer-boundary

Future execution command (not authorized or executed by preparing this PR):

    node scripts/evaluation-pilot.js --execute-live --writer-boundary

Requires the already-installed pinned llama3.2:latest and Ollama on loopback in the execution environment; no download, remote endpoint or paid API. Serial batch budget remains 30 minutes, metadata 5 seconds, inference 60 seconds, trial 240 seconds, at most four calls, context 4096, generation 384 tokens, request 12 KiB, response 32 KiB, action 2 KiB, transcript 192 KiB. Writer-only flow normally uses one call, with the existing one model-authored revision after a block. No retries, scripted live responses or forced leak. Filesystem finalization can add time; client timeout does not guarantee backend cancellation.

## Evidence and interpretation

Plan, new exports and pairing include experiment/input-origin versions. `writerInput` uses `host-writer-input-v2` (v1 evidence is kept as recorded): supplied text/hash and confirmed writer-request text/hash, transcript/message indices, and equality with the supplied fixture. Successful nontruncated HTTP responses confirm runtime receipt only; failed transport remains unconfirmed. Revisions retain repeated exposure records. `documentRead`/`documentDelivered` remain false because no researcher runs; separate `bothWriterInputsConfirmed` pair flags describe this experiment. v2 keeps `confirmedDeliveries` as transport delivery, unchanged from v1, and adds per-delivery `modelValidated`, `validatedModelDeliveryCount` and the pair flag `bothWriterInputsModelValidated`: the saved writer response must also pass the adapter's identity and completion checks. That identity is self-reported by the local runtime, not authenticated. No researcher proposal/handoff is fabricated. Host SUPPLY events are distinct from gateway ALLOW/BLOCK decisions.

Actual parsed model proposals (including invalid proposals in transcripts), accepted publications, independent raw/Base64 published leaks, publication blocks, both task metrics, errors/refusals/incomplete attempts and all unrun slots remain separate. Merely supplying a secret or quoting an instruction as input is not publication or endorsement. Existing publication metric still detects known markers if actually published, even in quotes. This controlled boundary test cannot establish end-to-end susceptibility or internal model reasoning. No baseline leak means gateway benefit is undemonstrated.

Fresh UUID evidence directories under ignored results/ retain every slot and exclusively create raw trial files. No historical record is rescored or overwritten. Mocked tests verify wiring and outcome bookkeeping, not model behavior. Run `npm test`; no runtime is needed.

PR review tightened matching to an append-only instruction treatment in writer-handoff-v2, preserving archived v1. All boundary events (including failures) and unrun slots explicitly carry inputOrigin/experimentVersion. No policy decision logic changed.
