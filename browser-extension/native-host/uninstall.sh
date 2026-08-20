#!/bin/bash
# Uninstall script for CreatorWeave Native Host (macOS)
# Removes the Chrome Native Messaging host manifest.
# Note: the binary in this directory is left untouched.

set -e

HOST_NAME="com.creatorweave.nativehost"

# macOS Chrome native messaging host directory
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

if [ -f "$MANIFEST_PATH" ]; then
    rm "$MANIFEST_PATH"
    echo "Removed native messaging host manifest: $MANIFEST_PATH"
else
    echo "Manifest not found at $MANIFEST_PATH (nothing to uninstall)."
fi

echo ""
echo "Done! Restart Chrome for changes to take effect."
