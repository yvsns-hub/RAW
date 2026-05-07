#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Puppeteer explicit cache directory install for Render
export PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer

# Clear old Chrome versions to prevent stale binary mismatches
rm -rf "$PUPPETEER_CACHE_DIR/chrome"
echo "Cleared old Chrome cache, installing fresh..."

npx puppeteer browsers install chrome

echo "Installed Chrome at:"
ls -la "$PUPPETEER_CACHE_DIR/chrome/" 2>/dev/null || echo "(no chrome dir found)"

echo "Build completed successfully."
