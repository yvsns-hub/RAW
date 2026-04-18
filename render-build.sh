#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Clear Cache if needed
# rm -rf node_modules/.cache

# Puppeteer/Chrome dependencies are usually handled by the 'puppeteer' package
# but Render's platform sometimes needs specifically installed libraries.
# On Render's native environment, we might need a specific build command
# that includes these if we were using a custom Dockerfile.
# For standard Node.js build, the @sparticuz/chromium approach is better.

echo "Build completed successfully."
