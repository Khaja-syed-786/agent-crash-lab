# Node environment-proxy routing matrix (F2)

Measured with `poc/node-env-proxy-matrix.mjs` on Node v22.23.4. Each row ran a fresh child process with only `PATH` plus the listed variables, and fetched `http://127.0.0.1:11434/api/version`. Two loopback stand-ins recorded the result: a proxy on an ephemeral port, and a direct listener on 127.0.0.1:11434 (no Ollama was running). "E" means `NODE_USE_ENV_PROXY=1` plus `HTTP_PROXY=<stand-in proxy>`.

The last column is the remediation's `environmentProxyActive()` decision for the same variables. **Every row Node routed via the proxy is refused.** Two rows refuse although Node connected directly (marked *conservative*).

| Environment | Node: via proxy | Node: direct | Adapter decision |
|---|---|---|---|
| default (no proxy vars) | no | yes | allow |
| HTTP_PROXY only, env-proxy off | no | yes | allow |
| env-proxy + HTTP_PROXY | **yes** | no | refuse |
| env-proxy + http_proxy | **yes** | no | refuse |
| env-proxy + HTTPS_PROXY only | no | yes | allow |
| NODE_OPTIONS=--use-env-proxy + HTTP_PROXY | **yes** | no | refuse |
| E + NO_PROXY=127.0.0.1 | no | yes | allow |
| E + no_proxy=127.0.0.1 | no | yes | allow |
| E + NO_PROXY=127.0.0.1:11434 | no | yes | allow |
| E + NO_PROXY=* | no | yes | allow |
| E + NO_PROXY=" 127.0.0.1 " (spaces) | no | yes | allow |
| E + NO_PROXY="example.test,127.0.0.1" | no | yes | allow |
| E + NO_PROXY="example.test 127.0.0.1" | no | yes | allow |
| E + NO_PROXY=localhost | **yes** | no | refuse |
| E + NO_PROXY=127.0.0.0/8 | **yes** | no | refuse |
| E + NO_PROXY=127.0.0.1:9999 | **yes** | no | refuse |
| E + NO_PROXY=.0.0.1 | no | yes | refuse (*conservative*) |
| E + no_proxy="" + NO_PROXY=127.0.0.1 | **yes** | no | refuse |
| E + no_proxy=localhost + NO_PROXY=127.0.0.1 | **yes** | no | refuse |
| E + http_proxy="" + HTTP_PROXY=P | no | yes | refuse (*conservative*) |

Rows where Node used the proxy but the adapter would allow: **0**.

Observed Node semantics: lowercase `no_proxy` takes precedence over `NO_PROXY`, even when it is empty, and likewise `http_proxy` over `HTTP_PROXY`. Entries are split on commas or whitespace. Exact host, host:port, `*` and suffix tokens bypass the proxy; `localhost` does not cover 127.0.0.1, and CIDR ranges are not honoured. `HTTPS_PROXY` does not apply to this `http:` endpoint. Other Node versions may differ. The test suite therefore re-checks the key rows on each run against an ephemeral port (`test/security-new-api.test.js`), and skips if env-proxy is unsupported.

**Caution:** the measurement script binds 127.0.0.1:11434 as a stand-in, so do not run it where a real Ollama is listening; it fails if the port is busy.
