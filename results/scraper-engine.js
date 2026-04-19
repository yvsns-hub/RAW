const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium-min');
const ExcelJS   = require('exceljs');
const path      = require('path');
const fs        = require('fs');

// ─── CONSTANTS & DEFAULTS ───
const DEFAULT_PORTAL = {
  loginUrl: 'https://www.kietgroup.info/Account/Login',
  marksheetUrl: 'https://www.kietgroup.info/Student/MarkSheet.aspx',
  logoutUrl: 'https://www.kietgroup.info/Account/Logout.aspx',
  selectors: {
    username: '#MainContent_UserName',
    password: '#MainContent_Password',
    submit: 'input[type="submit"]',
  }
};
const DELAY = ms => new Promise(r => setTimeout(r, ms));
const FAIL_GRADES = new Set(['F', 'AB', 'ABSENT', 'W']);

// ─── SCRAPE ONE STUDENT ───
async function scrapeStudent(browser, student, portalConfig, onLog) {
  const page = await browser.newPage();
  
  // ── Block unnecessary resources to save RAM and speed up ──
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Set lower navigation timeout for Render's 512MB RAM environment
  page.setDefaultNavigationTimeout(45000);

  try {
    // ── Step 1: Login ──
    onLog(`Navigating to login page...`);
    await page.goto(portalConfig.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await DELAY(500);

    // Auto-detect username/password selectors
    const formInfo = await page.evaluate((cfgUser, cfgPass) => {
      let userEl = cfgUser ? document.querySelector(cfgUser) : null;
      let passEl = cfgPass ? document.querySelector(cfgPass) : null;

      if (!userEl) {
        const candidates = ['input[type="text"]','input[type="email"]','input[name*="user" i]','input[name*="roll" i]'];
        for (const sel of candidates) { userEl = document.querySelector(sel); if (userEl) break; }
      }
      if (!passEl) {
        passEl = document.querySelector('input[type="password"]');
      }

      return {
        userSel: userEl ? (userEl.id ? `#${userEl.id}` : userEl.name ? `[name="${userEl.name}"]` : 'input[type="text"]') : null,
        passSel: passEl ? (passEl.id ? `#${passEl.id}` : passEl.name ? `[name="${passEl.name}"]` : 'input[type="password"]') : null,
      };
    }, portalConfig.selectors.username, portalConfig.selectors.password);

    if (!formInfo.userSel || !formInfo.passSel) {
      await page.close();
      return { ...student, status: 'ERROR', error: `Login form not found.` };
    }

    const loginPassword = portalConfig.defaultPassword || student.rollNo;

    // Fill fields
    const filled = await page.evaluate((userSel, passSel, username, password) => {
      const userEl = document.querySelector(userSel);
      const passEl = document.querySelector(passSel);
      if (!userEl || !passEl) return { ok: false };

      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(userEl, username);
      userEl.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInputSetter.call(passEl, password);
      passEl.dispatchEvent(new Event('input', { bubbles: true }));

      return { ok: true, userVal: userEl.value };
    }, formInfo.userSel, formInfo.passSel, student.rollNo, loginPassword);

    if (!filled.ok) {
       await page.close();
       return { ...student, status: 'ERROR', error: 'Form fill failed' };
    }

    onLog(`Logging in as ${filled.userVal}...`);
    
    const submitSel = await page.evaluate((cfgSub) => {
      const candidates = [cfgSub, 'input[type="submit"]', 'button[type="submit"]', 'button'];
      for (const sel of candidates) {
        if (sel && document.querySelector(sel)) return sel;
      }
      return null;
    }, portalConfig.selectors.submit);

    if (!submitSel) {
      await page.close();
      return { ...student, status: 'ERROR', error: 'Submit button not found' };
    }

    await page.click(submitSel);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    
    // Check login success
    if (page.url().toLowerCase().includes('login')) {
      await page.close();
      return { ...student, status: 'CREDENTIAL_MISMATCH', error: 'Login failed' };
    }

    onLog(`✅ Logged in! Fetching marksheet...`);

    // ── Step 2: Auto-fetch name ──
    const profileName = await page.evaluate(() => {
      const nameSelectors = ['#lblStudentName', '#lblName', '.student-name', '.user-name'];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 2) return el.innerText.trim();
      }
      return '';
    });
    if (profileName && (!student.name || student.name === student.rollNo)) {
      student.name = profileName;
    }

    // ── Step 3: Go to MarkSheet ──
    await page.goto(portalConfig.marksheetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => document.body && document.body.innerText.length > 200, { timeout: 8000 }).catch(() => {});

    // ── Step 4: Extract result data ──
    const data = await page.evaluate(() => {
      const result = { sgpa: '', cgpa: '', percentage: '', totalCredits: '', subjects: [] };
      const bodyText = document.body.innerText;

      const sgpaMatch = bodyText.match(/SGPA[\s\t:]*([0-9.]+)/i);
      if (sgpaMatch) result.sgpa = sgpaMatch[1];

      const cgpaMatch = bodyText.match(/CGPA\)[\s\n\t]*([0-9.]+)/i) || bodyText.match(/CGPA[\s\t:]*([0-9.]+)/i);
      if (cgpaMatch) result.cgpa = cgpaMatch[1];

      const pctMatch = bodyText.match(/Equivalent Percentage[\s\n\t]*([0-9.]+)/i);
      if (pctMatch) result.percentage = pctMatch[1];

      const credMatch = bodyText.match(/Total Credits[\s\n\t]*([0-9.]+)/i);
      if (credMatch) result.totalCredits = credMatch[1];

      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;
        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.innerText.trim().toLowerCase());
        if (!headers.some(h => h.includes('subject'))) return;

        rows.slice(1).forEach(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 5) return;
          result.subjects.push({
            code: cells[1]||'', name: cells[2]||'', grade: cells[5]||'', credits: cells[6]||''
          });
        });
      });
      return result;
    });

    const passed = [], backlogs = [];
    data.subjects.forEach(sub => {
      const grade = (sub.grade || '').trim().toUpperCase();
      if (!sub.name) return;
      if (FAIL_GRADES.has(grade) || grade === 'F') backlogs.push(sub);
      else if (grade) passed.push(sub);
    });

    onLog(`SGPA: ${data.sgpa} | Backlogs: ${backlogs.length}`);

    await page.close();
    return {
      ...student,
      status: 'SUCCESS',
      sgpa: data.sgpa || 'N/A',
      cgpa: data.cgpa || 'N/A',
      percentage: data.percentage || 'N/A',
      totalCredits: data.totalCredits || 'N/A',
      subjects: data.subjects,
      passed,
      backlogs,
    };

  } catch (err) {
    onLog(`Error: ${err.message}`);
    try { await page.close(); } catch (_) {}
    return { ...student, status: 'ERROR', error: err.message };
  }
}

// ─── BUILD EXCEL ───
async function buildExcel(results) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('Summary');
    ws1.columns = [
      { header: 'S.No', key: 'sno', width: 6 },
      { header: 'Roll Number', key: 'rollNo', width: 18 },
      { header: 'Student Name', key: 'name', width: 40 },
      { header: 'SGPA', key: 'sgpa', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Backlogs', key: 'bkCount', width: 10 },
      { header: 'Backlog List', key: 'bkSubs', width: 50 },
    ];
    
    results.forEach((r, i) => {
      ws1.addRow({
        sno: i+1, rollNo: r.rollNo, name: r.name,
        sgpa: r.sgpa, status: r.status,
        bkCount: r.backlogs ? r.backlogs.length : 0,
        bkSubs: (r.backlogs && Array.isArray(r.backlogs)) ? r.backlogs.map(s => s.name).join(', ') : ''
      });
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = path.join(__dirname, '..', 'output');
    const fs = require('fs');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `Results_${timestamp}.xlsx`);
    await wb.xlsx.writeFile(outPath);
    return outPath;
  } catch (ex) {
    console.error('❌ Excel Build Error:', ex);
    return null;
  }
}

// ─── MAIN RUNNER ───
async function runScraper(options = {}) {
  const {
    portal = DEFAULT_PORTAL,
    students = [],
    headless = true,
    pauseControl = { paused: false },
    onProgress = () => {},
    onStudentDone = () => {},
    onLog = () => {},
    onComplete = () => {},
  } = options;

  const total = students.length;
  const startTime = Date.now();
  const results = [];
  let completed = 0;

  onProgress({ phase: 'launching', message: 'Launching Cloud Browser...', current: 0, total, percentage: 0 });

  // ── Render/Production Config ──
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  let browser;

  if (isProd) {
    onLog('🚀 Production Mode: Attempting @sparticuz/chromium');
    try {
      const executablePath = await chromium.executablePath();
      onLog(`📍 Chrome path: ${executablePath}`);
      browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-sandbox',
          '--no-zygote',
          '--single-process',
          '--disable-extensions',
          '--mute-audio',
        ],
        defaultViewport: { width: 1024, height: 768 },
        executablePath,
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
      onLog('✅ Browser launched successfully with Sparticuz');
    } catch (launchErr) {
      onLog(`⚠️ Sparticuz failed: ${launchErr.message}. Falling back to standard Puppeteer...`);
      try {
        const fullPuppeteer = require('puppeteer');
        browser = await fullPuppeteer.launch({
          args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-sandbox',
            '--single-process',
          ],
          defaultViewport: { width: 1024, height: 768 },
          headless: 'new',
          ignoreHTTPSErrors: true,
        });
        onLog('✅ Browser launched with standard Puppeteer fallback');
      } catch (fallbackErr) {
        onLog(`❌ Final fallback failed: ${fallbackErr.message}`);
        throw fallbackErr;
      }
    }
  } else {
    onLog('🏠 Local Mode: Launching browser...');
    // Try to find a local Chrome installation
    const localChromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.CHROME_PATH, // allow override via env var
    ].filter(Boolean);

    let executablePath;
    for (const p of localChromePaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(p)) { executablePath = p; break; }
      } catch {}
    }

    const launchOptions = {
      headless: headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    };
    if (executablePath) launchOptions.executablePath = executablePath;

    browser = await puppeteer.launch(launchOptions);
  }

  for (let i = 0; i < students.length; i++) {
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

    const result = await scrapeStudent(browser, student, portal, (msg) => onLog(`[${student.rollNo}] ${msg}`));
    results.push(result);
    completed++;

    await onStudentDone(result, i);
  }

  await browser.close();
  onProgress({ phase: 'generating', message: 'Building Excel...', current: total, total, percentage: 95 });
  
  const excelPath = await buildExcel(results);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  const summary = {
    total,
    success: results.filter(r => r.status === 'SUCCESS').length,
    fullPass: results.filter(r => r.status === 'SUCCESS' && (!r.backlogs || r.backlogs.length === 0)).length,
    backlogs: results.filter(r => r.status === 'SUCCESS' && r.backlogs?.length > 0).length,
    mismatch: results.filter(r => r.status === 'CREDENTIAL_MISMATCH').length,
    errors: results.filter(r => r.status === 'ERROR' || r.status === 'CREDENTIAL_MISMATCH').length,
    elapsed: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    excelPath,
    results
  };

  onComplete(summary);
  return summary;
}

module.exports = { runScraper };
