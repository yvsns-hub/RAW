const puppeteer = require('puppeteer-core');
const ExcelJS   = require('exceljs');
const path      = require('path');
const fs        = require('fs');

// ─── CONSTANTS ───
const BILLDESK_URL = 'https://payments.billdesk.com/bdcollect/pay?p1=6634&p2=15';
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ─── SCRAPE ONE STUDENT ───
async function scrapeStudentPayment(browser, student, targetMonth, targetYear, onLog) {
  const page = await browser.newPage();

  // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  page.setDefaultNavigationTimeout(45000);

  try {
    // ── Step 1: Go to BillDesk portal ──
    onLog(`Navigating to BillDesk portal...`);
    await page.goto(BILLDESK_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await DELAY(2000); // Wait for Angular to render

    // ── Step 2: Enter roll number (on default Make Payment tab) ──
    onLog(`Entering roll number: ${student.rollNo}`);
    
    // Find the admission input field
    const inputFilled = await page.evaluate((rollNo) => {
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
      // Fallback: use the first visible text input
      const firstInput = document.querySelector('input[type="text"]') || document.querySelector('input:not([type="hidden"]):not([type="submit"])');
      if (firstInput) {
        firstInput.value = '';
        firstInput.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(firstInput, rollNo);
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        firstInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, student.rollNo);

    if (!inputFilled) {
      await page.close();
      return { ...student, status: 'ERROR', error: 'Could not find admission input field' };
    }

    // ── Step 4: Click Submit ──
    onLog(`Submitting login...`);
    const submitClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
      for (const btn of btns) {
        if (btn.textContent.trim().toLowerCase().includes('submit')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!submitClicked) {
      await page.close();
      return { ...student, status: 'ERROR', error: 'Submit button not found' };
    }

    await DELAY(3000); // Wait for Angular to process login

    // ── Step 5: Check for errors ──
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('User not found') || pageText.includes('not found')) {
      onLog(`❌ User not found for ${student.rollNo}`);
      await page.close();
      return { ...student, status: 'ERROR', error: 'User not found on BillDesk portal' };
    }

    // ── Step 6: Read admission number from portal for roll number verification ──
    const portalData = await page.evaluate(() => {
      const text = document.body.innerText;
      let studentName = '';
      let admissionNo = '';

      // Extract Student Name
      const nameMatch = text.match(/Student\s*Name[:\s]*([A-Z][A-Z .]+?)\s*(?:Admission|Course|Semester|Father|$)/i);
      if (nameMatch) studentName = nameMatch[1].trim();

      // Extract Admission No (this IS the roll number on the portal)
      const admMatch = text.match(/Admission\s*No[:\s]*([A-Z0-9]+)/i);
      if (admMatch) admissionNo = admMatch[1].trim();

      return { studentName, admissionNo };
    });

    onLog(`Portal: ${portalData.studentName || 'N/A'} | Admission: ${portalData.admissionNo || 'N/A'}`);

    // Roll number mismatch check — only verify roll numbers, ignore names
    let rollNoMismatch = false;
    if (portalData.admissionNo) {
      const portalRoll = portalData.admissionNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const inputRoll = student.rollNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (portalRoll !== inputRoll) {
        rollNoMismatch = true;
        onLog(`⚠️ ROLL NO MISMATCH! Input: "${student.rollNo}" vs Portal: "${portalData.admissionNo}"`);
      }
    }

    // ── Step 7: Navigate to Past Payments (after login) ──
    onLog(`Going to Past Payments...`);
    await page.evaluate(() => {
      // Use the known onclick function
      if (typeof setPastPaymentsTab === 'function') { setPastPaymentsTab(); return; }
      // Fallback: click the LI with specific ID
      const li = document.getElementById('downloadreceiptportaltab');
      if (li) { li.click(); return; }
      // Last resort: find by text on the LI element specifically
      const lis = Array.from(document.querySelectorAll('li'));
      for (const el of lis) {
        if (el.textContent.trim() === 'Past Payments') { el.click(); return; }
      }
    });

    await DELAY(4000); // Wait for past payments to load

    // ── Step 7b: Scroll to bottom to load all payment history ──
    onLog(`Loading all payment history (scrolling)...`);
    let prevHeight = 0;
    for (let scroll = 0; scroll < 20; scroll++) {
      const curHeight = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      });
      if (curHeight === prevHeight) break;
      prevHeight = curHeight;
      await DELAY(800);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await DELAY(500);

    // ── Step 8: Extract payment data ──
    onLog(`Extracting payment data for ${targetMonth}/${targetYear}...`);
    
    const payments = await page.evaluate(() => {
      const results = [];
      const bodyText = document.body.innerText;

      // The portal shows payment cards with this structure:
      //   SUCCESSFUL                    (or FAILED)
      //   Hostel F-Fee
      //   2026-01-02 10:11:20           ₹ 2,850.00 (amount on same or next line)
      //   Transaction Id: BD00000009471315
      //   Payment Ref No:CIC5YC1175AAW4
      //   VIEW SUMMARY   DOWNLOAD

      // Split by status labels (SUCCESSFUL or FAILED) to get one block per card
      const blocks = bodyText.split(/(?=\bSUCCESSFUL\b|\bFAILED\b|\bCHECK STATUS\b)/g);

      for (const block of blocks) {
        if (!block.includes('Transaction Id')) continue;

        // Determine status from the first word
        const isSuccess = block.trimStart().startsWith('SUCCESSFUL');
        const isFailed = block.trimStart().startsWith('FAILED');
        
        // Extract date (YYYY-MM-DD HH:MM:SS)
        const dateMatch = block.match(/(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}/);
        // Extract amount (could be ₹ X,XXX.XX or just X,XXX.XX)
        const amtMatch = block.match(/([\d,]+\.\d{2})/);
        // Extract Transaction Id
        const txnMatch = block.match(/Transaction\s*Id[:\s]*([A-Z0-9]+)/i);
        // Extract Payment Ref No
        const refMatch = block.match(/Payment\s*Ref\s*No[:\s]*([A-Z0-9]+)/i);

        if (dateMatch) {
          results.push({
            status: isSuccess ? 'SUCCESS' : 'FAILED',
            date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
            dateYear: parseInt(dateMatch[1]),
            dateMonth: parseInt(dateMatch[2]),
            dateDay: parseInt(dateMatch[3]),
            refNo: refMatch ? refMatch[1] : '',
            txnId: txnMatch ? txnMatch[1] : '',
            amount: amtMatch ? amtMatch[1].replace(/,/g, '') : '',
            feeType: 'Hostel F-Fee',
          });
        }
      }

      return results;
    });

    onLog(`Found ${payments.length} total payment(s)`);

    // ── Step 9: Filter by target month/year and SUCCESS status ──
    const targetMonthNum = parseInt(targetMonth);
    const targetYearNum = parseInt(targetYear);
    
    const matchingPayments = payments.filter(p => {
      // Skip failed payments — only collect SUCCESS
      if (p.status !== 'SUCCESS') return false;
      
      // Check date matches target month/year using pre-parsed fields
      if (p.dateMonth === targetMonthNum && p.dateYear === targetYearNum) return true;
      
      return false;
    });

    onLog(`${matchingPayments.length} payment(s) match ${targetMonth}/${targetYear}`);

    // ── Step 10: Logout ──
    onLog(`Logging out...`);
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      for (const el of links) {
        if (el.textContent.trim().toLowerCase().includes('log out') || el.textContent.trim().toLowerCase().includes('logout')) {
          el.click();
          return;
        }
      }
    });
    await DELAY(1000);

    await page.close();

    // Build result — if roll number mismatched, mark as MISMATCH
    if (rollNoMismatch) {
      return {
        ...student,
        portalName: portalData.studentName || '',
        rollNoMismatch: true,
        status: 'MISMATCH',
        error: `Roll No mismatch: input "${student.rollNo}" vs portal "${portalData.admissionNo}"`,
        receiptIds: '',
        dates: '',
        amounts: '',
        payments: [],
      };
    }

    if (matchingPayments.length === 0) {
      return {
        ...student,
        portalName: portalData.studentName || '',
        rollNoMismatch: false,
        status: 'NOT_PAID',
        receiptIds: '',
        dates: '',
        amounts: '',
        payments: [],
      };
    }

    // Multiple payments: join with comma
    const receiptIds = matchingPayments.map(p => p.refNo || p.txnId || 'N/A').join(', ');
    const dates = matchingPayments.map(p => p.date || 'N/A').join(', ');
    const amounts = matchingPayments.map(p => {
      const amt = parseFloat(p.amount || 0);
      const sur = parseFloat(p.surcharge || 0);
      return (amt + sur) || p.amount || 'N/A';
    }).join(', ');

    return {
      ...student,
      portalName: portalData.studentName || '',
      rollNoMismatch: false,
      status: 'PAID',
      receiptIds,
      dates,
      amounts,
      payments: matchingPayments,
    };

  } catch (err) {
    onLog(`Error: ${err.message}`);
    try { await page.close(); } catch (_) {}
    return { ...student, status: 'ERROR', error: err.message };
  }
}

// ─── BUILD PAYMENT EXCEL (3 Sheets) ───
async function buildPaymentExcel(results, targetMonth, targetYear, sheetLink) {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'RAW — Results Automation Website';

    const monthName = MONTH_NAMES[parseInt(targetMonth) - 1] || targetMonth;
    const headerStyle = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };

    const colDefs = [
      { header: 'SNO',                  key: 'sno',       width: 6  },
      { header: 'ROOM NO',              key: 'roomNo',    width: 10 },
      { header: 'ROLL NO',              key: 'rollNo',    width: 16 },
      { header: 'NAME OF THE STUDENT',  key: 'name',      width: 42 },
      { header: 'RECIEPT ID',           key: 'receiptId', width: 22 },
      { header: 'DATE',                 key: 'date',      width: 14 },
      { header: 'PAID',                 key: 'paid',      width: 8  },
      { header: 'AMOUNT',               key: 'amount',    width: 12 },
      { header: 'REMARKS',              key: 'remarks',   width: 18 },
      { header: 'YEAR',                 key: 'year',      width: 8  },
    ];

    function getRowColor(status) {
      if (status === 'PAID') return 'FFC6EFCE';       // light green
      if (status === 'NOT_PAID') return 'FFFFC7CE';    // light red
      if (status === 'MISMATCH') return 'FFFFCCFF';    // light purple
      return 'FFFFF2CC';                                // light yellow for errors
    }

    function getRemarks(r) {
      if (r.status === 'PAID') return 'DONE';
      if (r.status === 'NOT_PAID') return 'NOT PAID';
      if (r.status === 'MISMATCH') return `⚠️ MISMATCH: ${r.error || 'Roll No mismatch'}`;
      return r.error || 'ERROR';
    }

    function addStyledRow(ws, r, i) {
      const isPaid = r.status === 'PAID';
      const row = ws.addRow({
        sno: r.sno || (i + 1),
        roomNo: r.roomNo || '',
        rollNo: r.rollNo,
        name: r.name || r.portalName || '',
        receiptId: r.receiptIds || '',
        date: r.dates || '',
        paid: isPaid ? 'PAID' : '',
        amount: r.amounts || '',
        remarks: getRemarks(r),
        year: targetYear,
      });
      const bgColor = getRowColor(r.status);
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.border = thinBorder;
      });
      if (isPaid) {
        row.getCell('paid').font = { bold: true, color: { argb: 'FF276221' } };
        row.getCell('remarks').font = { bold: true, color: { argb: 'FF276221' } };
      } else if (r.status === 'NOT_PAID') {
        row.getCell('remarks').font = { bold: true, color: { argb: 'FF9C0006' } };
      } else if (r.status === 'MISMATCH') {
        row.getCell('remarks').font = { bold: true, color: { argb: 'FF7030A0' } };
      }
      return row;
    }

    function styleSheetHeader(ws) {
      const hRow = ws.getRow(1);
      hRow.font = headerStyle;
      hRow.fill = headerFill;
      hRow.alignment = { vertical: 'middle', horizontal: 'center' };
      hRow.height = 22;
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // ══════════════════════════════════════════
    //  SHEET 1 — All Data (Normal / Present)
    // ══════════════════════════════════════════
    const ws1 = wb.addWorksheet(`Mess Bill ${monthName} ${targetYear}`);
    ws1.columns = colDefs;
    styleSheetHeader(ws1);
    results.forEach((r, i) => addStyledRow(ws1, r, i));

    // ══════════════════════════════════════════
    //  SHEET 2 — Separated (Paid / Not Paid / Error+Mismatch)
    // ══════════════════════════════════════════
    const ws2 = wb.addWorksheet('Paid - NotPaid - Errors');
    ws2.columns = colDefs;
    styleSheetHeader(ws2);

    const paid = results.filter(r => r.status === 'PAID');
    const notPaid = results.filter(r => r.status === 'NOT_PAID');
    const errorsAndMismatch = results.filter(r => r.status === 'ERROR' || r.status === 'MISMATCH');

    // Section: PAID
    if (paid.length) {
      const secRow = ws2.addRow({ sno: '', roomNo: '', rollNo: `═══ PAID (${paid.length}) ═══` });
      secRow.font = { bold: true, size: 12, color: { argb: 'FF276221' } };
      secRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      paid.forEach((r, i) => addStyledRow(ws2, r, i));
    }

    // Section: NOT PAID
    if (notPaid.length) {
      const secRow = ws2.addRow({ sno: '', roomNo: '', rollNo: `═══ NOT PAID (${notPaid.length}) ═══` });
      secRow.font = { bold: true, size: 12, color: { argb: 'FF9C0006' } };
      secRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
      notPaid.forEach((r, i) => addStyledRow(ws2, r, i));
    }

    // Section: ERRORS & MISMATCHES
    if (errorsAndMismatch.length) {
      const secRow = ws2.addRow({ sno: '', roomNo: '', rollNo: `═══ ERRORS / MISMATCHES (${errorsAndMismatch.length}) ═══` });
      secRow.font = { bold: true, size: 12, color: { argb: 'FFB45309' } };
      secRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
      errorsAndMismatch.forEach((r, i) => addStyledRow(ws2, r, i));
    }

    // Summary at the bottom of Sheet 2
    ws2.addRow({});
    const sumRow1 = ws2.addRow({ sno: 'SUMMARY', rollNo: `Total: ${results.length}`, name: `Paid: ${paid.length}`, receiptId: `Not Paid: ${notPaid.length}`, date: `Errors: ${errorsAndMismatch.length}` });
    sumRow1.font = { bold: true, size: 11 };
    sumRow1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };

    // ══════════════════════════════════════════
    //  SHEET 3 — Linked Sheet (Paid Only Fill)
    // ══════════════════════════════════════════
    const ws3 = wb.addWorksheet('Sheet - Paid Fill');
    ws3.columns = colDefs;
    styleSheetHeader(ws3);

    // Build a lookup of paid students by roll number
    const paidMap = new Map();
    paid.forEach(r => {
      const key = r.rollNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      paidMap.set(key, r);
    });

    // For each student in results, if they exist in the linked sheet's roll numbers,
    // fill their data if paid, otherwise leave blank fields
    results.forEach((r, i) => {
      const key = r.rollNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const paidResult = paidMap.get(key);
      if (paidResult) {
        // Fill with paid data
        addStyledRow(ws3, paidResult, i);
      } else {
        // Add row with only roll number and name (no payment data)
        const row = ws3.addRow({
          sno: r.sno || (i + 1),
          roomNo: r.roomNo || '',
          rollNo: r.rollNo,
          name: r.name || r.portalName || '',
          receiptId: '',
          date: '',
          paid: '',
          amount: '',
          remarks: '',
          year: targetYear,
        });
        row.eachCell(cell => {
          cell.alignment = { wrapText: true, vertical: 'top' };
          cell.border = thinBorder;
        });
      }
    });

    // ── Save file ──
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `MessBill_${monthName}_${targetYear}_${timestamp}.xlsx`);
    await wb.xlsx.writeFile(outPath);
    return outPath;
  } catch (ex) {
    console.error('❌ Payment Excel Build Error:', ex);
    return null;
  }
}

// ─── MAIN RUNNER ───
async function runPaymentScraper(options = {}) {
  const {
    students = [],
    targetMonth = '',
    targetYear = '',
    pauseControl = { paused: false },
    onProgress = () => {},
    onStudentDone = () => {},
    onLog = () => {},
    onComplete = () => {},
  } = options;

  const total = students.length;
  const startTime = Date.now();
  const results = [];
  let completed = options.startIndex || 0;

  onProgress({ phase: 'launching', message: 'Launching Cloud Browser...', current: completed, total, percentage: total > 0 ? Math.round((completed/total)*100) : 0 });

  // ── Launch browser ──
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  let browser;

  if (isProd) {
    onLog('🚀 Production Mode: Launching Puppeteer...');
    try {
      const fullPuppeteer = require('puppeteer');
      const { ensureChrome } = require('../utils/ensure-chrome');

      let executablePath = global.__CHROME_PATH || null;
      
      if (!executablePath || !require('fs').existsSync(executablePath)) {
        onLog('⚠️ Global Chrome path not set or invalid, ensuring Chrome is installed...');
        try {
          executablePath = await ensureChrome();
          global.__CHROME_PATH = executablePath;
          onLog(`✅ Chrome ready at: ${executablePath}`);
        } catch (installErr) {
          onLog(`❌ Chrome setup failed: ${installErr.message}`);
          throw new Error('Chrome could not be found or installed. Try redeploying with "Clear build cache & deploy" on Render.');
        }
      } else {
        onLog(`📍 Using globally cached Chrome path: ${executablePath}`);
      }
      const chromium = require('@sparticuz/chromium-min');
      browser = await fullPuppeteer.launch({
        executablePath,
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
      onLog('✅ Browser launched successfully');
    } catch (launchErr) {
      onLog(`❌ Browser launch failed: ${launchErr.message}`);
      throw launchErr;
    }
  } else {
    onLog('🏠 Local Mode: Launching browser...');
    const localChromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.CHROME_PATH,
    ].filter(Boolean);

    let executablePath;
    for (const p of localChromePaths) {
      try { if (fs.existsSync(p)) { executablePath = p; break; } } catch {}
    }

    const launchOptions = {
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
      defaultViewport: { width: 1280, height: 900 },
    };
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await puppeteer.launch(launchOptions);
  }

  // ── Process each student ──
  for (let i = options.startIndex || 0; i < students.length; i++) {
    while (pauseControl.paused) {
      onProgress({ phase: 'paused', current: completed, total });
      await DELAY(1000);
    }

    const student = students[i];
    onProgress({
      phase: 'running', current: completed, total,
      percentage: Math.round((completed / total) * 100),
      currentStudent: { rollNo: student.rollNo, name: student.name, index: i }
    });

    const result = await scrapeStudentPayment(browser, student, targetMonth, targetYear, (msg) => onLog(`[${student.rollNo}] ${msg}`));
    results.push(result);
    completed++;

    // Compute ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const avgSec = elapsed / (completed - (options.startIndex || 0));
    const remaining = Math.round(avgSec * (total - completed));
    const etaStr = remaining > 0
      ? (remaining >= 60 ? `${Math.floor(remaining/60)}m ${remaining%60}s` : `${remaining}s`)
      : '—';

    await onStudentDone(result, i);
    onProgress({
      phase: 'running', current: completed, total,
      percentage: Math.round((completed / total) * 90),
      eta: etaStr,
      currentStudent: { rollNo: student.rollNo, name: student.name || '', index: i },
    });
  }

  await browser.close();
  onProgress({ phase: 'generating', message: 'Building Excel...', current: total, total, percentage: 95 });

  const excelPath = await buildPaymentExcel(results, targetMonth, targetYear);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  const summary = {
    total,
    paid: results.filter(r => r.status === 'PAID').length,
    notPaid: results.filter(r => r.status === 'NOT_PAID').length,
    errors: results.filter(r => r.status === 'ERROR').length,
    mismatches: results.filter(r => r.rollNoMismatch).length,
    elapsed: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    excelPath,
    results
  };

  onComplete(summary);
  return summary;
}

module.exports = { runPaymentScraper, buildPaymentExcel };
