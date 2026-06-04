#!/usr/bin/env bash
echo "Checking PharmaFlow API..."
for url in http://127.0.0.1:4002/api/health http://localhost:4002/api/health; do
  if curl -sf "$url" >/dev/null; then
    echo "OK  $url"
    curl -s "$url" | head -c 120
    echo ""
    exit 0
  else
    echo "FAIL $url"
  fi
done
echo ""
echo "API is not running. Start it:"
echo "  cd ~/Projects/pharmaflow-ai && npm run dev:all"
exit 1
