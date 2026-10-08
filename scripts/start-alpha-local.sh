#!/usr/bin/env bash
set -euo pipefail
kites_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$kites_root"
exec ./bin/agentwayd-alpha --listen 127.0.0.1:8081 --home "$kites_root/data/alpha" --store sqlite --cwd "$kites_root" --enable-registry --sign-key-file data/alpha-keys/sign.pem --verify-key-files data/alpha-keys/verify.pem --tls-cert-file data/alpha-keys/tls.crt --tls-key-file data/alpha-keys/tls.key --public-url wss://127.0.0.1:8081/host/ws
