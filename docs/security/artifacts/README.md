# Security assessment artifacts

Durable, sanitized evidence for [SECURITY_ASSESSMENT.md](../../SECURITY_ASSESSMENT.md) at base commit `6981b53fe8e0a0362c6eafe7ee05cb80bf8eca9b`. These files replace the temporary workspace paths quoted in the original assessment text.

## What these files contain

- **No secrets.** No credentials, tokens or real secret values. The only "secret" anywhere is the lab's deliberate synthetic marker.
- **No raw model evidence.** Every model response is a labelled mock or comes from a loopback stand-in, and no live inference ran.
- **No machine-specific paths.** Scripts resolve the checkout from their own location or from `ACL_REPO`.
- **Loopback only.** Nothing contacts an external host or a model runtime.

## Proof-of-concept scripts (`poc/`)

Run `sh docs/security/artifacts/poc/run-pocs.sh <checkout>` to execute them all against a checkout. Saved outputs:

- [poc/results-base-6981b53.txt](poc/results-base-6981b53.txt): the unpatched base, showing the original defects.
- [poc/results-remediation-branch.txt](poc/results-remediation-branch.txt): the remediation branch.

| Finding | Script | Durable regression test |
|---|---|---|
| F1 provenance from caller cwd | `poc/f1.mjs` (run from an unrelated repo) | `test/security-defect-repro.test.js` |
| F2 env-proxy tunnelling | `poc/f2.mjs`; routing map `poc/node-env-proxy-matrix.mjs` → [node-env-proxy-matrix.md](node-env-proxy-matrix.md) | `security-defect-repro` (base behaviour), `security-new-api` (contract with and without `NO_PROXY`) |
| F3 lossy UTF-8 checksums | (test only) | `security-defect-repro` |
| F4 echoed runtime fields | (test only) | `security-defect-repro` |
| F5 per-closure halt | (test only) | `security-defect-repro` |
| F6 unverified `--pair` | (test only; CLI in a contact-blocking child) | `test/security-pair-cli.test.js` |
| F7 hash-chain wording | `poc/f7.mjs` | `test/security-preserved-semantics.test.js` (documented property) |
| F8 delivery despite identity mismatch | `poc/f8.mjs` | `security-preserved-semantics` (transport meaning kept), `security-new-api` (`modelValidated`) |
| F9 rejected trial counted | `poc/f9.mjs` | `security-preserved-semantics` (`outcomesRecorded` kept), `security-new-api` (v2 fields) |
| F10 transport JSON as `invalid_output` | `poc/f10.mjs` | `security-defect-repro` |
| CI-1 tag vs `package.json` | `run-pocs.sh` (CLI) | `security-defect-repro` (CLI), `security-new-api` (`assertPackageVersion`) |

**Run the PoCs in a clean environment.** `run-pocs.sh` uses `env -i`. An inherited `no_proxy`/`NO_PROXY` that lists 127.0.0.1 masks F2. That happened in the assessment sandbox, and it is precisely the operator bypass the fix accepts.

## Real-browser cross-origin matrix (`browser/`)

To run it from the repository root: `node docs/security/artifacts/browser/run-browser-matrix.mjs [out.json]`. You can set `CHROME=<binary>`.

**What the harness does:**

- Starts the unmodified `createServer()` on 127.0.0.1:5099, logging each request that reaches it.
- Serves `browser/attack.html` from a second port.
- Seeds one same-origin scripted run as the positive control.
- Drives headless Chrome over CDP, once from `http://127.0.0.1:5199` and once from `http://localhost:5199`. A `--host-resolver-rules` mapping provides the rebinding-style `evil.test` name.

**Results:**

- [browser/results-base-6981b53.json](browser/results-base-6981b53.json)
- [browser/results-remediation-branch.json](browser/results-remediation-branch.json)

Both were recorded with Google Chrome for Testing 153.0.8010.12 and Node v22.23.4. In both passes on both trees:

- `runsBefore == runsAfter == 1`, so no run was created;
- no cross-origin read succeeded;
- the dashboard iframe was not readable;
- `Host: evil.test` received 403.

`serverSaw` lists what reached the server. Its last entry is the harness's own same-origin run count.

**Scope.** These results cover this browser build, these two loopback origins and these 11 attempts only. Not tested:

- other browsers or engines;
- public HTTPS origins, including Private Network Access behaviour;
- extensions or CORS-relaxing flags;
- a resolver that changes answers mid-session.

## Independent import review

See [the maintainer review](../../REMEDIATION_REVIEW.md). Saved JSON/text outputs here remain the supplier's historical artifacts, not results from the maintainer's machine. Fresh local logs stay under ignored results/. The F2 PoC now reroutes its nominal runtime URL to an ephemeral synthetic stand-in before invoking native fetch; its default and NO_PROXY cases cannot contact installed Ollama. Do not run the fixed-port routing matrix while a runtime owns port 11434. The browser harness obtains its version from CDP and asserts its negative-control invariants; set CHROME explicitly on Windows.
