# Independent remediation import review

## Import provenance

Expected/current base: 6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b. Origin/main had not advanced. The supplied bundle verified; its only head was 7f90efd37f5a925f0c82afa3a2aa4f2c8b5bf8b1, with exactly that parent, tree 44535101a22432e75f188af1827d8880bb0c1bce, and both author and committer Khaja Syed using the configured GitHub noreply identity. All 39 changed files and the code/test/artifact diff were reviewed. The bundle, diff and patch have identical stable patch IDs; only bundle content was imported.

The original commit contains an external AI-session URL trailer. It was excluded from the public import's message; existing coauthor attribution was retained. The original bundle/commit is retained locally and is not an ancestor of the review branch. Import commit 81e9689 preserves the exact supplied tree. Additional review changes follow separately; main and historical evidence are untouched. No credentials, raw live-model reports, unrelated project content or machine-specific user paths were found in the supplied tree. Browser JSON files are supplied synthetic browser-test artifacts, not live model evidence.

## Independently reproduced behavior

- Original tracked base suite: 233 passed, zero failures.
- Added base behavioral reproductions: 18 tests, 6 passed and 12 failed, zero skips. Eight failures in security-defect-repro and four in security-pair-cli reproduce actual behavior. Four preserved-semantics tests and two positive controls passed. These tests use existing base APIs. New-API import failures are not counted as defect reproductions; that test file was not copied onto the base.
- Unmodified supplied suite here: 283 tests, 281 passed and 2 failed, zero skips, on Windows with Node v24.19.0. Both failures concerned duplicate-case child environment keys, which Windows cannot represent independently. The supplier's reported Node 22/24 results were not assumed to apply here.
- Review regressions reproduced a quoted NODE_OPTIONS proxy bypass, non-byte-exact recorded metadata hashes, and runtime contact for a hash-consistent but incompatible pair. Network preloads/stand-ins prevented real runtime contact in reproductions.

## Findings and focused changes

| Severity | Finding | Resolution |
|---|---|---|
| Medium, non-default local environment | Quoting --use-env-proxy in NODE_OPTIONS enabled proxying but escaped the supplied guard. | Guard accepts quoted flag boundaries; child-process regression confirms refusal before transport. This does not defend custom dispatchers installed by in-process code. |
| Low, evidence provenance | Blob/manifest verification used bytes, but returned config hashes still reserialized JSON and template/system/parameter hashes still decoded UTF-8. | Every returned metadata hash now uses verified raw bytes, with raw-bytes-v1 provenance included in pairing. No historical hash is changed. |
| Low, unnecessary execution / invalid comparison | A hash-valid counterpart with incompatible settings/basis could cause runtime contact before becoming an empty comparison. | Validate knowable comparison context before runtime contact; tests cover mode, seed, metric/status version, source and mock basis. Runtime-specific validation still follows. Unsigned hashes do not prove origin. |
| Low, reproduction safety | The supplied F2 script's default/bypass paths could contact installed Ollama despite claiming otherwise. | Nominal runtime requests are mapped to an ephemeral synthetic stand-in; default-path regression proves termination. Fixed-port matrix remains opt-in and was not run against occupied runtime port. |
| Verification portability | Child tests assumed distinct lowercase/uppercase environment names; browser --version invocation is unsuitable on Windows. | Native routing tests account for Windows while pure POSIX precedence tests remain. Browser version comes from CDP; browser outcomes are asserted. |

Runtime message filtering and adapter-scoped cancellation halt were reviewed and reproduced. The halt intentionally does not cover a newly constructed adapter, another process, or overlapping already-running closures. The adapter still trusts the loopback listener and self-reported model identity. Envelope/modelValidated means the documented identity/completion checks passed, not proof of weights, valid action JSON, or task success.

Transport-delivery fields retain their old meanings. handoff-text-v3 and host-writer-input-v2 add model-validation fields; trial-status-v2 distinguishes malformed HTTP JSON from invalid model action content. pilot-summary-v2 preserves raw observation counters and adds validated/rejected/unchecked/comparable counts. Raw recorded task/leak counters can include rejected-context observations; interpret the separate integrity counts and per-trial flags, not a protection rate. No previous evidence is recomputed. Hash chains cannot detect removed tails or empty chains without a separately retained final hash/count; evidenceHash is unsigned and can be recomputed by a writer.

Release tag/package-version agreement was reviewed and tested without creating any tags or releases. Existing governance/workflow proposals in the supplied assessment remain proposals; no repository settings or workflows were changed by this review.

## Local verification and limits

Final local npm test: 292 passed, zero failures, zero skips. The first overlapping browser/test run hit an existing synthetic 10-second timing assertion under load; a clean full run with the original assertions restored passed. Hosted CI results are recorded in the PR description after completion. Locally available runtime: Node v24.19.0; no additional Node/model/browser runtime was downloaded. Node 22 and 24 are also checked by hosted CI. Fresh test/browser reports stay under ignored results/ and are not committed.

The existing dashboard check passed using installed Chrome with explicit mocked model output. The supplied cross-origin harness, adapted for Windows, passed on Chrome/156.0.8078.79 and Node v24.19.0: two loopback origins, 11 attempts per origin, same-origin positive control passed, one run before/after each pass, no cross-origin response read and no new run. These observations do not cover all browsers, public origins, DNS-rebinding resolvers, extensions or Private Network Access behavior.

No live inference, downloads, paid services, merge, tag, release, settings change or force push occurred. Local static scans are not proof that no secrets or ownership issues exist. Original three live batches remain unchanged and their conclusions are not reclassified. OpenOrbia and SOC Range are outside scope.
