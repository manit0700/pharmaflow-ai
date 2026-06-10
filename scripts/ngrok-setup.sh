#!/usr/bin/env bash
# Configure ngrok authtoken from server/.env (NGROK_AUTHTOKEN)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy server/.env.example to server/.env first."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  echo "Add your ngrok authtoken to server/.env:"
  echo "  NGROK_AUTHTOKEN=your_token_from_https://dashboard.ngrok.com/get-started/your-authtoken"
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Install ngrok: brew install ngrok"
  exit 1
fi

ngrok config add-authtoken "$NGROK_AUTHTOKEN"
echo "ngrok authtoken saved. Run: npm run ngrok:tunnel"
