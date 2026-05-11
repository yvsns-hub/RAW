const chromium = require('@sparticuz/chromium-min');

/**
 * Ensures Chromium is installed and returns the executable path.
 * Uses @sparticuz/chromium-min which is designed for serverless environments
 * and bypasses the memory/disk limits of Render Free Tier.
 */
async function ensureChrome() {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  if (!isProd) {
    console.log('🏠 Local mode — skipping Chrome check');
    return null; // Local mode uses local Chrome
  }

  console.log('📦 Downloading lightweight Chromium for Render...');
  try {
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar'
    );
    console.log(`✅ Chromium downloaded and ready at: ${executablePath}`);
    return executablePath;
  } catch (err) {
    console.error('❌ Chromium download failed:', err.message);
    throw new Error('Failed to download Chromium. The scraper will not work.');
  }
}

module.exports = { ensureChrome, findChrome: () => null };
