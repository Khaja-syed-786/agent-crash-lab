# Security policy

## Supported use and threat model

Agent Crash Lab is an experimental, single-user localhost research lab. Use the current main branch; no published release or long-term support schedule is established. Use only synthetic data on a trusted machine, with the dashboard bound to loopback and accessed at http://127.0.0.1:5080 (or its configured port). Do not expose the server through a public listener, tunnel, reverse proxy or shared workstation service.

Host/Origin checks, a custom mutation header, local-address checks and browser security headers constrain the supported HTTP interface. They are not authentication against another local process, compromised browser extensions, hostile in-process code or an administrator. The action gateway is cooperative in-process control, not an OS/container sandbox. Both policies and the evaluator recognize only fixture markers; neither is general protection against information leakage or prompt injection.

Scripted and mocked checks need no runtime. Explicitly authorized actual-model trials use only the fixed loopback Ollama endpoint and installed pinned model, with bounded calls. The loopback listener and its self-reported identity are still trusted. Shared-adapter cancellation halts do not cover fresh adapters/processes. Never use real credentials or customer data. A cloud workspace's localhost is not your laptop.

Evidence hashes are unsigned consistency checks, not authenticated audit logs. Versioned measurement fields distinguish transport receipt, validated envelopes and outcomes; zero known leaks does not prove safety. See [initial findings](docs/INITIAL_FINDINGS.md), the [supplied assessment](docs/SECURITY_ASSESSMENT.md), and the [independent review and residual limits](docs/REMEDIATION_REVIEW.md). Historical reports are scoped observations, not promises about every browser or environment.

## Reporting channel

For non-sensitive reports only, the existing, verified public reporting channel is this repository's [GitHub Issues page](https://github.com/Khaja-syed-786/agent-crash-lab/issues). **Public Issues are for non-sensitive reports only. Confidential reporting is not configured.** The repository's private vulnerability-reporting endpoint was checked during preparation of this document and reported disabled. No private email, private advisory channel or alternative contact is claimed here.

For a report safe to discuss publicly, include a sanitized description, affected commit/Node/browser version, minimal synthetic reproduction, expected versus observed behavior and whether the result used a script, mock or actual model. Provide aggregate outcomes rather than raw model prompts/responses. Do not test systems you do not control, run paid/live inference, or publish real secrets to demonstrate impact.

For a potentially sensitive vulnerability, do not disclose details in public Issues, PRs, comments or attachments. **Withhold exploit details, credentials, customer data, private paths and raw evidence until the maintainer establishes and you verify a confidential channel.** No confidential channel or alternative contact is currently configured or provided here. Suspected exposed credentials should be revoked through their provider; do not reproduce their values publicly.

No bug bounty, guaranteed response time or disclosure deadline is offered. Reporting-channel availability may change; verify the destination and its visibility before sending information. Do not interpret a public issue form as private reporting.
