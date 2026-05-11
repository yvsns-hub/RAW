const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Ensures Chrome is installed and returns the executable path.
 * If Chrome is not found in the Puppeteer cache, it installs it.
 * This makes the app self-healing on Render even when build cache is stale.
 */
async function ensureChrome() {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  if (!isProd) {
    console.log('🏠 Local mode — skipping Chrome check');
    return null; // Local mode uses local Chrome
  }

  const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/project/src/.cache/puppeteer';
  console.log(`🔍 Checking Chrome installation in: ${cacheDir}`);

  // Try to find any installed Chrome binary
  let chromePath = findChrome(cacheDir);

  if (chromePath) {
    console.log(`✅ Chrome found at: ${chromePath}`);
    return chromePath;
  }

  // Chrome not found — install it
  console.log('⚠️ Chrome not found! Installing via Puppeteer...');
  try {
    // Clear corrupted cache if directory exists but executable is missing
    const chromeDir = path.join(cacheDir, 'chrome');
    if (fs.existsSync(chromeDir)) {
      console.log('🧹 Clearing corrupted Chrome cache...');
      fs.rmSync(chromeDir, { recursive: true, force: true });
    }

    execSync(`npx puppeteer browsers install chrome`, {
      env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
      stdio: 'inherit',
      timeout: 120000, // 2 minute timeout
    });
    console.log('✅ Chrome installation complete');
  } catch (installErr) {
    console.error('❌ Chrome installation failed:', installErr.message);
    throw new Error('Failed to install Chrome. The scraper will not work.');
  }

  // Find the newly installed Chrome
  chromePath = findChrome(cacheDir);
  if (chromePath) {
    console.log(`✅ Chrome ready at: ${chromePath}`);
    return chromePath;
  }

  throw new Error(`Chrome still not found after installation. Cache dir: ${cacheDir}`);
}

/**
 * Scan the Puppeteer cache directory for any installed Chrome binary.
 */
function findChrome(cacheDir) {
  const chromeBaseDir = path.join(cacheDir, 'chrome');

  if (!fs.existsSync(chromeBaseDir)) {
    console.log(`   📂 Chrome dir does not exist: ${chromeBaseDir}`);
    return null;
  }

  const entries = fs.readdirSync(chromeBaseDir);
  console.log(`   📂 Cache contents: ${entries.join(', ') || '(empty)'}`);

  const linuxDirs = entries.filter(d => d.startsWith('linux-'));
  if (linuxDirs.length === 0) {
    console.log('   ❌ No linux-* Chrome versions found');
    return null;
  }

  // Sort and use the latest version
  linuxDirs.sort();
  for (let i = linuxDirs.length - 1; i >= 0; i--) {
    const candidate = path.join(chromeBaseDir, linuxDirs[i], 'chrome-linux64', 'chrome');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    console.log(`   ⚠️ Binary missing at: ${candidate}`);
  }

  return null;
}

module.exports = { ensureChrome, findChrome };
