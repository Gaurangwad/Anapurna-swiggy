#!/usr/bin/env bash
# One-command demo: boots mock Swiggy MCP + agent, creates the care profile,
# places an order, and streams the dual WhatsApp milestone feed for ~100s.
set -e
cd "$(dirname "$0")"

npx tsx src/mock-swiggy/server.ts > /tmp/mock.log 2>&1 &
MOCK=$!
npx tsx src/agent/index.ts > /tmp/agent.log 2>&1 &
AGENT=$!
trap "kill $MOCK $AGENT 2>/dev/null" EXIT
sleep 4

curl -s -X POST localhost:7302/api/care-profile \
  -H 'Content-Type: application/json' \
  --data-binary @data/care-profile.example.json > /dev/null

echo "=== AGENT DECISION ==="
RESP=$(curl -s -X POST localhost:7302/api/orders \
  -H 'Content-Type: application/json' \
  --data-binary '{"profileId":"amma-indore","contextNote":"cook is away today"}')
echo "$RESP" | python3 -m json.tool
ORDER=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['orderId'])")

echo
echo "Child dashboard: http://localhost:7302/?order=$ORDER"
echo "Watching lifecycle (~100s)..."
sleep 105

echo "=== WHATSAPP STREAM (parent in Hindi, child in English) ==="
tail -n +1 /tmp/agent.log
echo "=== FINAL STATUS ==="
curl -s localhost:7302/api/orders/$ORDER | python3 -m json.tool
