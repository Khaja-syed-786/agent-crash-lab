#!/bin/sh
# Runs the labelled mock/loopback PoCs against one checkout. Usage: sh run-pocs.sh <checkout-dir>
# Every PoC runs in a clean environment (env -i), because an inherited no_proxy/NO_PROXY can mask F2.
# Nothing contacts a model runtime or external host. F2 needs 127.0.0.1:18999 free; f1 uses a throwaway git repo.
set -eu
REPO=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
RUN() { env -i PATH="$PATH" HOME="${HOME:-/tmp}" ACL_REPO="$REPO" "$@"; }
echo "checkout: $(git -C "$REPO" rev-parse HEAD)  dirty-files: $(git -C "$REPO" status --porcelain | wc -l | tr -d ' ')"
OTHER=$(mktemp -d)
git -C "$OTHER" init -q
git -C "$OTHER" -c user.email=poc@example.invalid -c user.name=poc commit -q --allow-empty -m unrelated
echo "## F1 (cwd = unrelated repo $(git -C "$OTHER" rev-parse --short HEAD))"; (cd "$OTHER" && RUN node --no-warnings "$HERE/f1.mjs")
rm -rf "$OTHER"
echo "## F2 env-proxy, no NO_PROXY"; RUN NODE_USE_ENV_PROXY=1 HTTP_PROXY=http://127.0.0.1:18999 node --no-warnings "$HERE/f2.mjs"
echo "## F2 env-proxy + NO_PROXY=127.0.0.1"; RUN NODE_USE_ENV_PROXY=1 HTTP_PROXY=http://127.0.0.1:18999 NO_PROXY=127.0.0.1 node --no-warnings "$HERE/f2.mjs"
echo "## F2 default environment"; RUN node --no-warnings "$HERE/f2.mjs"
for f in f7 f8 f9 f10; do echo "## $(echo $f | tr f F)"; RUN node --no-warnings "$HERE/$f.mjs" | tr -d '\n'; echo; done
echo "## CI-1 release-tag v9.9.9 (package.json $(node -p "require('$REPO/package.json').version"))"; RUN node "$REPO/scripts/release-tag.js" v9.9.9 >/dev/null 2>&1 && echo "exit 0 (accepted)" || echo "exit non-zero (rejected)"
