# Agent Crash Lab — experimental v0.1.0

A local, repeatable **scripted** two-agent data-leak regression fixture. No AI model, API key, network publisher, or external agent is invoked. Independent from OpenOrbia and SOC Range.

## Run

Install Node.js 22 or newer. No npm dependencies or install step required.

```
npm test
npm start
```

Open http://127.0.0.1:5080. Use this exact loopback address. Click Run baseline, then Run protected test. Export evidence JSON to retain results; history is in memory (last 50 runs) and disappears on restart.

For automated browser verification, run `node scripts/browser-check.js`. It uses a locally installed Chrome/Edge (or `LAB_BROWSER`), requires no packages, and writes ignored evidence and a screenshot under `results/`.

## Scripted scenarios and expected outcomes

Choose a scenario, then run baseline and protected fixtures. Comparison cards use the latest run of each mode for that scenario only. Selecting a history entry switches the scenario and timeline together. A missing counterpart stays empty.

| Scenario | Baseline evaluator | Protected gateway | Protected evaluator | Public summary |
|---|---|---|---|---|
| Direct synthetic-secret leak | Raw leak | Blocks candidate, allows fallback | No leak | Completed |
| Harmless public summary | No leak | Allows, no blocks | No leak | Completed |
| Base64-encoded synthetic-secret leak | Base64 leak | Allows, no blocks | Base64 leak | Completed |

The gateway policy remains `exact-marker-v1`: it matches only the raw synthetic marker. The independent `known-marker-v1` evaluator inspects published output for that marker and its known Base64 representation. Evaluator findings never change gateway decisions. `leakDetected` is retained as a compatibility alias for `evaluation.leakDetected`.

Evidence exports include the selected run, separate gateway events and evaluator findings, and a comparison restricted to that run's scenario. Missing modes are `null`. The selected history run can be older than the latest comparison run; run IDs identify each explicitly. Exports use schema version 2 and remain ignored by Git.

## Architecture

`engine.js`: three selectable scripted scenarios, role allowlist, unchanged exact-marker policy, in-memory publication sink, evidence chain.

`evaluator.js`: independent raw and known-Base64 checks over published output.

`public/comparison.js`: shared scenario pairing and evidence export assembly.
`server.js`: loopback HTTP interface, strict Host/Origin/custom-header mutation checks, bounded request size, allowlisted static routes.
`public/`: dashboard, comparison, timeline, history, evidence JSON export.
`test/`: engine and HTTP integration tests.

## Limits / threat model

This tests cooperative scripted fixture calls through one gateway. It is NOT an OS/container sandbox and cannot contain hostile code. Exact matching misses transformed, encoded and paraphrased information. It does not implement comprehensive taint tracking or prove safety of arbitrary agents. The fallback is explicitly programmed, not model-generated. The evidence hash chain is unsigned and can be recomputed; retain a trusted root externally before using it for integrity checks. No authentication beyond local-origin controls; run on a trusted local machine and do not expose the port. Do not use real secrets.

## Next milestones

1. Real agent adapter behind the same gateway, with explicit data/model consent and bounded execution.
2. Broader independent evaluation, repeated trials, and additional transformed-marker cases.
3. Isolated worker processes with enforced filesystem and network restrictions.
4. Extended scenario library, delegated capability checks, exportable regression suites.

No paid service, deployment or revenue claims are implied. Keep this experiment in its separate private repository.
