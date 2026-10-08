#!/usr/bin/env bash
set -euo pipefail
kites_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$kites_root"
export NODE_EXTRA_CA_CERTS="$kites_root/data/alpha-keys/tls.crt"
export AGENTWAY_ALPHA_URL=https://127.0.0.1:8081
export AGENTWAY_ALPHA_TOKEN_FILE="$kites_root/data/alpha-keys/user.cred"
exec node server/index.mjs
