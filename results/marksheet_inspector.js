const puppeteer = require('puppeteer');

const TEST_ROLL = '256Q1A4234';
const PORTAL_URL = 'https://www.kietgroup.info/Account/Login';
const MARKSHEET_URL = 'https://www.kietgroup.info/Student/MarkSheet.aspx';
const DELAY = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('🔍 Inspecting MarkSheet page...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  // LOGIN
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });
  await DELAY(2000);
  await page.type('#MainContent_UserName', TEST_ROLL);
  await page.type('#MainContent_Password', TEST_ROLL);
  await page.click('input[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await DELAY(2000);
  console.log('✅ Logged in:', page.url());

  // GO TO MARKSHEET
  await page.goto(MARKSHEET_URL, { waitUntil: 'domcontentloaded' });
  await DELAY(3000);
  console.log('📊 MarkSheet URL:', page.url());

  // Screenshot
  await page.screenshot({ path: 'marksheet.png', fullPage: true });
  console.log('📸 Screenshot saved: marksheet.png');

  // Dump full page text
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('\n📄 Full page text:\n');
  console.log(pageText.substring(0, 5000));

  // Find dropdowns (semester selector etc.)
  const selects = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('select')).map(sel => ({
      id: sel.id,
      name: sel.name,
      options: Array.from(sel.options).map(o => ({ value: o.value, text: o.text }))
    }));
  });
  console.log('\n📋 Dropdowns / Selects:');
  console.log(JSON.stringify(selects, null, 2));

  // All tables
  const tables = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = [];
    tables.forEach((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr'));
      result.push({
        tableIndex: i,
        id: t.id,
        className: t.className,
        totalRows: rows.length,
        sampleRows: rows.slice(0, 10).map(row => ({
          cells: Array.from(row.querySelectorAll('th,td')).map(c => c.innerText.trim())
        }))
      });
    });
    return result;
  });
  console.log('\n📋 All Tables:');
  console.log(JSON.stringify(tables, null, 2));

  // All spans/divs with CGPA or percentage info
  const cgpaInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('span, div, label, td, p'));
    return allEls
      .map(el => el.innerText?.trim())
      .filter(t => t && /cgpa|gpa|percentage|sgpa|credit|total|grade/i.test(t))
      .slice(0, 30);
  });
  console.log('\n🎓 CGPA/Grade related text:');
  console.log(JSON.stringify(cgpaInfo, null, 2));

  // Check for semester dropdown and click first semester
  const hasSemDropdown = selects.length > 0;
  if (hasSemDropdown) {
    const firstSelect = selects[0];
    console.log(`\n🔄 Found dropdown: ${firstSelect.id} with ${firstSelect.options.length} options`);
    // Select first sem (value 1) if available
    const sem1 = firstSelect.options.find(o => o.text.includes('1') || o.value === '1');
    if (sem1) {
      await page.select(`#${firstSelect.id}`, sem1.value);
      await DELAY(2000);
      await page.screenshot({ path: 'marksheet_sem1.png', fullPage: true });
      console.log('📸 Sem1 screenshot: marksheet_sem1.png');
    }
  }

  // Check for any buttons to submit/load results
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(b => ({
      id: b.id, text: b.innerText || b.value, type: b.type, name: b.name
    }));
  });
  console.log('\n🔘 Buttons on MarkSheet page:');
  console.log(JSON.stringify(buttons, null, 2));

  console.log('\n⏳ Keeping browser open 40s for manual inspection...');
  await DELAY(40000);
  await browser.close();
  console.log('Done!');
})();
