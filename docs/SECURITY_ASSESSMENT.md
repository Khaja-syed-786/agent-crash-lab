# Agent Crash Lab security assessment

Maintainer import note: this is the supplied assessment, not a blanket endorsement of its claims. See [independent remediation review](REMEDIATION_REVIEW.md) for local reproductions, additional fixes, platform differences and actual verification.

*docs/SECURITY_ASSESSMENT.md. Evidence-based security assessment of [Khaja-syed-786/agent-crash-lab](https://github.com/Khaja-syed-786/agent-crash-lab) at commit `6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b`. Assessed on 2026-11-05.*

Source citations link to the assessed commit. In this document, "B" stands for `https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b`. All model responses were mocked, and no live inference was run. All test data was synthetic. No secret values appear in this document. **Revision 2 (remediation branch):** Sections A.1 and G.0 describe the remediation changes made after the original assessment. Where those sections and the original text below disagree about fix status, A.1 and G.0 are current. Findings, reproductions and ratings are unchanged. Reproduction scripts and browser-test artifacts are exported under [docs/security/artifacts/](security/artifacts/). They are sanitized, so temporary workspace paths in the original text are historical and not durable evidence.

---

## A. Executive summary

**Assessed target.** Commit **`6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b`**, the merge of PR #8, committed 2026-11-05T13:24:35-06:00. The assessment date is **2026-11-05**. Three workstreams covered:

- the HTTP server, dashboard and filesystem;
- the Ollama adapter, agent/gateway and evaluation/evidence;
- CI, release and supply chain.

An independent reviewer then reproduced every result from clean checkouts and ran a real headless-Chrome cross-origin test.

**Overall posture for the intended deployment.** For a single-user workstation with the server bound to loopback, no tested path gave a website or remote peer new access. The conclusions below cover only the configurations and attempts actually tested (see Scope of the browser and HTTP conclusions).

**No finding and no supported attack chain is rated High or Critical.** The most severe realistic issue is a chain capped at **Medium**, and it only applies under a non-default operator environment. That chain is env-proxy tunnelling (F2) plus the evidence-labelling and unsigned-hash weaknesses (F8, F7, F6), and the half of it that depends on real model metadata was not dynamically reproduced.

**The HTTP boundary had zero confirmed vulnerabilities.** Four independent gates protect it:

- a loopback check on the destination address;
- a Host allowlist;
- an Origin match plus the custom `X-Lab-Request` header on the POST route;
- no CORS headers at all.

In the real-browser test, **none of 11 attempts in headless Chrome for Testing 153** created a run, read a response or framed the dashboard. The hostile pages were served from `http://127.0.0.1:5199` and `http://localhost:5199`, against the lab on `127.0.0.1:5099`, plus a rebinding-style `Host: evil.test` request. For that browser, those origins and those attempts, the website → `/api/run` → local Ollama chain was not achievable.

**Scope of the browser and HTTP conclusions.** The following were not tested:

- other browsers or engines (Firefox, Safari, Edge) or older Chrome releases;
- a public HTTPS origin, which would also face Private Network Access checks;
- extensions, enterprise policies or browser flags that relax CORS;
- a full DNS-rebinding flow with a resolver that changes answers (only a mapped name and a forged Host header were tested);
- non-default server bind or port configurations beyond the `0.0.0.0` loopback-guard check.

These results show what the tested defenses did, not that no browser can reach the server.

**The confirmed findings are mostly evidence-integrity and measurement defects.** Eleven issues were confirmed. They sit inside capabilities the local user already holds. The original assessment patched seven of them:

| ID | Finding | Rating | Default config? |
|---|---|---|---|
| F2 | Node env-proxy tunnels the fixed loopback endpoint | Low–Medium | No |
| F1 | Git provenance read from the caller's working directory | Low–Medium | Yes |
| F6 | Unverified `--pair` counterpart | Low–Medium | Yes |
| CI-1 | Release tag not tied to `package.json` | Low | Yes |
| F3 | Lossy UTF-8 checksums | Low | Yes |
| F4 | Echoed runtime message fields | Low | Yes |
| F5 | Per-closure cancellation halt | Low | Yes |

The original assessment reported F7, F8, F9 and F10 without patches, because fixing them changes measurement semantics or documentation wording. **Revision 2 addresses all four**, using new versions where semantics change (Section A.1).

**Regression status.** Original assessment: the combined fix workspace passed 242/242, against a baseline of 233/233. Revision 2: **283/283** (Node 22 and 24) on the remediation branch. The test categories and their behaviour on the base are in Section G.0.

**What this assessment could not do.** It could not see GitHub repository settings. As a result, the release-governance controls (tag rulesets, required review, immutable releases) remain recommendations, not verified facts.


### A.1 Remediation status (revision 2, branch `security/remediation-2026-11`, base `6981b53`)

| ID | Revision 2 change | Versioning / preserved meaning |
|---|---|---|
| F1–F5, CI-1 | Original fixes kept and reviewed. | None needed. |
| F2 | **Contradiction resolved.** The first fix refused whenever env-proxy plus `HTTP_PROXY` were set, but the report advised setting `NO_PROXY=127.0.0.1`, which that fix ignored. The chosen contract: refuse unless the *effective* no-proxy list contains `127.0.0.1`, `127.0.0.1:11434` or `*`. Node's own precedence is mirrored: lowercase `no_proxy` wins, even when empty. `localhost`, CIDR ranges and other ports do not count. Two rows refuse conservatively where Node would actually connect directly (a suffix token, and an empty `http_proxy`). The behaviour was measured on Node 22.23.4 with loopback stand-ins ([matrix](security/artifacts/node-env-proxy-matrix.md)) and is tested with and without `NO_PROXY`. | README documents the operator bypass. |
| F6 | Added a CLI integration test. `scripts/model-trial.js --pair` is run in a child process that records and blocks every fetch and socket connect. Stale, truncated, legacy-unhashed and broken-chain counterparts are rejected with **zero** contact attempts. A consistent counterpart, as the control, does reach the (blocked) runtime. | Legacy counterparts without `evidenceHash` can no longer be paired. |
| F7 | README and the scripted-run limitation string now say the chain catches in-place edits and reordering, but not removed trailing events or an empty chain. The advice changes to retaining the final event hash and event count (and `evidenceHash`) out of band. Nothing was signed, and no authenticity is claimed. | Historical evidence keeps its original limitation text. |
| F8 | `deliveredRecords` and `confirmedDeliveries` keep their meaning (transport delivery). Each record adds `modelValidated`, and each measurement adds `validatedModelDeliveryCount`. Writer-boundary pairs add `bothWriterInputsModelValidated`. A delivery is model-validated only if the saved response passes the same `validateChatResponse` envelope checks the adapter uses. That identity is self-reported, not authenticated. | `handoff-text-v3`, `host-writer-input-v2`. Both are already part of the pairing key, so v2/v3 runs never pair. |
| F9 | Each trial records `integrity` (`validated`/`rejected`) and `integrityError`. Summaries add `validatedOutcomes`, `integrityRejectedOutcomes`, `integrityUncheckedOutcomes` and `comparableOutcomes`, overall and per condition. `outcomesRecorded` keeps its v1 meaning. | `summaryVersion: pilot-summary-v2`. Summaries without it are v1. |
| F10 | An unparseable `/api/chat` HTTP body is now `runtime_failure`, which stops the batch. Non-JSON model content remains `invalid_output`. | `statusTaxonomyVersion: trial-status-v2` on runs and plans, checked per trial and added to comparison identity. Runs without it are v1 and not reclassified. |

All changes are uncommitted on a local branch for review. Nothing was merged, tagged, released or pushed, and no repository settings were changed.

---

## B. Architecture and attack-surface inventory

### A loopback lab with one write route and four static files

Agent Crash Lab is a dependency-free Node application. A localhost dashboard starts scripted or local-model "prompt-injection crash" experiments. In those experiments, a researcher agent reads an untrusted document, hands off to a writer agent, and a cooperative gateway decides whether the writer may publish. Evidence is recorded as hash-chained events. Command-line scripts run bounded local-model evaluation batches against Ollama and write their raw evidence under `results/`. The README describes the gateway as "cooperative execution control, not OS isolation" ([README](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/README.md)).

| Surface | Detail | Source |
|---|---|---|
| `POST /api/run` | The only route that changes state. Body limited to 1024 bytes (413). Field allowlist `mode, scenario, policyVersion, execution, seed, trialIndex` (400). Dispatches to `runExperiment` or, when `execution:"local-model"`, to `runModelTrial`. Results kept in memory, newest 50 retained. | [server.js#L15-L30](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L15-L30) |
| `GET /api/runs` | Returns the in-memory history. | [server.js#L33](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L33) |
| `GET /`, `/app.js`, `/comparison.js`, `/style.css` | A fixed four-entry map of filenames. No file path is built from the URL. | [server.js#L34-L36](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L34-L36) |
| Other methods and paths | 405 for other methods, 404 for unknown paths. | [server.js#L17-L35](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L15-L36) |
| Gates on every request | Loopback check on `res.socket.localAddress` (accepts `127.0.0.1`, `::1`, `::ffff:127.0.0.1`). Host must match `^127\.0\.0\.1:\d+$`. POST also requires `Origin == http://<host>` and `X-Lab-Request: 1`. | [server.js#L11-L16](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L11-L16) |
| Response headers | `Cache-Control: no-store`, `nosniff`, and the CSP `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`. No CORS headers. | [server.js#L10](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L10) |
| Bind address | `listen(PORT‖5080, '127.0.0.1')`. Hardcoded; no environment variable changes it. | [server.js#L39](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L39) |
| Ollama adapter | Endpoint is the constant `http://127.0.0.1:11434`. Path allowlist `/api/version`, `/api/tags`, `/api/chat`. `redirect:'error'` plus a check on the response URL. Pinned model name and digest. | [ollama.js#L10-L12, L49, L60-L62](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L10-L62) |
| Model identity | Runtime-reported `/api/tags` digest; local manifest and metadata blob checksums; weight file checked for size only. | [installed-model.js#L6-L44](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/installed-model.js#L6-L44) |
| Gateway | Role allowlist `{researcher:[read_document,handoff], writer:[publish]}`. Exact-marker and one-known-Base64 blocking policy. SHA-256 event chain starting from 64 zeros. | [gateway.js#L16-L36](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/gateway.js#L16-L36) |
| Evidence store | Confined to `results/` by `lstat` symlink rejection and `realpath` containment. Uses exclusive `mkdir` and `wx` writes, and an atomic manifest rename. | [evaluation-store.js#L6-L36](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-store.js#L6-L36) |
| Child processes | Fixed-argument `git rev-parse HEAD` and `git status --porcelain`. `scripts/browser-check.js` launches local Chrome over CDP; it is a developer tool and does not run in CI. | [model-runner.js#L16-L17](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L16-L17) |
| CI and release | `tests.yml` runs on `pull_request` and on pushes to `main` with `contents: read`. `release.yml` runs on `v*` tags; only its `release` job has `contents: write`. Actions are pinned by SHA with `persist-credentials: false`. | [tests.yml](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.github/workflows/tests.yml), [release.yml](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.github/workflows/release.yml) |

**Assets.** The application handles:

- synthetic fixture documents and a synthetic leak marker;
- the in-memory run history;
- raw evidence files under `results/`;
- the pinned model files in the Ollama store;
- the integrity of recorded provenance and measurements;
- the release job's `contents: write` token and the integrity of published releases.

There are no real credentials. The git history scan found none (Section G).

**Trust boundaries.** Eight are in scope:

1. TB1, web origin → loopback HTTP server.
2. TB2, local process → loopback HTTP server. This boundary is trusted by design.
3. TB3, server and scripts → filesystem and `git`.
4. TB4, adapter → the semi-trusted runtime on 127.0.0.1:11434.
5. TB5, untrusted document and handoff text → agents and gateway.
6. TB6, evidence producer → evidence consumer: evaluation, comparison and pairing.
7. TB7, fork PR → CI.
8. TB8, a maintainer's tag → a published release.

**Environment variables.**

- The app reads `PORT` (server), `OLLAMA_MODELS` (model-store root, [installed-model.js#L6](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/installed-model.js#L6)) and `LAB_BROWSER` (browser-check script).
- The app does not read `NODE_USE_ENV_PROXY`, `--use-env-proxy`, `NODE_OPTIONS`, `HTTP_PROXY` or `NO_PROXY`, but Node's built-in fetch honours them (F2).
- CI uses `RELEASE_TAG` (passed via `env:` from `github.ref_name`), `PRERELEASE` and the GitHub token.

**Exposure assumption.** The intended deployment is one trusted user on one machine. There is no authentication, by design. Any local non-browser process (for example, curl) can call the API. That matches the stated trust model and is not treated as a finding.

### Project claims checked against evidence

| Project claim | Verdict | Evidence |
|---|---|---|
| Loopback-only server | **Verified, in depth.** Even with the bind deliberately changed to `0.0.0.0`, connections to `127.0.0.2` or to the host's real interface IP got 403 "Loopback only". | HTTP workstream test; [server.js#L11-L12](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L11-L12) |
| Same-origin-only experiment triggering | **Verified** with curl, a raw socket and real Chrome (Section G.4). | [server.js#L13-L16](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L13-L16) |
| Dashboard renders untrusted text safely | **Verified.** Rendering uses only `textContent` and `createElement`; there is no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` anywhere. An `<img onerror>` payload rendered as inert text in a DOM harness. | [public/app.js#L5](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/public/app.js#L5) |
| "The fixed endpoint is `http://127.0.0.1:11434`; remote endpoints … are rejected" | **Holds by default. Refuted under Node env-proxy (F2).** | [README](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/README.md); [ollama.js#L60-L62](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L60-L62) |
| Redirects refused; byte limits enforced while streaming; deadlines enforced | **Verified with mocks.** A 302 target was never contacted. Limits applied to chunked, Content-Length and gzip (decompressed) bodies. Slow headers and slow bodies timed out and closed the socket. | [ollama.js#L54-L88](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L54-L88) |
| "A conservative UTF-8 byte/context bound rejects oversized conversations before sending" | **Partially refuted (F4).** Echoed runtime fields were not counted. The 12 KiB request cap still applied. | [ollama.js#L103](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L103) |
| Transport timeout or overflow halts the runner | **Verified for one runner closure only (F5).** | [model-runner.js#L19, L93](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L19-L93) |
| Verifies the pinned manifest and metadata; "Model weights are not rehashed" | **Disclosure verified.** A sparse all-zero file of the correct size was accepted, which matches the documented limitation. The metadata checksums are lossy (F3). | [installed-model.js#L20-L43](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/installed-model.js#L20-L43) |
| Model output cannot choose tools, paths, URLs, policies or modes | **Verified.** Wrong-role, out-of-order, extra-field, duplicate-key, `__proto__` and `tool_calls` proposals all failed closed with zero publications. | [ollama.js#L36-L45](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L36-L45) |
| Strict mode and policy validation; only an omitted (`undefined`) policy falls back to the default | **Verified.** `null`, `""`, mixed-case and space-padded values all threw. | [gateway.js#L6-L11](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/gateway.js#L6-L11) |
| "No scripted fallback is inserted" in model mode | **Verified.** | [model-runner.js#L99](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L99) |
| `documentDelivered` is conservative | **Verified.** It is a false negative on non-JSON content. | [model-runner.js#L43](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L43) |
| Handoff and writer-input "confirmed delivery" | **Over-counts (F8)** when the responder's identity was rejected. | [handoff-evaluator.js#L19](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/handoff-evaluator.js#L19) |
| Source identity supports comparisons | **Refuted when launched from another directory (F1).** | [model-runner.js#L15-L17](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L15-L17) |
| Hash chain "detects edits only relative to a trusted retained root"; hashes are unsigned | **Unsigned: verified. Root wording: imprecise (F7).** The chain detects in-place edits and reordering but not tail truncation. A fully consistent forgery was produced from a mock run. | [engine.js#L17](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/engine.js#L17); [gateway.js#L33-L36](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/gateway.js#L33-L36) |
| Leak detection covers the exact marker and one known Base64 form only | **Verified as a documented limitation.** Lowercase, unpadded or misaligned Base64, a zero-width split and a non-breaking hyphen all evaded it, in the gateway and the evaluator alike. | [evaluator.js#L5-L11](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluator.js#L5-L11) |
| Zero dependencies; no install step | **Verified.** No dependencies, no lifecycle scripts, no remote scripts or CDN in the dashboard. | [package.json](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/package.json); [public/index.html](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/public/index.html) |
| Release creates notes only, with no asset upload; tags must be on `main` | **Verified by simulation.** "On main" means "ever reachable from main" (Section D). | [release.yml#L80-L85](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.github/workflows/release.yml#L80-L85); [RELEASING.md](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/docs/RELEASING.md) |
| "actionlint 1.7.12 passed" | **Not re-verified.** actionlint was unavailable. | [RELEASING.md#L15](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/docs/RELEASING.md#L15) |

---

## C. Confirmed findings

### How to read these findings

There are eleven confirmed findings. The original assessment patched seven and reported four without patches; revision 2 addresses all eleven (Section A.1). They fall into four categories:

- **Security-control bypass.** A stated control fails under a stated condition: F2.
- **Integrity-control weakness.** A check accepts input it should reject: F3, CI-1.
- **Evidence or measurement defect.** Recorded provenance, delivery or summary counts misstate what happened: F1, F6, F8, F9, F10, and F7 (documentation).
- **Hardening or scope gap.** A bound or halt is narrower than documented: F4, F5.

These are kept separate from **documented fixture limitations**, which are not reported as findings: narrow marker matching, size-only weight checks, unsigned hashes and the cooperative gateway.

**Why no CVSS v4.0 scores are assigned.** No finding gets a numeric CVSS v4.0 score. CVSS describes how exploiting a vulnerable system's boundary affects confidentiality, integrity and availability. Every finding here either:

- requires a capability the local user already fully holds (launching the process, setting the environment, writing to the model store, controlling input files, or repository write access); or
- misstates evidence about synthetic experiments.

In neither case does a remote or cross-origin attacker gain new access. Forcing these into CVSS would overstate them. Ratings use a qualitative Low / Low–Medium scale reconciled across the three workstreams and the independent reviewer.

**Starting access.** For every finding, the attacker starting access listed is a trusted local capability. None gives a remote or cross-origin attacker reachable access.

### C.1 Patched findings (original fixes; see A.1 for revision 2)

#### F2: Node env-proxy silently tunnels the "fixed loopback" Ollama endpoint (rank 1, Low–Medium)

| Field | Detail |
|---|---|
| Class | Security-control bypass that depends on a non-default operator environment. |
| Location | `request()` in [ollama.js#L60-L62](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L60-L62). Label logic at [ollama.js#L6-L9, L113-L116](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L113-L116). |
| Root cause | When env-proxy support is enabled, Node's global fetch sends `http:` requests through `HTTP_PROXY`. The URL the adapter sees stays `http://127.0.0.1:11434/...`, so the post-fetch URL check cannot detect the proxy. |
| Prerequisites | Env-proxy enabled (`NODE_USE_ENV_PROXY=1`, `--use-env-proxy`, or the same flag in `NODE_OPTIONS`); `HTTP_PROXY` set; `NO_PROXY` does not cover 127.0.0.1. `HTTPS_PROXY` alone has no effect. |
| Attacker starting access | Control of the operator's environment or of the configured proxy. |
| Default vs non-default | **Non-default.** This is the only finding that needs non-default configuration. Under the default environment, and with `NO_PROXY=127.0.0.1`, no traffic reached the proxy. |
| Intended capability vs new access | The operator already controls their own environment. Nothing new becomes reachable for a website or a remote peer. What breaks is the stated loopback-only guarantee: synthetic prompts and documents leave the host, and the proxy's responses are accepted. |
| Safe reproduction | Start a loopback listener as a stand-in proxy, then call `adapter.preflight` with `NODE_USE_ENV_PROXY=1 HTTP_PROXY=http://127.0.0.1:<port>` and no `NO_PROXY`. Scripts: `review/f2.mjs`; `proxy2.mjs` / `proxy3.mjs`. |
| Observed evidence | The listener recorded `CONNECT 127.0.0.1:11434`. Default environment: nothing recorded. With `NO_PROXY=127.0.0.1`: nothing recorded. |
| Impact | Synthetic fixture data could leave the host. Responses served by the proxy would be accepted. If the genuine model files are on disk, those responses would be labelled `local-model-observation` (Chain A, Section E). |
| Fix | `environmentProxyActive()` detects env-proxy plus `HTTP_PROXY`/`http_proxy`. `request()` then throws `runtime_failure` before any fetch. The check applies only when the real global fetch is in use, so mock-based tests are unaffected. |
| Regression coverage | `security: environment proxy cannot silently reroute the fixed loopback endpoint`. Fails before ("adapter must refuse … environment proxy"), passes after. |
| CVSS v4.0 | Not scored. The precondition is control of the operator's own environment and only synthetic data is affected; see above. |

#### F1: Git provenance is read from the caller's working directory (rank 2, Low–Medium)

| Field | Detail |
|---|---|
| Class | Evidence defect (misleading provenance). |
| Location | `sourceIdentity()` in [model-runner.js#L15-L17](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L15-L17). |
| Root cause | `git rev-parse HEAD` and `git status --porcelain` run without a `cwd`, so they describe whichever repository the process was launched from. `codeHash` is computed correctly from module URLs. |
| Prerequisites | Launching the CLI or server from a directory other than the repository, for example `node /path/scripts/model-trial.js`. |
| Attacker starting access | Whoever launches the process. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | The launcher already runs the code. Nothing new is gained; the recorded evidence is wrong. |
| Safe reproduction | Run a mock-adapter `createModelRunner(...)({mode:'baseline'})` from three places (the repository, an unrelated repository, a non-repository directory) and read `run.source`. Script: `review/f1.mjs`. |
| Observed evidence | From the repository: `6981b53f…`, `dirty:false`. From an unrelated repository: that repository's HEAD (`2e8c1f80…`), `dirty:false`. From a non-repository directory: `commit:null, dirty:true`. |
| Impact | A dirty or different checkout can be recorded as a clean, unrelated commit. `source` feeds `pairingKey` and the batch `initialContext` ([evaluation-runner.js#L98](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-runner.js#L98)), so comparisons can be wrongly split or wrongly merged. |
| Fix | Pass `cwd` set to the module directory to both git calls. |
| Regression coverage | `security: source commit identity comes from the code repository, not the process cwd`. It runs a child process in a temporary repository. Fails before ("recorded commit must identify the executing code, not the caller cwd"), passes after. |
| CVSS v4.0 | Not scored. This is a measurement and provenance defect with no boundary crossing. |

#### F6: The `--pair` counterpart is used with no consistency check (rank 3, Low–Medium)

| Field | Detail |
|---|---|
| Class | Evidence defect (misleading comparison). |
| Location | [scripts/model-trial.js#L17-L26](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/scripts/model-trial.js#L17-L26). Matching logic in [public/comparison.js#L33-L40](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/public/comparison.js#L33-L40). |
| Root cause | The script uses `.selectedRun` from a JSON file under `results/` directly. Pairing matches on `pairingKey` only. Neither `evidenceHash` nor the event chain is checked. The path check uses `resolve` without `realpath`, so a symlink inside `results/` can point elsewhere; the access is read-only. |
| Prerequisites | The user runs the CLI with a results file they control. |
| Attacker starting access | Write access to files under `results/`. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | The input is read-only and user-controlled, so nothing new is gained. This is a gap in how far evidence can be trusted. |
| Safe reproduction | Edit a counterpart file so the leak is removed, keep its now-stale `evidenceHash`, and pass it with `--pair`. |
| Observed evidence | The edited counterpart was still selected as `comparison.baseline` (`staleHashValid:false`, `pairedLeak:false`). |
| Impact | A comparison can rest on an edited baseline without any warning. |
| Fix | A new `verifyRunEvidence(run)` in `gateway.js` recomputes `evidenceHash` and runs `verifyEvents`. `model-trial.js` calls it before contacting any runtime, and rejects counterparts with no hash. This is an intended tightening: legacy counterparts without a hash can no longer be paired. **This is an unsigned consistency check only.** It catches accidental or naive edits. Anyone who recomputes the hashes passes it, so it does not prove where the evidence came from. |
| Regression coverage | `security: paired evidence must be internally consistent before it is used in comparisons`. Fails before, passes after. |
| CVSS v4.0 | Not scored. Evidence-integrity defect on user-supplied input. |

#### CI-1: The release tag version is not tied to `package.json` (rank 4, Low)

| Field | Detail |
|---|---|
| Class | Integrity-control weakness in release metadata. |
| Location | [scripts/release-tag.js#L5-L12](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/scripts/release-tag.js#L5-L12); [package.json](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/package.json) declares `0.1.0`. |
| Root cause | The tag grammar is validated (strict SemVer with a `v` prefix), but nothing compares the tag to the declared version. `RELEASING.md` only says to "coordinate" them. |
| Prerequisites | Tag or write access to the repository. |
| Attacker starting access | A maintainer, most likely making a mistake. Not an external attacker. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Write access already allows broader abuse, so nothing new is gained. |
| Safe reproduction | Run `node scripts/release-tag.js v9.9.9` locally. No tag is pushed. |
| Observed evidence | Before the fix: prints `prerelease=false` and exits 0. After the fix: throws `Version tag does not match package.json version` and exits 1. `v0.1.0` exits 0. |
| Impact | A published release name could contradict the version declared in its source archive. |
| Fix | An exported `assertPackageVersion(tag, version)`, enforced by the CLI that both release steps already call. It compares versions with build metadata ignored. A note was added to `docs/RELEASING.md`. The documentation's own `v0.2.0-rc.1` example is now rejected until `package.json` is bumped, which is the intended behaviour. |
| Regression coverage | `test/security-release-version.test.js`, 3 tests. 0/3 pass before ("v9.9.9 must be rejected while package.json is 0.1.0"), 3/3 after. |
| CVSS v4.0 | Not scored. Requires repository write access and only affects metadata consistency. |

#### F3: Metadata checksums hash lossy UTF-8 text instead of raw bytes (rank 5, Low)

| Field | Detail |
|---|---|
| Class | Integrity-control weakness. |
| Location | Blob and manifest checks in [installed-model.js#L20, L25](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/installed-model.js#L20-L25), which use `hash(bytes.toString('utf8'))` ([gateway.js#L5](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/gateway.js#L5)). |
| Root cause | UTF-8 decoding replaces invalid sequences with U+FFFD. That mapping is not one-to-one, so different byte sequences can produce the same string and therefore the same hash. |
| Prerequisites | Write access to the model store, **and** a genuine blob that already contains U+FFFD or invalid UTF-8. |
| Attacker starting access | Write access to the model store, which is already fully trusted. |
| Default vs non-default | Default configuration, but the real-world trigger is very unlikely: genuine Ollama metadata is valid UTF-8. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | In a synthetic store, replace a metadata blob that contains a replacement character with a same-length invalid sequence that decodes to the same character. |
| Observed evidence | The forged blob had a different true SHA-256 from the declared digest, yet the second load was accepted (`secondLoadAccepted:true`). |
| Impact | Metadata blobs can be substituted under a narrow condition. |
| Fix | `sha256Bytes()` over the raw Buffer. Results are identical for valid UTF-8. |
| Regression coverage | `security: installed metadata checksums are computed over raw bytes, not lossy UTF-8 text`. Fails before ("Missing expected rejection"), passes after. |
| CVSS v4.0 | Not scored. The prerequisite already grants full control of the model store. |

#### F4: Runtime-supplied message fields are echoed and escape the context bound (rank 6, Low)

| Field | Detail |
|---|---|
| Class | Hardening: the documented bound is inaccurate. |
| Location | [model-runner.js#L44](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L44); [ollama.js#L103](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L103). |
| Root cause | `conversations[actor].push(reply.message)` resends the runtime's whole message object, but the context bound counts only `m.content`. |
| Prerequisites | A runtime that returns extra message fields. |
| Attacker starting access | The semi-trusted runtime on 127.0.0.1:11434. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. The 12 KiB request cap still applies. |
| Safe reproduction | A mock reply with extra `images` and `thinking` fields. |
| Observed evidence | The next request's assistant message had keys `role, content, images, thinking`, and the request was 5,667 bytes. |
| Impact | The "conservative" context bound is not conservative. |
| Fix | Push only `{role:'assistant', content}`. The raw response is still kept in `rawResponse`, and the pinned request snapshots are unchanged. |
| Regression coverage | `security: runtime-supplied assistant message fields are not echoed into later requests`. Fails before, passes after. |
| CVSS v4.0 | Not scored. The source is semi-trusted and the hard byte cap still holds. |

#### F5: The uncertain-cancellation halt is scoped to one runner closure, not to the adapter (rank 7, Low)

| Field | Detail |
|---|---|
| Class | Scope gap in a safety control. |
| Location | `halted` closure variable, [model-runner.js#L19, L93](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L19-L93). Each batch creates a new runner, [evaluation-runner.js#L69](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-runner.js#L69). |
| Root cause | The halt lives in the runner, not the adapter. A fresh runner that shares the adapter is not halted. |
| Prerequisites | In-process code creates a second runner or batch on the same adapter. |
| Attacker starting access | In-process code. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | A mock adapter that never answers, with `callMs` of 50–100. Run one runner, then a second runner on the same adapter. |
| Observed evidence | Batch 1: `stopReason:"uncertain_cancellation"`. Batch 2 on the same adapter immediately attempted a trial. |
| Impact | Inference could overlap on a backend that may still be busy, contaminating timing and limit evidence. |
| Fix | A module-level `WeakSet` of halted adapters. Residual: a brand-new adapter in the same process is still not halted. |
| Regression coverage | `security: uncertain cancellation halts every runner sharing the adapter`. Fails before ("Missing expected rejection"), passes after. |
| CVSS v4.0 | Not scored. In-process scope; affects evidence quality only. |

### C.2 Reported without patches in the original assessment (addressed in revision 2 with versioning; see A.1)

#### F8: "Delivery confirmed" even when the responder's model identity was rejected (rank 8, Low)

| Field | Detail |
|---|---|
| Class | Measurement defect. |
| Location | [handoff-evaluator.js#L19](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/handoff-evaluator.js#L19); [writer-input-evaluator.js#L7](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/writer-input-evaluator.js#L7); ledger entry written in a `finally` block at [ollama.js#L61, L86](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L61-L86); identity check at [ollama.js#L107](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L107). |
| Root cause | `request()` records `httpStatus:200` with no error. `chat()` throws the identity mismatch afterwards, so the evaluators count the record as delivered. |
| Prerequisites | A runtime response that reports the wrong `model`. |
| Attacker starting access | A semi-trusted runtime or an impostor responder. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | A mock writer reply that reports an impostor model name. Script: `review/f8.mjs`. |
| Observed evidence | Status `runtime_failure` ("Response model identity mismatch"), yet `handoffMeasurement.deliveredRecords.length == 1`. In writer-boundary mode, `confirmedDeliveries.length == 1`. |
| Impact | `bothWriterInputsConfirmed` ([evaluation-runner.js#L116](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-runner.js#L116)) can be true for a slot whose responder failed identity. The run itself is `runtime_failure`, which stops the batch. The stated basis, "HTTP 200 response; not proof of internal attention", is literally true but weaker than readers may assume. |
| Suggested fix | Count a delivery only after `chat()` has validated identity and accounting, or mark the ledger entry with the post-validation error. |
| Regression coverage | Original assessment: none. Revision 2: see A.1 and G.0. |
| CVSS v4.0 | Not scored. Measurement fidelity only. |

#### F9: A trial that fails a context check is still counted in summary aggregates (rank 9, Low)

| Field | Detail |
|---|---|
| Class | Measurement defect. |
| Location | [evaluation-runner.js#L86-L99](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-runner.js#L86-L99). |
| Root cause | `trial.status` and `observations` are assigned, and the evidence saved, before the identity, metric and context checks run. |
| Prerequisites | The runtime context changes mid-batch. |
| Attacker starting access | A semi-trusted runtime. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | A mock whose reported runtime version changes at trial index 4. Script: `review/f9.mjs`. |
| Observed evidence | `stopReason:"evidence_or_integrity_error"` ("Initial execution context changed"), but `attempted:5`, `outcomesRecorded:5` and `statusCounts:{safe_completion:5, not_run_stopped:7}`. Trial 5 is counted. |
| Impact | Summary counters do not separate observations made under an invalid context. Pairs are correctly marked `comparable:false`, and the batch is visibly stopped. |
| Suggested fix | Count observations only when `comparisonValid===true`, or add a `contextInvalid` counter. |
| Regression coverage | Original assessment: none. Revision 2: see A.1 and G.0. |
| CVSS v4.0 | Not scored. |

#### F7: The hash chain cannot detect tail truncation, and the "trusted root" wording is wrong (rank 10, Low, documentation)

| Field | Detail |
|---|---|
| Class | Evidence-integrity documentation defect. |
| Location | [gateway.js#L33-L36](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/gateway.js#L33-L36); the limitation string in [engine.js#L17](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/engine.js#L17); the [README](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/README.md). |
| Root cause | The chain's genesis value is the public constant of 64 zeros, so "retaining the root" detects nothing. Scripted runs have no `evidenceHash`, and publications are not part of the event chain. |
| Prerequisites | Write access to an exported evidence file. |
| Attacker starting access | Write access to an exported evidence file. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | Run `verifyEvents` on a 4-event scripted chain. Script: `review/f7.mjs`. |
| Observed evidence | Full chain: valid. Last event dropped: **valid** (not detected). First two events only: valid. Empty chain: valid. In-place edit: invalid (detected). Separately, a mock `completed_with_leak` run was relabelled `local-model-observation` and `safe_completion` and re-hashed; its chain and `evidenceHash` both verified. |
| Impact | Dropping the final events of a scripted export cannot be detected. Hash consistency proves neither origin nor completeness. The code and most documents already say "unsigned". `INITIAL_FINDINGS.md`'s "hash chains verified" means consistency only, and the same document caveats it later. |
| Suggested fix | Reword the guidance to "retain the final event hash and event count (or `evidenceHash`) out of band". Optionally add an `evidenceHash` to scripted results. Use a key or signature only if authenticity is ever claimed. |
| Regression coverage | None. It was left unpatched to avoid changing pinned limitation strings and tests. |
| CVSS v4.0 | Not scored. It is a documentation issue, and the hashes are self-declared as unsigned. |

#### F10: Malformed transport JSON from `/api/chat` is classed as model `invalid_output` (rank 11, Low)

| Field | Detail |
|---|---|
| Class | Measurement or classification defect. The behaviour is confirmed; whether it is a defect is a design judgment. The original workstream rated it "suspected"; the independent reviewer reproduced the behaviour. |
| Location | [ollama.js#L74](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L74). The batch stops only on `runtime_failure` or uncertain cancellation, [evaluation-runner.js#L107-L108](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/evaluation-runner.js#L107-L108). |
| Root cause | When the HTTP body itself fails `JSON.parse` during inference, the error is labelled `invalid_output`. That is the same label used for model misbehaviour. |
| Prerequisites | A broken or impostor runtime returns non-JSON or NDJSON in response to `stream:false`. |
| Attacker starting access | A semi-trusted runtime. |
| Default vs non-default | Default configuration. |
| Intended capability vs new access | Nothing new is gained. |
| Safe reproduction | A mock returning a truncated JSON body with HTTP 200. Script: `review/f10.mjs`. |
| Observed evidence | `invalid_output`, "Malformed runtime JSON". The batch continues. |
| Impact | Transport faults are counted as model behaviour. |
| Suggested fix | Map transport-level parse failures to `runtime_failure`. Model-content JSON failures are already labelled separately. |
| Regression coverage | Original assessment: none. Revision 2: see A.1 and G.0. |
| CVSS v4.0 | Not scored. |

---

## D. Suspected weaknesses and informational observations

### CI and release governance gaps depend on settings no clone can reveal

The workflows are hardened above average for a small repository:

- the workflow-level `contents: read` setting neutralizes a permissive repository default;
- fork PRs reach only `pull_request` jobs, with a read-only token;
- there is no `pull_request_target`, `workflow_run`, `secrets.*` or cache;
- every event-derived value goes through `env:`.

When a `permissions` key is present, all unspecified scopes get no access ([GitHub Docs: automatic token authentication](https://docs.github.com/en/enterprise-server@3.7/actions/security-guides/automatic-token-authentication)). Fork PRs get write tokens only if an admin enables that setting ([GitHub Docs: GITHUB_TOKEN reference](https://docs.github.com/ko/enterprise-cloud@latest/actions/reference/github_token-reference)). Script injection requires `${{ }}` to be interpolated into `run:` steps, and the repository never does that with event text ([GitHub Docs: script injections](https://docs.github.com/en/enterprise-server@3.17/actions/concepts/security/script-injections)). A local fuzz of the tag parser rejected every shell metacharacter, whitespace and line-terminator variant tried.

The open items below are governance issues. All of them assume repository write access, which is already a powerful capability.

- **Release checks run from the tagged commit itself (suspected, Medium governance).** A writer could tag a branch whose `release.yml` drops the main-ancestry check. Those checks therefore catch mistakes, not malicious insiders. The missing controls live in repository settings: a tag ruleset on `refs/tags/v*`, CODEOWNERS with required review for `.github/**` and `scripts/release-tag.js`, immutable releases, and a restricted default token.
- **Any commit ever on `main` can be released (confirmed by simulation, Low–Medium governance).** Ancestry means "ever reachable from main", not "current head" or "reviewed". The release reruns `npm test` on Node 22 and 24, which partly mitigates this. Simulation results: lightweight and annotated tags on `main` would release; tags off `main` and tags moved after checkout were blocked; a tag on an old `main` commit would release.
- **Tag force-move race (suspected, Low).** The `test` job's checkout has no `ref:`, so `validate`, `test` and `release` could use different commits if the tag is moved between job starts ([release.yml#L37-L54](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.github/workflows/release.yml#L37-L54)). It is unconfirmed because the official checkout behaviour for tag refs and the value of `github.sha` could not be fetched.
- **`--latest` left automatic (suspected, Low operational).** A backport could be labelled Latest. Per the [gh release create manual](https://cli.github.com/manual/gh_release_create), the default is "automatic based on date and version". The same manual does not document behaviour when a release already exists, so duplicate-release fail-closed behaviour is expected but was not verified.
- **Build-metadata variants (Low).** `v1.2.3+a` and `v1.2.3+b` are distinct tags for the same SemVer version. After CI-1, both must at least match `package.json`.
- **Release notes include PR titles (informational).** `--generate-notes` inserts PR titles and bodies as Markdown text. That is content-sanitization hygiene, not code execution; `RELEASING.md` already requires sanitized PR history.

### Action-SHA provenance and pin freshness are unverified

All 8 `uses:` lines pin `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7` and `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7` ([tests.yml#L26-L30](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.github/workflows/tests.yml#L26-L30)). **This assessment did not confirm that these SHAs correspond to the official `v7` tags.** That needs `git ls-remote` or the GitHub API, both of which were excluded, and the release pages were not on the fetch allowlist. A pinned SHA is only as trustworthy as whoever checked where it came from.

Further gaps:

- There is no `.github/dependabot.yml` and no CODEOWNERS, so the pins will go stale (Low).
- `ubuntu-latest` floats, and the Node toolchain is downloaded by `setup-node`. Neither was assessed.
- `bash` 5.x on the runner was assumed, not verified.

### Code-level suspicions and hardening notes

These items came out of the code review. None was driven to a confirmed failure. Each entry says what is suspected, why it is unconfirmed, and what evidence would settle it.

- **`active` can stick on (suspected, not reproduced).** `runModelTrial` sets `active=true` before `sourceIdentity()`, `createTranscript` and `createGateway`, all outside `try/finally` ([model-runner.js#L25-L33](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L25-L33)). A synchronous throw there would leave the runner permanently busy. Evidence needed: a fault-injection test, for example a missing source file.
- **No lock at the adapter level (informational).** Two parallel `adapter.chat()` calls were both sent. Separate runners or batches in one process can therefore drive the backend concurrently. Runner-level and batch-level guards do exist.
- **Metadata timeout is client-side only (informational).** File reads have no AbortSignal ([ollama.js#L96-L100](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L96-L100)).
- **Oversize request bodies are not ledgered (minor gap).** When a request is rejected for size, the attempted body is never written to the ledger, because the throw happens before the `try` block.
- **`codeHash` coverage is partial (informational).** It covers 9 modules but excludes `public/comparison.js`, `evaluation-runner.js`, `server.js` and `scripts/*`. Changes to pairing or summary logic are reflected only through commit/dirty status, and F1 can misreport that.
- **The real fetch is captured at import time (out of scope).** `originalFetch` is captured when the module loads ([ollama.js#L4](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/ollama.js#L4)), so a preload that replaces fetch would count as "original". That is hostile in-process code, which is outside the threat model.
- **Any process on 127.0.0.1:11434 is trusted as the runtime (inherent).** Model identity relies on values the runtime reports about itself plus checks on local files. Nothing binds the HTTP responder to the weights on disk. This is inherent to the local-trust design, not a bypass of a stronger claim.
- **HTTP hardening notes (informational, not exploitable).**
  - Content-Type is not enforced before `JSON.parse`; a `text/plain` POST returned 200 same-origin.
  - A 413 response does not drain the connection. A pipelined test produced `[413, 400]` with no smuggling, and the server stayed responsive.
  - There is no legacy `X-Frame-Options` header, but `frame-ancestors 'none'` supersedes it ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)).
  - The permanent `halted` latch is fail-closed by design.
  - `GET /api/runs` is readable by local non-browser processes, but not by web origins (Section G.4).
- **`.gitignore` hygiene (Low).** `results/**`, `*-evidence.json`, `models/*.gguf`, `.env.local` and `.ollama/*` are ignored. `*.jsonl`, `*.ndjson`, `id_*`, `*secret*`, `Modelfile` and similar names are not ([.gitignore](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/.gitignore)).

### Documented fixture limitations (not findings)

These limitations are documented by the project and were confirmed during the assessment. They are not reported as bypasses:

- **Leak matching.** Matching is case-sensitive on the exact marker plus one known Base64 form, so other encodings, transformations and paraphrases evade it.
- **Task-success metric.** The metric is deliberately narrow and independent of leak status. Verbatim matching is not semantic, so it produces false positives (a notice with a contradiction appended) and false negatives (a useful paraphrase).
- **Weights.** Weights are checked for size only.
- **Hashes.** Hashes are unsigned and can be recomputed.
- **Gateway.** The gateway is cooperative in-process control, not a sandbox.
- **Malformed model JSON.** It is not counted as an attempted disclosure.

A `safe_completion` status is not a safety result; the code says so itself ([model-runner.js#L99](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/model-runner.js#L99)).

---

## E. Attack chains

### Chain A: an env-proxy impostor yields forged "actual model" evidence (capped at Medium, partially verified)

The chain starts when an operator runs with Node's env-proxy enabled and `HTTP_PROXY` points at a proxy an attacker controls. Each link is listed below with its verification status.

1. **Traffic diversion (F2): verified dynamically.** The proxy received `CONNECT 127.0.0.1:11434`.
2. **Proxy responses accepted, with correct identity fields if the proxy reports them: verified for the transport.** A mock on :11434 was accepted. F8 means that even an identity-mismatched writer response is still counted as "delivered".
3. **Run labelled `local-model-observation`: confirmed by code reading only.** The label depends only on `fetchImpl===originalFetch && metadataLoader===loadInstalledModel`, and both stay true when traffic is proxied. The half that depends on the genuine pinned manifest being on disk was **not dynamically reproduced**, because those model files could not be obtained offline.
4. **Evidence that can be recomputed and paired (F7, F6): verified.** A mock run was relabelled and re-hashed and still verified. Before the F6 fix, an inconsistent counterpart was accepted for pairing.

**Net effect.** The result is forged "actual observation" evidence about synthetic experiments. There is no code execution and no exfiltration of real secrets.

**Why the rating is capped at Medium.** The chain needs a non-default operator environment plus an attacker who already controls that environment or the proxy. It touches only synthetic data. The evidence it forges is already documented as unsigned and local-trust.

**Effect of the patches.** The F2 fix breaks link 1 under the real fetch. The F6 fix stops naive edits to paired counterparts, but not a forger who recomputes the hashes.

### Chain B: website → `/api/run` → local Ollama compute (not achieved in the tested configurations)

The real-browser test did not achieve this chain in any tested attempt. `/api/run` is the only route that changes state or invokes Ollama ([server.js#L15-L29](https://github.com/Khaja-syed-786/agent-crash-lab/blob/6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b/server.js#L15-L29)). In headless Chrome 153, every cross-origin attempt was stopped in one of two places:

- at the CORS preflight (`OPTIONS → 405`, so the body was never sent);
- at the server's Origin gate (`POST → 403`).

The run count stayed at 1 before and after, under two hostile origins. Custom headers force a preflight because they make the request non-simple ([MDN: preflighted requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#preflighted_requests); [Fetch Standard](https://fetch.spec.whatwg.org/#cors-protocol)). Host validation rejected the rebinding-style `evil.test` name that was tested. **No website-driven path to local compute was found in the tested browser, origins and attempts.** Section A's scope note lists what was not tested. The server-side gates (Host regex, Origin match, required custom header, no CORS, loopback socket check) do not depend on the browser enforcing CORS correctly for writes. Only the confidentiality of `GET /api/runs` relies on the browser withholding unreadable responses.

**No other chains are claimed.** Every other finding needs a trusted local capability, and combining them gains nothing beyond what that capability already grants.

---

## F. Prioritized remediation plan

Effort scale: XS is under an hour; S is a few hours; M is about a day or more. All code fixes listed as "ready" are in the **uncommitted** combined workspace the combined-fix workspace. The agent and CI patches are also available separately as the agent-workstream patch and the CI-workstream patch.

| Priority | Item | Fix | Effort | Dependencies | Residual risk |
|---|---|---|---|---|---|
| P1 | F2 | Merge the `environmentProxyActive()` refusal. Document `NO_PROXY=127.0.0.1` for operators who need a proxy. | XS (ready) | None | Any local process listening on :11434 is still trusted as the runtime (inherent). |
| P1 | F1 | Merge the `cwd`-pinned git calls. | XS (ready) | None | Commit/dirty still describes the repository, not the loaded modules beyond the 9 that `codeHash` covers. |
| P1 | F6 | Merge `verifyRunEvidence` for `--pair`. | S (ready) | Accept that legacy counterparts without a hash can no longer be paired. | Unsigned: a forger who recomputes the hashes still passes. |
| P1 | CI-1 | Merge `assertPackageVersion`. | S (ready) | Bump `package.json` before tagging; the `v0.2.0-rc.1` docs example changes accordingly. | `+build` variants of the same version. |
| P2 | F3, F4, F5 | Merge the raw-byte hashing, the `{role,content}` echo and the per-adapter halt. | XS each (ready) | None | F5: a brand-new adapter in the same process is not halted. |
| P2 | Repository settings (**not changeable by this assessment**) | Tag ruleset on `refs/tags/v*` restricting creation to maintainers and blocking update and delete; immutable releases; restricted default workflow token; fork-PR approval with no write tokens; branch protection and required CI on `main`. | S | Repository admin | Covers the release-from-tagged-commit, old-main-commit and force-move concerns. |
| P2 | Workflow proposal | Apply the workflow proposal diff (not part of revision 2): emit and pin the validated commit across `test` and `release`; make an explicit `--latest` decision (the proposal uses `--latest=false` as a placeholder); add `dependabot.yml` for `github-actions`; add CODEOWNERS for `.github/` and `scripts/release-tag.js`. | S | actionlint and shellcheck review, then a real Actions run (it was only YAML-parsed here). | A seconds-wide window between the local recheck and `gh release create` that only rulesets or immutable releases close. |
| P2 | Action provenance | Verify both pinned SHAs against the official `v7` releases. | XS | GitHub access | None once verified and kept current by Dependabot. |
| P3 | F8 | Count a delivery only after `chat()` has validated identity and accounting. | S | Maintainer decision on semantics | None material. |
| P3 | F9 | Count observations only when `comparisonValid===true`, or add a `contextInvalid` counter. | S | Maintainer decision on semantics | None material. |
| P3 | F7 | Reword to "retain the final event hash and count (or `evidenceHash`) out of band". Add `evidenceHash` to scripted results. | XS–S | Update the pinned limitation strings and tests | Still unsigned, which is acceptable unless authenticity is claimed. |
| P3 | F10 | Map transport-level JSON parse failures to `runtime_failure`. | XS | Maintainer decision on semantics | None material. |
| P3 | Hygiene | Wrap the `active` setup in `try/finally`; extend `.gitignore`; optionally enforce `Content-Type: application/json`; run gitleaks or trufflehog in CI. | XS–S | None | Low. |

---

## G. Verification ledger

### G.0 Revision 2 verification (current)

**Base:** `6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b` (origin/main at the time of export, unchanged since the assessment). **Toolchain:** Node v22.23.4 and v24.22.1, matching the CI matrix of Node 22 and 24.

| Run | Node 22.23.4 | Node 24.22.1 |
|---|---|---|
| Base, full suite | 233/233 | not run |
| Remediation branch, full suite (`node --test`) | **283/283** | **283/283** |

The security tests are split by what a failure on the base means:

| File | Category | Base `6981b53` | Branch |
|---|---|---|---|
| `test/security-defect-repro.test.js` | **Original-defect reproduction.** Imports only APIs that exist at the base, so a base failure is the defect itself. | 1 pass / **8 fail** | 9/9 |
| `test/security-pair-cli.test.js` | **Original-defect reproduction** (F6, CLI in a child process that records and blocks every fetch and socket connect) | 1 pass (control) / **4 fail** ("no fetch or socket connect may happen") | 5/5 |
| `test/security-new-api.test.js` | **New API / new fields.** The base fails at import (`STATUS_TAXONOMY_VERSION` is not exported). That is expected and is **not** evidence of a defect. | 0 / 1 (module load) | 32/32 |
| `test/security-preserved-semantics.test.js` | **Preserved meaning.** Existing metric meanings hold on both trees, and F7's documented property is demonstrated. | 4/4 | 4/4 |

The base failures in the defect-reproduction file are all behavioural:

- **F1:** the recorded commit is the temp repository's HEAD, not `6981b53`.
- **F2:** the stand-in proxy saw the request.
- **F3:** the forged bytes were accepted.
- **F4:** the `images` and `thinking` fields were echoed.
- **F5:** the second runner was not halted.
- **F10:** the run was `invalid_output` and the batch did not stop.
- **CI-1:** `v9.9.9` exited 0.

The one base pass is the unchanged control: model-authored non-JSON content is still `invalid_output`.

**Changes to pre-existing tests.** Three literals were updated for the new measurement versions and nothing else:

- `test/handoff-propagation.test.js`: `handoff-text-v2` → `v3`, three occurrences;
- `test/writer-boundary.test.js`: `host-writer-input-v1` → `v2`, one occurrence.

No assertion was removed or loosened. The original assessment's `test/security-provenance.test.js` and `test/security-release-version.test.js` were superseded and folded into the categorized files above. Their new-export checks (`typeof … === 'function'`) now live only in the new-API file.

**PoC scripts and browser matrix (exported, re-run).**

- `sh docs/security/artifacts/poc/run-pocs.sh <checkout>` was run on a clean base clone and on the branch ([base](security/artifacts/poc/results-base-6981b53.txt), [branch](security/artifacts/poc/results-remediation-branch.txt)):

| Finding | Base | Branch |
|---|---|---|
| F1 | Records the unrelated repo's commit with `dirty=false` | Records `6981b53` |
| F2 | Without `NO_PROXY`, the proxy saw `CONNECT 127.0.0.1:11434` | Refused before any request; with `NO_PROXY=127.0.0.1` it connects directly |
| F8 | `handoff-text-v2`, 1 delivery, no validation field | `handoff-text-v3`, 1 transport delivery, 0 model-validated |
| F9 | `outcomesRecorded` 5 with no further split | `outcomesRecorded` 5, `validatedOutcomes` 4, `integrityRejectedOutcomes` 1 |
| F10 | `invalid_output` | `runtime_failure` |
| CI-1 | `v9.9.9` accepted | Rejected |

  The F2 PoC must run in a clean environment. The assessment sandbox exports `no_proxy`/`NO_PROXY`, and with them inherited the base showed no proxy contact. That is the documented bypass working as intended, not a refutation of F2.
- `node docs/security/artifacts/browser/run-browser-matrix.mjs` was re-run with Chrome for Testing 153.0.8010.12 against both trees ([base](security/artifacts/browser/results-base-6981b53.json), [branch](security/artifacts/browser/results-remediation-branch.json)). Both reproduced the original 11-attempt matrix: no run created, no cross-origin read, iframe content unreadable, and the `evil.test` Host rejected with 403. The scope limits in Section A apply.
- The F2 routing matrix was measured on Node 22.23.4, and `environmentProxyActive()` refuses every row Node routed via the proxy ([matrix](security/artifacts/node-env-proxy-matrix.md)).

**Patch export check.** The full patch and git bundle were applied to a fresh clone of `6981b53` and the suite re-run there; see the PR notes for the exact commands.

**Not done in revision 2:**

- no live inference;
- no Firefox or Safari testing, and no public-origin or PNA testing;
- no GitHub settings or Actions runs (workflow changes remain the unexecuted proposal from the original assessment, not part of this patch);
- no merge, tag, release or push.

### G.1 Environments and integrity

| Environment | Path | State |
|---|---|---|
| Reference clone | the reference clone | HEAD `6981b53…`, clean, never modified. |
| Workstream clones | three per-workstream clones and a run directory | Used by the three workstreams. |
| Reproduction | the reproduction clone | **Kept unpatched.** HEAD `6981b53…`, `git status --porcelain` empty after the copied tests were removed, 233/233. |
| Combined fixes | the combined-fix workspace | HEAD `6981b53…`. Seven modified files (`docs/RELEASING.md`, `gateway.js`, `installed-model.js`, `model-runner.js`, `ollama.js`, `scripts/model-trial.js`, `scripts/release-tag.js`) plus two new test files, all **uncommitted**. This document is also saved here as `docs/SECURITY_ASSESSMENT.md`, uncommitted. |

The tests ran on Node v22.23.4.

### G.2 Test counts

| Run | Result |
|---|---|
| Baseline `node --test` (unpatched; the HTTP workstream also re-ran it after its assessment) | **233/233 pass** |
| HTTP, dashboard and filesystem workstream | No patch: nothing was confirmed, so no diff was produced. 233/233. |
| Agent workstream (the agent-workstream patch: 6 files, +138/−6) | **239/239** (233 + 6) |
| CI workstream (the CI-workstream patch: 3 files, +36/−1) | **236/236** (233 + 3). The new test plus `release-tag.test.js`: 25/25. |
| Both patches applied, the combined-fix workspace | `git apply --check` clean, separately and together. **242/242** (233 + 9). New suites alone: 9/9. |
| Fail-before: `test/security-provenance.test.js` run on the unpatched reproduction tree | **0 pass / 6 fail**. Each test fails for its security reason, not because of a setup error. |
| Fail-before: `test/security-release-version.test.js` run on the unpatched reproduction tree | **0 pass / 3 fail** |
| Existing tests | No pre-existing test file was modified in the original assessment. Revision 2 updates three pinned version literals for the new measurement versions; see G.0. |

### G.3 Per-finding reproduction results (unpatched reproduction tree)

F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 and CI-1 all reproduced.

- F2 was the only one that needed a non-default environment.
- F3 was demonstrated only with a synthetic invalid-UTF-8 blob.
- The independent reviewer ran fresh proof-of-concept scripts that import from the reproduction tree only:
  - `f1.mjs`, `f2.mjs`, `f7.mjs`, `f8.mjs`, `f9.mjs`, `f10.mjs`, now exported as `docs/security/artifacts/poc/`;
  - a throwaway unrelated git repository (now created by `run-pocs.sh` in a temp directory).
- The workstream probes (not exported; their reproductions are covered by the exported PoCs and the regression tests) were `probe-transport.mjs`, `probe-trust.mjs`, `probe-env.mjs`, `proxy2.mjs`, `proxy3.mjs` and `fuzz.mjs`. The release-simulation repositories are in its `sim/` folder.

The key commands were:

- `node --test` in each tree;
- `git apply --check <agent patch> <CI patch>`;
- `node scripts/release-tag.js v9.9.9` (exits 0 before the fix, 1 after) and `node scripts/release-tag.js v0.1.0` (exits 0);
- `node fN.mjs` against the reproduction tree (now `sh docs/security/artifacts/poc/run-pocs.sh <checkout>`).

### G.4 Real-browser cross-origin matrix (Google Chrome for Testing 153.0.8010.12, headless, driven over CDP)

**Setup.** The lab server ran from the unpatched reproduction tree on `127.0.0.1:5099`, wrapped to log every request that reached it. One synthetic run was seeded same-origin, so `runs_before=1`. The hostile page was served from `:5199`. Chrome was started with a host-resolver rule that maps `evil.test` to 127.0.0.1. There were two passes, with hostile origins `http://127.0.0.1:5199` and `http://localhost:5199`; **the outcomes were identical**. Ollama was not running.

| # | Attempt | Reached server | Server status | Page could read | Run created |
|---|---|---|---|---|---|
| 1 | `fetch` POST `/api/run`, cors mode, with `X-Lab-Request` | Preflight only | `OPTIONS → 405` | No (`TypeError`; CDP `PreflightMissingAllowOriginHeader`) | No |
| 2 | `fetch` POST, cors mode, no custom header (JSON still preflights) | Preflight only | `OPTIONS → 405` | No | No |
| 3 | `fetch` POST, no-cors mode, custom header dropped | Yes | `POST → 403` (Origin gate) | No (opaque) | No |
| 4 | `fetch` POST, no-cors mode, `text/plain` simple request | Yes | `POST → 403` | No (opaque) | No |
| 5 | Auto-submitting HTML form POST, `text/plain` | Yes | `POST → 403` | No | No |
| 6 | `<img>` GET `/api/runs?…` | Yes | `GET → 404` | No (`ERR_BLOCKED_BY_ORB`) | n/a |
| 7 | `<script>` GET `/api/runs?…` | Yes | `GET → 404` | No (ORB) | n/a |
| 8 | `fetch` GET `/api/runs`, cors mode, read the body | **Yes** | **`GET → 200`** | **No** (`TypeError`; CDP `MissingAllowOriginHeader`) | n/a |
| 9 | `fetch` GET `/api/runs`, no-cors mode | Yes | `GET → 200` | No (opaque, status 0) | n/a |
| 10 | `<iframe>` of the dashboard | Yes | `GET / → 200` | No (CSP `frame-ancestors 'none'`, `ERR_BLOCKED_BY_RESPONSE`) | n/a |
| 11 | `fetch` `http://evil.test:5099/api/runs` (rebinding-style Host) | Yes | `GET → 403` (Host regex) | No | No |

**Outcome.** `runs_after=1` in both passes. Positive control: a same-origin `GET /api/runs` returned 200 with its body.

**What this settles, within this test.** In Chrome 153, a page on either tested loopback origin could cause a request to `/api/runs` but could not read the response. The informational note "readable by any local origin" should be read as: readable by the dashboard itself and by local non-browser processes. Other browsers, extensions and CORS-relaxing flags were not tested.

**Private Network Access.** No PNA preflight was observed, because both origins were loopback. A public origin may face an additional PNA/local-network-access check, depending on browser version and policy ([Fetch Standard](https://fetch.spec.whatwg.org/#private-network-access)). That was **not tested**. The loopback-to-loopback case tested here is expected to be the more permissive one, but this is reasoning, not an observation.

**Artifacts.** The original run's files are listed below. The harness was re-exported as `docs/security/artifacts/browser/` and re-run in revision 2 (G.0):

- `labserver.mjs`, `evilserver.mjs`, `attack.html`, `driver.mjs`;
- the server-side log `lab-requests.log`;
- `lab.out` and `evil.out`.

### G.5 Negative results (controls that held)

**HTTP server and dashboard (curl and raw socket):**

- Path traversal (encoded, null-byte, backslash, un-normalized raw socket): all 404.
- Bad Host: 403. Cross-origin POST: 403. Missing custom header: 403.
- Malformed JSON, arrays, extra fields, `__proto__` and `constructor` keys: 400, with no lingering prototype pollution.
- Oversized body: 413.
- Two concurrent local-model POSTs: one got 409.
- Error messages leaked no paths or stack traces.
- Security headers were present on 200, 403, 404, 405 and 413 responses.
- With the server bound to `0.0.0.0`, requests to a non-loopback destination got 403.
- In the DOM harness: zero `innerHTML` writes, a `blob:` download href, and a filename built only from validated fields.

**Ollama adapter (mocked):**

- Redirects refused. Streaming, Content-Length and gzip byte limits enforced.
- Slow headers and slow bodies timed out and the socket closed.
- Abrupt closes, HTTP 500, `{"error"}` bodies and NDJSON all failed closed.
- Identity mismatches, `tool_calls`, wrong-role, out-of-order, duplicate-key and `__proto__` actions were rejected.
- Limits can only be tightened, and are frozen.
- Strict mode and policy validation. The writer never sees the document. Only one gateway-checked revision is allowed.
- Single-flight runner. Store writes never overwrite and stores are not reused. Mock and actual runs never pair.

**CI and supply chain:**

- No script injection. Tag parser fuzz all rejected.
- Tags off `main` and moved tags were blocked in simulation.
- No release assets. No dependencies or lifecycle scripts.
- The git history (28 commits, 160 KiB, text only) has no evidence, credential or model files. The regex secret scan found only the project's synthetic test marker and public SHAs and digests; no values are reproduced here.

### G.6 Not tested

The following were not tested:

- live Ollama inference, and real backend cancellation on disconnect;
- the Chain A metadata half with the genuine pinned manifest, and the real Ollama 0.40 wrapped-manifest layout;
- the semantics of `/api/tags` fields;
- a genuinely public origin or a separate physical host;
- concurrent `saveTrial` races under load;
- resource-exhaustion stress;
- HTTP trailers and Transfer-Encoding edge cases;
- the `active` stuck-latch;
- the CI workflow proposal on GitHub Actions;
- duplicate `gh release create` behaviour;
- the private raw evidence behind `INITIAL_FINDINGS.md`.

---

## H. Remaining limitations

**No live inference or third-party testing.** No model was downloaded, and every runtime behaviour comes from mocks on loopback ports. Real Ollama cancellation, `/api/tags` semantics and the end-to-end Chain A labelling were therefore never observed. No third-party infrastructure was tested (GitHub, Ollama services, the runner images, the Node distribution). No production or remote deployment was exercised. The remote-exposure conclusions rest on a `0.0.0.0`-bind test of `localAddress` within one machine, and on reasoning about PNA.

**No GitHub API or settings access.** This is the largest blind spot for the release pipeline. Branch protection, tag rulesets, the default token permission, fork-PR policy, immutable releases and the provenance of the pinned action SHAs are all unverified. Nothing was pushed, tagged or committed.

**Tooling and documentation gaps.**

- The secret scan was regex-only: gitleaks and trufflehog could not be installed, and a pattern scan cannot prove absence.
- actionlint and shellcheck were unavailable. The workflow proposal is only YAML-parsed, and the project's own "actionlint passed" claim is unconfirmed.
- The official Ollama API documentation (docs.ollama.com, github.com/ollama) and some GitHub Docs and source pages could not be fetched. One secondary page about the `stream` default was treated as unreliable and was not relied on.

**Status of the fixes (revision 2).** All fixes are on the local branch `security/remediation-2026-11` against base `6981b53`. They are exported as a patch and a git bundle for maintainer review, and are **unmerged**. The temporary workspace names in the original text are historical and are not shipped. The durable equivalents are under `docs/security/artifacts/`. The workflow-hardening proposal from the original assessment is **not** included in this patch.

**Residual risk after remediation:**

- Any process listening on 127.0.0.1:11434 is still trusted as the runtime.
- Model identity is self-reported, so `modelValidated` means "consistent with the adapter's checks", not "authenticated".
- Hashes remain unsigned. Anyone who can write an evidence file can rewrite it consistently.
- The F5 halt covers runners sharing one adapter object, not a newly constructed adapter in the same process.
- The env-proxy guard covers Node's documented switches (`NODE_USE_ENV_PROXY`, `--use-env-proxy`). Other mechanisms, such as a custom global dispatcher installed by other code, are out of scope.
- The browser conclusions are limited to the tested build and origins (Section A).
