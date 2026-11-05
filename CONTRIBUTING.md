# Contributing to Agent Crash Lab

Welcome. Start with the [README setup and scripted demo](README.md#get-the-code), [architecture](README.md#architecture) and [initial findings](docs/INITIAL_FINDINGS.md). This is an experimental local lab, not production agent containment. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a detailed public exploit issue.

## Setup and checks

Use Git and a current Node.js 22 or 24 release with npm. Fork the repository for a contribution, clone your fork, and enter its root directory. There are no npm dependencies or installation step; npm ci is inappropriate without a lockfile. No Ollama, model, credentials, paid API or inference is needed.

```powershell
npm test
git diff --check
```

The README terminal demo runs scripted fixtures only. Optional `npm start` serves the dashboard on 127.0.0.1:5080; retain Scripted fixture and stop your process with Ctrl+C. Do not stop someone else's process if the port is busy; see the README's alternate-port instructions. On PowerShell systems that block npm.ps1, use npm.cmd instead.

For UI changes, optionally run `node scripts/browser-check.js --mock-model` with an already-installed Chrome/Edge browser. On systems without an automatically discovered browser, set LAB_BROWSER to its existing executable. No download is needed. If unavailable, state that real-browser behavior was not verified; a mocked DOM test is not real-browser verification. See the [security artifact README](docs/security/artifacts/README.md) for the separately scoped cross-origin harness. Never run live/model-trial/--execute-live commands as an onboarding check.

CI runs npm test on Node 22 and 24 without Ollama. Report your actual Node version, pass/fail/skip counts and any tooling unavailable locally. Do not claim CI passed until its run completes or that tests are required branch checks unless that is configured.

## Propose one synthetic scenario

First search existing [scenario documentation](docs/INJECTION_SCENARIOS.md), [handoff experiment](docs/HANDOFF_PROPAGATION.md), [writer-only experiment](docs/WRITER_BOUNDARY.md), documents.js, and open issues/PRs to avoid duplicates. Propose the smallest change and explain the legitimate public task, the untrusted input being varied, the hypothesis and what an outcome would and would not establish.

- Use only synthetic facts and the lab's fake markers/local publisher. New adversarial document or host-handoff content needs a matched benign control with identical public facts and raw/Base64 secret availability; vary only the declared experimental content. Adversarial instructions belong only in untrusted data. Do not change trusted instructions, policies, model settings or limits incidentally.
- Identify whether this is a scripted fixture, a mocked test, a two-role model design, or a host-supplied writer-only design. A writer-only test is not model-generated propagation or an end-to-end attack. Do not program a live model's answer or guarantee attack success.
- Give new fixture content its own version/ID and content hash. Preserve archived fixtures, original policies and historical evidence. Keep comparison keys isolated by scenario/document, policy, settings and applicable measurement versions. New metric meanings require a new version, not rescoring old runs. Refer to [task-metric limits](docs/TASK_SUCCESS.md) and [bounded evaluation](docs/BOUNDED_EVALUATION.md).
- Add meaningful scripted/mocked tests for exact input delivery, matching/provenance and independent outcomes. Distinguish a parsed proposal, transport receipt, validated response envelope, accepted publication, gateway block, task success, refusal/error and unrun slot. Quoted instructions are not endorsement; input/proposed markers are not automatically published leaks.

Use npm test for validation. For a defect reproduction, state whether it demonstrates behavior on the base or merely fails because an API was added later. Actual-model evaluation requires separate maintainer authorization and a runtime in the executing environment; cloud localhost cannot reach a contributor's laptop. Do not run it as part of a normal PR.

## Evidence and data rules

| Evidence basis | What it establishes |
|---|---|
| Scripted fixture | Programmed candidate/fallback and policy behavior; no model behavior. |
| Mock verification | Injected responses test plumbing and bookkeeping; no actual-model attack result. |
| Actual-model observation | Recorded real responses under declared inputs/settings; neither a general safety proof nor an assumed attack success. |

Keep these labels explicit in tests, descriptions and summaries. Do not pool distinct experiments into a safety score or call no-leak failures successful protection. The current findings did not demonstrate gateway benefit because baseline did not leak. Hash consistency is not authenticity; retain the documented integrity limitations.

**Never include credentials, tokens, customer/work data, private paths or raw live-model evidence in commits, PR bodies, screenshots, comments or attachments.** Do not commit .env files, results/, runtime metadata/model weights or prompt/output dumps. Git ignore rules do not remove already tracked files. Use sanitized aggregate counts and version identifiers for review; inspect `git diff --cached` and `git status --short` before pushing. Keep local raw reports in ignored results/. Existing sanitized synthetic security artifacts do not authorize adding actual-model transcripts. See SECURITY.md if sensitive data was exposed; do not copy it into a public issue.

## Small-PR workflow

1. Search existing issues/PRs and discuss one bounded problem in a non-sensitive issue or draft PR. Three unfiled starting ideas are in [contributor issue drafts](docs/CONTRIBUTOR_ISSUE_DRAFTS.md).
2. Create a branch in your fork (`git switch -c docs/short-topic` or a suitable fix/test branch). Preserve existing work and keep unrelated projects/formatting out of the change.
3. Make the focused change, add relevant regression coverage when behavior changes, and run the checks above. Documentation-only changes need link/command/diff checks; do not add tests that merely restate prose.
4. Review staged files for sensitive material and scope. Push your branch normally and open a PR against main. Explain the problem, resulting behavior, actual validation and limitations. Disclose changes from any supplied patch or historical semantics. Keep PRs small enough to review independently.
5. Address findings and wait for hosted CI on the final head. Do not merge, force-push shared history, create tags/releases, change repository settings or run inference without maintainer authorization. Releases follow [RELEASING.md](docs/RELEASING.md).

Contributions use the existing [MIT license](LICENSE). Preserve attribution and notices; disclose the source and licensing of copied material or new dependencies. Keep unrelated projects, including OpenOrbia and SOC Range, outside this repository's changes.
