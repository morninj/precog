#!/bin/bash
# Registers the Precog helper with Chrome (macOS) so the extension can ask it
# to make Claude API calls. Usage:
#
#   helper/install.sh [extension-id ...]
#
# With no arguments it allows the Chrome Web Store build of Precog. Pass the ID
# shown on chrome://extensions to allow an unpacked build as well.
set -e

HOST_NAME="cc.precog.helper"
STORE_ID="ifjagjgdciomdbcjjbfaijkekenefhib"
HELPER="$(cd "$(dirname "$0")" && pwd)/precog_helper.py"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

origins=""
for id in "$STORE_ID" "$@"; do
  if ! [[ "$id" =~ ^[a-p]{32}$ ]]; then
    echo "Not a Chrome extension ID: $id" >&2
    exit 1
  fi
  origins="$origins${origins:+, }\"chrome-extension://$id/\""
done

chmod +x "$HELPER"
mkdir -p "$TARGET_DIR"
cat > "$TARGET_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Precog helper: makes Claude API calls outside the browser",
  "path": "$HELPER",
  "type": "stdio",
  "allowed_origins": [$origins]
}
EOF

echo "Installed $TARGET_DIR/$HOST_NAME.json"
echo "Helper script: $HELPER (keep it at this path, or run this again after moving it)"
echo
echo "Next, store your Anthropic API key in the Keychain (you'll be prompted for it):"
echo "  security add-generic-password -U -a \"\$USER\" -s precog-anthropic-api-key -w"
