#!/usr/bin/env bash
# Start ngrok tunnel to the API port (default 4002). Requires NGROK_AUTHTOKEN in server/.env
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

PORT="${PORT:-4002}"

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  echo "NGROK_AUTHTOKEN is empty. Run: npm run ngrok:setup"
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Install ngrok: brew install ngrok"
  exit 1
fi

ngrok config add-authtoken "$NGROK_AUTHTOKEN" 2>/dev/null || true

echo ""
echo "Starting ngrok → http://localhost:$PORT"
echo "Copy the https://….ngrok-free.app URL into server/.env as PUBLIC_BASE_URL"
echo "Then restart the API (npm run dev:all)"
echo ""

exec ngrok http "$PORT"
