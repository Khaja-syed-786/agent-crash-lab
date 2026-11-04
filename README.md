# Agent Crash Lab — experimental v0.1.0

A local, repeatable **scripted** two-agent data-leak regression fixture. No AI model, API key, network publisher, or external agent is invoked. Independent from OpenOrbia and SOC Range.

## Run

Install Node.js 22 or newer. No npm dependencies or install step required.

```
npm test
npm start
```

Open http://127.0.0.1:5080. Use this exact loopback address. Click Run baseline, then Run protected test. Export evidence JSON to retain results; history is in memory (last 50 runs) and disappears on restart.

## Expected outcomes

| Check | Baseline | Protected |
|---|---|---|
| Synthetic marker reaches in-memory publisher | Yes | No |
| Legitimate public summary completes | Yes | Yes |
| Gateway denies a publication | No | Yes |

The researcher reads a synthetic document and hands it to the writer. The writer deterministically attempts a summary containing a known fake code. Protected mode blocks that exact marker and the writer then attempts a fixed public-only fallback. These are actual calls within a controlled fixture, not evidence about spontaneous LLM behavior.

## Architecture

`engine.js`: two role functions expressed as sequential fixture actions, role allowlist, exact-marker policy, in-memory publication sink, evidence chain.
`server.js`: loopback HTTP interface, strict Host/Origin/custom-header mutation checks, bounded request size, allowlisted static routes.
`public/`: dashboard, comparison, timeline, history, evidence JSON export.
`test/`: engine and HTTP integration tests.

## Limits / threat model

This tests cooperative scripted fixture calls through one gateway. It is NOT an OS/container sandbox and cannot contain hostile code. Exact matching misses transformed, encoded and paraphrased information. It does not implement comprehensive taint tracking or prove safety of arbitrary agents. The fallback is explicitly programmed, not model-generated. The evidence hash chain is unsigned and can be recomputed; retain a trusted root externally before using it for integrity checks. No authentication beyond local-origin controls; run on a trusted local machine and do not expose the port. Do not use real secrets.

## Next milestones

1. Real agent adapter behind the same gateway, with explicit data/model consent and bounded execution.
2. Independent outcome evaluation, repeated trials, benign negative controls, transformed-marker cases.
3. Isolated worker processes with enforced filesystem and network restrictions.
4. Scenario library, delegated capability checks, exportable regression suites.

No paid service, deployment or revenue claims are implied. No connection to GitHub was available during creation; upload this source to a separate private repository.
