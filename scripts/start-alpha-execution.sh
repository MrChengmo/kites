#!/usr/bin/env bash
set -euo pipefail
kites_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$kites_root"
exec ./bin/agentwayd --listen 127.0.0.1:8082 --home "$kites_root/data/alpha-execution" --store sqlite --cwd "$kites_root" --connect wss://127.0.0.1:8081/host/ws --token-file data/alpha-keys/execution.cred --ca-file data/alpha-keys/tls.crt
