#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Clear Cache if needed
# rm -rf node_modules/.cache

# Puppeteer explicit cache directory install for Render
export PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
npx puppeteer browsers install chrome

echo "Build completed successfully."
