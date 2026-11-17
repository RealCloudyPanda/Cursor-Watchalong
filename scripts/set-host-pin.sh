#!/usr/bin/env bash
# Sets the host PIN on Fly. Anyone starting a session from the extension must enter it once.
# Guests are unaffected. The PIN is typed hidden and never lands in shell history.
set -euo pipefail
APP="${1:-cursor-watchalong}"

read -r -s -p "New host PIN (6+ characters, hidden): " PIN; echo
read -r -s -p "Type it again: " AGAIN; echo
PIN="$(printf %s "$PIN" | tr -d '[:space:]')"
AGAIN="$(printf %s "$AGAIN" | tr -d '[:space:]')"
if [[ "$PIN" != "$AGAIN" ]]; then echo "✗ They don't match. Nothing changed." >&2; exit 1; fi
if [[ ${#PIN} -lt 6 || ${#PIN} -gt 128 ]]; then
  echo "✗ Use 6 to 128 characters. Nothing changed." >&2
  exit 1
fi

printf 'HOST_PIN=%s\n' "$PIN" | fly secrets import -a "$APP"
echo "✓ Host PIN saved. Enter the same PIN in the extension popup to start sessions."
