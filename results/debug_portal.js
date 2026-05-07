const puppeteer = require('puppeteer-core');
const fs = require('fs');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  
  // Step 1: Go to portal
  console.log('1. Going to portal...');
  await page.goto('https://payments.billdesk.com/bdcollect/pay?p1=6634&p2=15', { waitUntil: 'networkidle2', timeout: 30000 });
  await DELAY(2000);

  // Step 2: Click Past Payments tab BEFORE login
  console.log('2. Clicking Past Payments tab...');
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button, li, span, div'));
    for (const el of links) {
      if (el.textContent.trim().includes('Past Payments')) { el.click(); return true; }
    }
  });
  await DELAY(1500);

  // Step 3: Enter roll number
  console.log('3. Entering roll number...');
  await page.evaluate((rollNo) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    for (const inp of inputs) {
      const label = inp.getAttribute('placeholder') || '';
      const nearby = inp.parentElement ? inp.parentElement.textContent : '';
      if (label.toLowerCase().includes('admission') || nearby.toLowerCase().includes('admission')) {
        inp.value = '';
        inp.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(inp, rollNo);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    const firstInput = document.querySelector('input[type="text"]');
    if (firstInput) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(firstInput, rollNo);
      firstInput.dispatchEvent(new Event('input', { bubbles: true }));
      firstInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, '23B21A45A6');
  await DELAY(500);

  // Step 4: Click Submit
  console.log('4. Clicking Submit...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
    for (const btn of btns) {
      if (btn.textContent.trim().toLowerCase().includes('submit')) { btn.click(); return; }
    }
  });
  await DELAY(4000);

  // Step 5: Check page after login
  console.log('5. Page text after login:');
  const afterLoginText = await page.evaluate(() => document.body.innerText);
  console.log('=== AFTER LOGIN (first 500 chars) ===');
  console.log(afterLoginText.substring(0, 500));
  console.log('=====================================');

  // Step 6: Get full HTML to find Past Payments link
  console.log('6. Looking for Past Payments elements...');
  const pastPayElements = await page.evaluate(() => {
    const results = [];
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const txt = el.textContent.trim();
      if (txt === 'Past Payments' || txt.includes('Past Payment')) {
        results.push({
          tag: el.tagName,
          text: txt.substring(0, 60),
          href: el.href || '',
          onclick: el.getAttribute('ng-click') || el.getAttribute('onclick') || '',
          classes: el.className,
          id: el.id,
          parent: el.parentElement ? el.parentElement.tagName + '.' + el.parentElement.className : ''
        });
      }
    }
    return results;
  });
  console.log('Past Payment elements found:', JSON.stringify(pastPayElements, null, 2));

  // Step 7: Try clicking the exact Past Payments element
  console.log('7. Clicking Past Payments with different strategies...');
  
  // Strategy A: Try ng-click
  const ngClickResult = await page.evaluate(() => {
    const els = document.querySelectorAll('[ng-click]');
    for (const el of els) {
      const ngClick = el.getAttribute('ng-click');
      if (ngClick && (ngClick.includes('past') || ngClick.includes('Past') || ngClick.includes('history'))) {
        console.log('Found ng-click:', ngClick);
        el.click();
        return { found: true, ngClick };
      }
    }
    // Try all clickable elements with Past Payments text
    const all = document.querySelectorAll('a, li, div, span, button');
    for (const el of all) {
      if (el.textContent.trim() === 'Past Payments') {
        el.click();
        return { found: true, tag: el.tagName, text: el.textContent.trim() };
      }
    }
    return { found: false };
  });
  console.log('ng-click result:', JSON.stringify(ngClickResult));
  
  await DELAY(4000);

  // Step 8: Check page after clicking Past Payments
  console.log('8. Page text after Past Payments click:');
  const afterPastPay = await page.evaluate(() => document.body.innerText);
  console.log('=== AFTER PAST PAYMENTS ===');
  console.log(afterPastPay.substring(0, 1500));
  console.log('===========================');

  // Step 9: Check if there are payment cards
  const hasPaymentRef = afterPastPay.includes('Payment Ref');
  const hasTransactionId = afterPastPay.includes('Transaction Id');
  const hasHostelFee = afterPastPay.includes('Hostel F-Fee');
  console.log(`Has 'Payment Ref': ${hasPaymentRef}`);
  console.log(`Has 'Transaction Id': ${hasTransactionId}`);
  console.log(`Has 'Hostel F-Fee': ${hasHostelFee}`);

  // Step 10: Get current URL
  const url = page.url();
  console.log('Current URL:', url);

  // Save full text to file
  fs.writeFileSync('debug_page_output.txt', afterPastPay);
  console.log('Full page text saved to debug_page_output.txt');

  // Keep browser open for 10 seconds for visual check
  await DELAY(10000);
  await browser.close();
})();
