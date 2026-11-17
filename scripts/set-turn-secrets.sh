#!/usr/bin/env bash
# Prompts for Cloudflare Realtime TURN credentials, checks them with Cloudflare, then saves
# them as Fly secrets. The API token is read hidden and never appears on screen or in history.
set -euo pipefail

APP="${1:-cursor-watchalong}"

echo "Cloudflare dashboard → Realtime → TURN Server → your key."
read -r -p "Turn Token ID: " KEY_ID
read -r -s -p "API Token (hidden, paste and press Enter): " TOKEN
echo

KEY_ID="$(printf %s "$KEY_ID" | tr -d '[:space:]')"
TOKEN="$(printf %s "$TOKEN" | tr -d '[:space:]')"
if [[ -z "$KEY_ID" || -z "$TOKEN" || "$KEY_ID" == *PASTE* || "$KEY_ID" == your-* ]]; then
  echo "✗ Those look empty or like placeholder text. Copy the real values from Cloudflare." >&2
  exit 1
fi

echo "Checking the credentials with Cloudflare…"
status="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data '{"ttl": 300}' \
  "https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers")"
if [[ "$status" != "201" && "$status" != "200" ]]; then
  echo "✗ Cloudflare rejected them (HTTP $status). Check the Turn Token ID and API Token." >&2
  exit 1
fi
echo "✓ Cloudflare accepted them."

printf 'CF_TURN_KEY_ID=%s\nCF_TURN_API_TOKEN=%s\n' "$KEY_ID" "$TOKEN" |
  fly secrets import -a "$APP"
echo "✓ Saved on Fly. The app restarts with TURN on."
