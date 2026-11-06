# Contributor issue drafts

Published after revalidation against main at `e9040f4526f0c68c2a37cef3880d816ae846e581`. The original scoped proposals below remain as contributor context; check each linked issue for current discussion/status and search open PRs before starting. None requires live inference, model downloads or paid services. This documentation PR implements none of these changes.

- [HTTP admission boundary (#12)](https://github.com/Khaja-syed-786/orbitfault/issues/12): both writer-only IDs still invoke an injected mock runner (HTTP 409); the supported two-role control also reaches it.
- [Cross-platform browser discovery (#13)](https://github.com/Khaja-syed-786/orbitfault/issues/13): code inspection confirms only the override and two Windows paths are searched. Linux/macOS behavior was not executed.
- [Side-effect-free CLI help (#14)](https://github.com/Khaja-syed-786/orbitfault/issues/14): both `--help` commands exit with argument errors before runtime contact; batch `--plan` succeeds.

## 1. Reject CLI-only writer-boundary scenarios at the HTTP admission boundary

**Observed gap:** server.js accepts local-model scenario names from modelScenarios, including writer-control/writer-disclosure. Those require the explicit writer-boundary runner, while the normal server runner deliberately rejects them. A loopback check with an injected mock confirmed HTTP 409 and one runner call for writer-control. The CLI-only flow should be rejected as an unsupported HTTP request before invoking a runner; do not enable writer-only experiments through the dashboard as part of this issue.

**Acceptance criteria:**

- Both writer-only IDs return HTTP 400 with a clear unsupported-scenario message before the model runner is called.
- Existing scripted scenarios and supported two-role model scenarios keep their current admission behavior.
- No change to writer-only CLI plans, fixtures, prompts, policies, metrics, history or evidence basis labels.

**Expected validation:** add HTTP tests using an injected spy/mock runner to assert zero calls for both IDs, plus allowed-scenario controls. Run npm test and git diff --check; no Ollama needed. Submit as a focused server-admission/test PR.

## 2. Make the optional browser smoke check discover installed browsers across platforms

**Observed gap:** scripts/browser-check.js automatically searches only two Windows executable paths after LAB_BROWSER. Contributors on Linux/macOS must discover and set the override themselves even when a supported Chromium-family browser is already installed. The separate security browser harness has different discovery logic; avoid creating a third independent convention.

**Acceptance criteria:**

- Preserve LAB_BROWSER precedence and existing Windows behavior; add bounded discovery of installed compatible browser executables on Linux/macOS.
- Keep execution headless, use an isolated temporary profile, and never download/install a browser or contact a model.
- Missing or invalid tooling produces an explicit failed/unverified result, not a claimed visual pass. Document exact supported platforms and override usage.
- Keep source changes confined to discovery/smoke tooling; no app or metric changes.

**Expected validation:** dependency-free mocked discovery tests cover explicit override, each platform's candidates and missing binaries. Run npm test and the existing --mock-model browser check where tooling exists; report which real OS/browser was actually tested. Do not claim untested platform behavior was visually verified.

## 3. Add side-effect-free help to the existing trial/evaluation CLIs

**Observed gap:** scripts/model-trial.js treats --help as a missing option value; scripts/evaluation-pilot.js rejects it as unknown. Neither has an accessible usage screen. This is especially confusing because the single-trial CLI is live when invoked normally, while the batch CLI defaults to plan-only.

**Acceptance criteria:**

- --help on either CLI exits successfully and describes only currently supported flags/defaults, the plan-only/live distinction, evidence location and explicit inference boundaries.
- Help performs no runtime contact, metadata inspection, model download, trial execution or evidence-file creation.
- Preserve current no-argument behavior, argument validation, limits, scenarios and live authorization gates; do not add new scenario/settings flags or a new inference mode.

**Expected validation:** spawn each CLI in an isolated directory with fetch/socket contact blocked and verify help text, exit status and absence of output files. Keep controls for invalid flags and existing safe plan behavior. Run npm test and git diff --check; do not invoke live execution. Submit as a small CLI/documentation/test PR.
