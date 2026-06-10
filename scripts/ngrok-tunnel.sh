#!/usr/bin/env bash
# Start ngrok tunnel to the API port (default 4002).
# Reads NGROK_AUTHTOKEN/PORT from server/local.config.json first, then server/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_CONFIG="$ROOT/server/local.config.json"
ENV_FILE="$ROOT/server/.env"

PORT="4002"
NGROK_AUTHTOKEN=""

if [[ -f "$LOCAL_CONFIG" ]] && command -v node >/dev/null 2>&1; then
  read -r PORT_FROM_JSON TOKEN_FROM_JSON <<EOF
$(node -e '
const fs = require("fs");
const p = process.argv[1];
try {
  const raw = fs.readFileSync(p, "utf8");
  const j = JSON.parse(raw);
  const port = String(j.PORT ?? "").trim();
  const token = String(j.NGROK_AUTHTOKEN ?? "").trim();
  process.stdout.write(`${port}\n${token}\n`);
} catch {
  process.stdout.write("\n\n");
}
' "$LOCAL_CONFIG")
EOF
  if [[ -n "${PORT_FROM_JSON:-}" ]]; then PORT="$PORT_FROM_JSON"; fi
  if [[ -n "${TOKEN_FROM_JSON:-}" ]]; then NGROK_AUTHTOKEN="$TOKEN_FROM_JSON"; fi
fi

if [[ -f "$ENV_FILE" ]]; then
  if [[ -z "$NGROK_AUTHTOKEN" ]]; then
    TOKEN_FROM_ENV="$(sed -n 's/^NGROK_AUTHTOKEN=//p' "$ENV_FILE" | sed -n '1p' | sed 's/^"//;s/"$//')"
    if [[ -n "${TOKEN_FROM_ENV:-}" ]]; then NGROK_AUTHTOKEN="$TOKEN_FROM_ENV"; fi
  fi
  if [[ "$PORT" == "4002" ]]; then
    PORT_FROM_ENV="$(sed -n 's/^PORT=//p' "$ENV_FILE" | sed -n '1p' | sed 's/^"//;s/"$//')"
    if [[ -n "${PORT_FROM_ENV:-}" ]]; then PORT="$PORT_FROM_ENV"; fi
  fi
fi

if [[ -z "$NGROK_AUTHTOKEN" ]]; then
  echo "NGROK_AUTHTOKEN is empty. Set it in server/local.config.json or server/.env."
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Install ngrok: brew install ngrok"
  exit 1
fi

ngrok config add-authtoken "$NGROK_AUTHTOKEN" 2>/dev/null || true

echo ""
echo "Starting ngrok -> http://localhost:$PORT"
echo "Copy the https://...ngrok-free... URL into server/local.config.json as PUBLIC_BASE_URL"
echo "Then restart: pharmaflow-reset"
echo ""

exec ngrok http "$PORT"
