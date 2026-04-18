const puppeteer = require('puppeteer');

// Test with first student only to understand the portal structure
const TEST_ROLL = '256Q1A4234';
const PORTAL_URL = 'https://www.kietgroup.info/Account/Login';
const DELAY = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('🔍 Inspecting KIET Portal structure...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  // 1. Open login page
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });
  await DELAY(3000);

  // Capture all input fields
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      className: el.className
    }));
  });
  console.log('🔑 Login Page Inputs:');
  console.log(JSON.stringify(inputs, null, 2));

  // Capture all buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, input[type="submit"]')).map(el => ({
      tag: el.tagName,
      type: el.type,
      text: el.innerText || el.value,
      id: el.id,
      className: el.className
    }));
  });
  console.log('\n🔘 Buttons:');
  console.log(JSON.stringify(buttons, null, 2));

  // Type credentials
  console.log('\n📝 Entering credentials...');
  
  // Try to find username field
  const userSel = 'input[name="UserName"], input[id*="user" i], input[placeholder*="user" i], input[placeholder*="roll" i], input[type="text"]:first-of-type';
  const passSel = 'input[type="password"]';

  try {
    await page.waitForSelector(userSel, { timeout: 5000 });
    await page.type(userSel, TEST_ROLL);
    await page.type(passSel, TEST_ROLL);
    console.log('✅ Credentials entered');
    
    // Screenshot before login
    await page.screenshot({ path: 'login_before.png', fullPage: true });
    console.log('📸 Screenshot: login_before.png');

    // Submit
    const submitSel = 'input[type="submit"], button[type="submit"], button:last-of-type';
    await page.click(submitSel).catch(() => page.keyboard.press('Enter'));
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await DELAY(3000);

    console.log('\n🌐 Current URL after login:', page.url());
    
    // Screenshot after login
    await page.screenshot({ path: 'login_after.png', fullPage: true });
    console.log('📸 Screenshot: login_after.png');

    // All navigation links
    const navLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, li')).map(el => ({
        text: el.innerText?.trim().substring(0, 60),
        href: el.href || ''
      })).filter(l => l.text && l.text.length > 1);
    });
    console.log('\n🔗 Navigation Links (first 30):');
    navLinks.slice(0, 30).forEach(l => console.log(`  "${l.text}" -> ${l.href}`));

    // Find academic/result links
    const resultLinks = navLinks.filter(l => /academic|result|marks|report|score/i.test(l.text + l.href));
    console.log('\n📊 Result-related links:');
    console.log(JSON.stringify(resultLinks, null, 2));

    // Click first result link if found
    if (resultLinks.length > 0) {
      const targetHref = resultLinks[0].href;
      if (targetHref) {
        await page.goto(targetHref, { waitUntil: 'domcontentloaded' });
        await DELAY(3000);
        
        // Screenshot of result page
        await page.screenshot({ path: 'result_page.png', fullPage: true });
        console.log('\n📸 Screenshot: result_page.png');
        
        // Get all text content
        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
        console.log('\n📄 Result Page Text (first 3000 chars):');
        console.log(pageText);

        // Get table structure
        const tables = await page.evaluate(() => {
          const tables = document.querySelectorAll('table');
          const result = [];
          tables.forEach((t, i) => {
            const rows = Array.from(t.querySelectorAll('tr')).slice(0, 5);
            result.push({
              tableIndex: i,
              rows: rows.map(row => ({
                cells: Array.from(row.querySelectorAll('th,td')).map(c => c.innerText.trim())
              }))
            });
          });
          return result;
        });
        console.log('\n📋 Tables:');
        console.log(JSON.stringify(tables, null, 2));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: 'error_state.png', fullPage: true });
  }

  console.log('\n⏳ Browser staying open for 30 seconds for manual inspection...');
  await DELAY(30000);
  await browser.close();
  console.log('Done!');
})();
