const puppeteer = require('puppeteer');
const ExcelJS   = require('exceljs');
const path      = require('path');
const fs        = require('fs');

// ════════════════════════════════════════════════════════
//  CONSTANTS & DEFAULTS
// ════════════════════════════════════════════════════════
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
const DELAY         = ms => new Promise(r => setTimeout(r, ms));

// Grade mapping: F = fail, everything else = pass
const FAIL_GRADES = new Set(['F', 'AB', 'ABSENT', 'W']);

// ════════════════════════════════════════════════════════
//  DEFAULT STUDENTS LIST
// ════════════════════════════════════════════════════════
const DEFAULT_STUDENTS = [
  // ── 256Q1A4xxx Series ──
  { rollNo: '256Q1A4234', name: 'MANTENA VENKATA ESWANTH VARMA' },
  { rollNo: '256Q1A4235', name: 'JAMMULA RAGHURAM' },
  { rollNo: '256Q1A4236', name: 'RAMIREDDY DHANUSH KUMAR' },
  { rollNo: '256Q1A4237', name: 'CHITTEMREDDY SURENDRA REDDY' },
  { rollNo: '256Q1A4238', name: 'GUMMADIDALA ARAVIND' },
  { rollNo: '256Q1A4239', name: 'BORRA BALAJI' },
  { rollNo: '256Q1A4240', name: 'KOTHAPALLI KARTHIK' },
  { rollNo: '256Q1A4241', name: 'SANNAMURI VENKATA NAGA KALYAN' },
  { rollNo: '256Q1A4242', name: 'KOTHAMASU ANITH KUMAR' },
  { rollNo: '256Q1A4244', name: 'BANDI VENKAT RAO' },
  { rollNo: '256Q1A4245', name: 'DASARI NAVADEEP NANDU' },
  { rollNo: '256Q1A4246', name: 'KARNENI GUNA SEKHAR VEERA CHAITANYA' },
  { rollNo: '256Q1A4247', name: 'VEERANALA THRIMURTHULA SWAMY' },
  { rollNo: '256Q1A4248', name: 'POTLA ROHITH' },
  { rollNo: '256Q1A4249', name: 'DUDAKA LINITH KUMAR' },
  { rollNo: '256Q1A4250', name: 'VEERAVALLI VINEEL' },
  { rollNo: '256Q1A4251', name: 'ANNAMDEVARA RAMU' },
  { rollNo: '256Q1A4252', name: 'CHALAMALA KESAVA SANTHOSH' },
  { rollNo: '256Q1A4253', name: 'KALLI MAHESH REDDY' },
  { rollNo: '256Q1A4254', name: 'NAKKA TARUN NANI' },
  { rollNo: '256Q1A4255', name: 'CHABANDI SRAVANI' },
  { rollNo: '256Q1A4256', name: 'CHABANDI SRAVANI (2)' },
  { rollNo: '256Q1A4257', name: 'VENNA VISHNU GANESH REDDY' },
  { rollNo: '256Q1A4258', name: 'KATRU DUSHYANTH' },

  // ── 25B21A4xxx Series ──
  { rollNo: '25B21A4279', name: 'BONU KARTHIK' },
  { rollNo: '25B21A4280', name: 'VASUPALLI APPALARAJU' },
  { rollNo: '25B21A4281', name: 'SHAIK ROOHUL BASHEERUL SHABBEER' },
  { rollNo: '25B21A4282', name: 'BELLA UDAY SAI RAM' },
  { rollNo: '25B21A4283', name: 'YARRABOLU VENKATA SATYA NARAYANA SWAMY' },
  { rollNo: '25B21A4284', name: 'MANDA AJAY' },
  { rollNo: '25B21A4285', name: 'BALUEPALLI VENKATA ABHISHEK' },
  { rollNo: '25B21A42F3', name: 'GANDHAM HEMANTH' },
  { rollNo: '25B21A4287', name: 'KETHA DINESH KUMAR' },
  { rollNo: '25B21A4288', name: 'PENUGONDA MUKESH KUMAR' },
  { rollNo: '25B21A4289', name: 'MANUKONDA MOHAN KISHORE' },
  { rollNo: '25B21A4290', name: 'MOLLETI BALACHANDRA KISHORE' },
  { rollNo: '25B21A4291', name: 'CHINTAPALLI STALIN' },
  { rollNo: '25B21A4292', name: 'PAILA CHARAN' },
  { rollNo: '25B21A4293', name: 'YARRAMALLA SHANMUK VINAY' },
  { rollNo: '25B21A4294', name: 'DAKAMARI VIVEK' },
  { rollNo: '25B21A4295', name: 'THANNEERU VENKATA SAI' },
  { rollNo: '25B21A4296', name: 'KARUMURI SRIVINAY' },
  { rollNo: '25B21A4297', name: 'YALAMANCHILI LOHITH NAGA GOPI' },
  { rollNo: '25B21A4299', name: 'JINIGI HARSHA VARDHAN' },
  { rollNo: '25B21A42A0', name: 'KANNEDARI UDAY' },
  { rollNo: '25B21A42A1', name: 'KONDRU ISSAK' },
  { rollNo: '25B21A42E3', name: 'PALLEPOGU SANJAY' },
  { rollNo: '25B21A42A2', name: 'CHITTURI HARISH BABU' },
  { rollNo: '25B21A42A5', name: 'KUNIBILLI RAKESH' },
  { rollNo: '25B21A42A7', name: 'CHIGURUBATHULA VINAY KUMAR' },
  { rollNo: '25B21A42A8', name: 'RANGALA PAVAN KUMAR' },
  { rollNo: '25B21A42A9', name: 'CHERUVURALLI BHANU KIRAN' },
  { rollNo: '25B21A42B1', name: 'PALLA YASVANTH' },
  { rollNo: '25B21A42B2', name: 'KODAVALI MOHAN KRISHNA' },
  { rollNo: '25B21A42B3', name: 'DWARAPUREDDI CHARAN' },
  { rollNo: '25B21A42B7', name: 'SHAIK MAHAMMAD SAMEER' },
  { rollNo: '25B21A42B8', name: 'CHELLE HARSHA KUMAR' },
  { rollNo: '25B21A42B9', name: 'MORU VAMSI' },
  { rollNo: '25B21A42C0', name: 'NATTA AKHIL BABU' },
  { rollNo: '25B21A42D5', name: 'ANDLURI SEVENDRA KUMAR' },
  { rollNo: '25B21A42D6', name: 'ADDANKI GOPI KRISHNA' },
  { rollNo: '25B21A42D7', name: 'TELU SAITEJA' },
  { rollNo: '25B21A42F2', name: 'NARENDRA SATISH MUDDALA' },
  { rollNo: '25B21A42D8', name: 'KANCHARLA RAJA RATNAM' },
  { rollNo: '25B21A42E1', name: 'MARISETTI VENKETESWAR SAI SURENDRA' },
  { rollNo: '25B21A42E5', name: 'VARIMADUGU ANISHKUMAR REDDY' },
  { rollNo: '25B21A42F4', name: 'BALAGAM MONISH VARMA' },
  { rollNo: '25B21A42F5', name: 'AMARA BHASHINI' },
  { rollNo: '25B21A42A4', name: 'BODDU NIHARIKA' },
  { rollNo: '25B21A42A6', name: 'BONTHU YANA' },
  { rollNo: '25B21A42B0', name: 'CHALLA SHARMILA' },
  { rollNo: '25B21A42B4', name: 'KAPARAPU MANIKANTESWARI' },
  { rollNo: '25B21A42B5', name: 'CHALLA DHARSHINI' },
  { rollNo: '25B21A42B6', name: 'BOTTA RAGINI' },
  { rollNo: '25B21A42C1', name: 'NARALASETTY GANGA BHAVANI' },
  { rollNo: '25B21A42C2', name: 'SIRAPARAPU HASINI LAKSHMI DURGA' },
  { rollNo: '25B21A42C3', name: 'MAJJI RUTHVIKA SWATHI' },
  { rollNo: '25B21A42C4', name: 'MIRAMPALLI HARSHITHA' },
  { rollNo: '25B21A42C5', name: 'MAGAM TEJA SRI' },
  { rollNo: '25B21A42C6', name: 'PULIPATI SAHITHI PRIYA' },
  { rollNo: '25B21A42C7', name: 'KAVURI SUHITHA' },
  { rollNo: '25B21A42C8', name: 'CHITTALA TEJASWI' },
  { rollNo: '25B21A42C9', name: 'KOLLABATHULA JESSI' },
  { rollNo: '25B21A42D0', name: 'BOMMIDI JAYA SRI' },
  { rollNo: '25B21A42D1', name: 'MATTA JAYALAXMI' },
  { rollNo: '25B21A42D2', name: 'PALLETI MOULIKA' },
  { rollNo: '25B21A42D3', name: 'NARTHU AMULYA' },
  { rollNo: '25B21A42D4', name: 'PATAN SAMEENA' },
  { rollNo: '25B21A42D9', name: 'KARNI DHARANI' },
  { rollNo: '25B21A42E0', name: 'SAKALABHAKTULA SOWKYA' },
  { rollNo: '25B21A42F7', name: 'RONGALI JYOTSNA' },
];

// ════════════════════════════════════════════════════════
//  SCRAPE ONE STUDENT
// ════════════════════════════════════════════════════════
async function scrapeStudent(browser, student, portalConfig, onLog) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  try {
    // ── Step 1: Login ──
    onLog(`Navigating to login page...`);
    await page.goto(portalConfig.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await DELAY(500);

    onLog(`Waiting for login form...`);

    // Auto-detect username/password selectors if configured ones don't exist
    const formInfo = await page.evaluate((cfgUser, cfgPass) => {
      const allInputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id, name: i.name, type: i.type, placeholder: i.placeholder,
        selector: i.id ? `#${i.id}` : i.name ? `[name="${i.name}"]` : i.type ? `input[type="${i.type}"]` : null
      }));

      // Try configured selectors first
      let userEl = cfgUser ? document.querySelector(cfgUser) : null;
      let passEl = cfgPass ? document.querySelector(cfgPass) : null;

      // Auto-detect username field
      if (!userEl) {
        const candidates = ['input[type="text"]','input[type="email"]','input[name*="user" i]','input[name*="roll" i]','input[id*="user" i]','input[id*="roll" i]','input[id*="User"]','input[name*="User"]'];
        for (const sel of candidates) { userEl = document.querySelector(sel); if (userEl) break; }
      }
      // Auto-detect password field
      if (!passEl) {
        passEl = document.querySelector('input[type="password"]');
      }

      return {
        userSel: userEl ? (userEl.id ? `#${userEl.id}` : userEl.name ? `[name="${userEl.name}"]` : 'input[type="text"]') : null,
        passSel: passEl ? (passEl.id ? `#${passEl.id}` : passEl.name ? `[name="${passEl.name}"]` : 'input[type="password"]') : null,
        allInputs,
      };
    }, portalConfig.selectors.username, portalConfig.selectors.password);

    if (!formInfo.userSel || !formInfo.passSel) {
      const inputList = formInfo.allInputs.map(i => `${i.type}#${i.id}[${i.name}]`).join(', ');
      onLog(`❌ Cannot find login fields. Page inputs: ${inputList || 'none'}`);
      await page.close();
      return { ...student, status: 'ERROR', sgpa: '', cgpa: '', percentage: '', totalCredits: '', subjects: [], backlogs: [], passed: [], error: `Login form not found. Inputs on page: ${inputList}` };
    }

    if (formInfo.userSel !== portalConfig.selectors.username) {
      onLog(`ℹ Auto-detected login field: ${formInfo.userSel} (configured selector "${portalConfig.selectors.username}" not found — update Portal settings to fix this)`);
    }

    // Password to use
    const loginPassword = portalConfig.defaultPassword || student.rollNo;

    // Fill fields using page.evaluate (bypasses focus/click issues)
    const filled = await page.evaluate((userSel, passSel, username, password) => {
      const userEl = document.querySelector(userSel);
      const passEl = document.querySelector(passSel);
      if (!userEl || !passEl) return { ok: false, reason: `Fields not found after detection: ${userSel}, ${passSel}` };

      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(userEl, username);
      userEl.dispatchEvent(new Event('input', { bubbles: true }));
      userEl.dispatchEvent(new Event('change', { bubbles: true }));

      nativeInputSetter.call(passEl, password);
      passEl.dispatchEvent(new Event('input', { bubbles: true }));
      passEl.dispatchEvent(new Event('change', { bubbles: true }));

      return { ok: true, userVal: userEl.value, passLen: passEl.value.length };
    }, formInfo.userSel, formInfo.passSel, student.rollNo, loginPassword);

    if (!filled.ok) {
      onLog(`❌ Form fill failed: ${filled.reason}`);
      await page.close();
      return { ...student, status: 'ERROR', sgpa: '', cgpa: '', percentage: '', totalCredits: '', subjects: [], backlogs: [], passed: [], error: filled.reason };
    }

    onLog(`Logging in as ${filled.userVal} (pwd length: ${filled.passLen})...`);
    await DELAY(300);

    // Find and click the submit button
    const submitSel = await page.evaluate((cfgSub) => {
      const candidates = [cfgSub, 'input[type="submit"]', 'button[type="submit"]', 'button.btn-primary', 'button.login-btn', 'input[value*="Login" i]', 'button'];
      for (const sel of candidates) {
        if (!sel) continue;
        const el = document.querySelector(sel);
        if (el) return sel;
      }
      return null;
    }, portalConfig.selectors.submit);

    if (!submitSel) {
      onLog(`❌ Submit button not found`);
      await page.close();
      return { ...student, status: 'ERROR', sgpa: '', cgpa: '', percentage: '', totalCredits: '', subjects: [], backlogs: [], passed: [], error: 'Submit button not found' };
    }


    // Click submit and wait for navigation
    onLog(`Clicking submit: ${submitSel}`);
    await page.click(submitSel);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await DELAY(300);

    // Check login success
    const afterUrl = page.url();
    onLog(`After login URL: ${afterUrl}`);

    if (afterUrl.toLowerCase().includes('login') || afterUrl.toLowerCase().includes('/account/login')) {
      const errText = await page.evaluate(() => {
        const selectors = [
          '#MainContent_FailureText',
          '.validation-summary-errors',
          '.field-validation-error',
          '.alert-danger',
          '.alert',
          '[class*="error"]',
          '[class*="fail"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim()) return el.innerText.trim();
        }
        return 'Login failed — credentials may be wrong or portal is down';
      });
      onLog(`❌ Login failed: ${errText}`);
      await page.close();
      return {
        ...student,
        status: 'CREDENTIAL_MISMATCH',
        sgpa: '', cgpa: '', percentage: '', totalCredits: '',
        subjects: [], backlogs: [], passed: [],
        error: errText
      };
    }

    onLog(`✅ Logged in! Fetching marksheet...`);

    // ── Step 2: Auto-fetch name from landing page ──
    const profileName = await page.evaluate(() => {
      const nameSelectors = [
        '#lblStudentName', '#lblName', '#MainContent_lblStudentName',
        '#MainContent_lblName', '[id*="StudentName"]', '[id*="lblName"]',
        '.student-name', '.user-name', '.profile-name',
      ];
      for (const sel of nameSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim().length > 2) return el.innerText.trim();
        } catch(e) {}
      }
      // Fallback: look for all-caps name pattern
      const spans = Array.from(document.querySelectorAll('span, td, label, h4, h5'));
      for (const el of spans) {
        const txt = el.innerText?.trim() || '';
        if (txt.match(/^[A-Z][A-Z\s]{5,50}$/) || txt.match(/Welcome[,\s]+([A-Z][a-zA-Z\s]+)/i)) {
          const m = txt.match(/Welcome[,\s]+(.+)/i);
          return m ? m[1].trim() : txt;
        }
      }
      return '';
    });

    if (profileName && (!student.name || student.name === student.rollNo)) {
      student.name = profileName;
      onLog(`📛 Name: ${profileName}`);
    }

    // ── Step 3: Go to MarkSheet ──
    await page.goto(portalConfig.marksheetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for actual content instead of fixed delay
    await page.waitForFunction(() => document.body && document.body.innerText.length > 200, { timeout: 8000 }).catch(() => {});

    // ── Step 3: Extract result data ──
    onLog(`Extracting result data...`);
    const data = await page.evaluate(() => {
      const result = {
        sgpa: '', cgpa: '', percentage: '', totalCredits: '',
        subjects: []
      };

      const bodyText = document.body.innerText;

      const sgpaMatch = bodyText.match(/SGPA[\s\t:]*([0-9.]+)/i);
      if (sgpaMatch) result.sgpa = sgpaMatch[1];

      const cgpaMatch = bodyText.match(/CGPA\)[\s\n\t]*([0-9.]+)/i) ||
                        bodyText.match(/Average\(CGPA\)[\s\S]*?\n([0-9.]+)/i) ||
                        bodyText.match(/CGPA[\s\t:]*([0-9.]+)/i);
      if (cgpaMatch) result.cgpa = cgpaMatch[1];

      const pctMatch = bodyText.match(/Equivalent Percentage[\s\n\t]*([0-9.]+)/i) ||
                       bodyText.match(/Equivelent Percentage[\s\n\t]*([0-9.]+)/i);
      if (pctMatch) result.percentage = pctMatch[1];

      const credMatch = bodyText.match(/TotalCredits[\s\t]*([0-9.]+)/i) ||
                        bodyText.match(/Total Credits[\s\n\t]*([0-9.]+)/i);
      if (credMatch) result.totalCredits = credMatch[1];

      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;

        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.innerText.trim().toLowerCase());
        const hasSubject = headers.some(h => h.includes('subject') || h.includes('code'));
        if (!hasSubject) return;

        rows.slice(1).forEach(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 5) return;
          const subject = {
            sno:      cells[0] || '',
            code:     cells[1] || '',
            name:     cells[2] || '',
            type:     cells[3] || '',
            internal: cells[4] || '',
            grade:    cells[5] || '',
            credits:  cells[6] || '',
          };
          if (subject.name && !subject.name.match(/^(sgpa|total|credits|cgpa|%)/i)) {
            result.subjects.push(subject);
          }
        });
      });

      return result;
    });

    // Classify passed / backlogs
    const passed   = [];
    const backlogs = [];
    data.subjects.forEach(sub => {
      const grade = (sub.grade || '').trim().toUpperCase();
      if (!sub.name || sub.name.length < 2) return;
      if (FAIL_GRADES.has(grade) || grade === 'F') {
        backlogs.push(sub);
      } else if (grade) {
        passed.push(sub);
      }
    });

    onLog(`SGPA: ${data.sgpa} | CGPA: ${data.cgpa} | Backlogs: ${backlogs.length}`);

    // ── Step 4: Logout ──
    if (portalConfig.logoutUrl) {
      await page.goto(portalConfig.logoutUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
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
      error: ''
    };

  } catch (err) {
    onLog(`Error: ${err.message}`);
    try { await page.close(); } catch (_) {}
    return {
      ...student,
      status: 'ERROR',
      sgpa: '', cgpa: '', percentage: '', totalCredits: '',
      subjects: [], passed: [], backlogs: [],
      error: err.message
    };
  }
}

// ════════════════════════════════════════════════════════
//  BUILD EXCEL — fast, no images
// ════════════════════════════════════════════════════════
async function buildExcel(results) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RAW (Results Automation Website)';
  wb.created = new Date();

  const HDR_DARK  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
  const HDR_RED   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
  const ROW_PASS  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F5E3' } };
  const ROW_FAIL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E6' } };
  const ROW_WARN  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8CD' } };

  const applyHdr = (row, fillStyle = HDR_DARK) => {
    row.eachCell(cell => {
      cell.fill      = fillStyle;
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border    = {
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right:  { style: 'thin',   color: { argb: 'FF888888' } }
      };
    });
    row.height = 32;
  };

  const applyDataRow = (row, fillStyle, rowH = 22) => {
    row.eachCell({ includeEmpty: true }, cell => {
      if (fillStyle) cell.fill = fillStyle;
      cell.font      = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border    = {
        top:    { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right:  { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left:   { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
    });
    row.height = rowH;
  };

  // ── SHEET 1: SUMMARY ──
  const ws1 = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws1.columns = [
    { header: 'S.No',             key: 'sno',    width: 6  },
    { header: 'Roll Number',      key: 'rollNo', width: 18 },
    { header: 'Student Name',     key: 'name',   width: 55 },
    { header: 'CGPA',             key: 'sgpa',   width: 10 },
    { header: 'Equivalent %',     key: 'pct',    width: 14 },
    { header: 'Total Credits',    key: 'creds',  width: 12 },
    { header: 'Overall Status',   key: 'status', width: 14 },
    { header: 'No. of Backlogs',  key: 'bkCount',width: 14 },
    { header: 'Backlog Subjects', key: 'bkSubs', width: 70 },
    { header: 'Error / Note',     key: 'err',    width: 40 },
  ];
  applyHdr(ws1.getRow(1));

  let sno = 1;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const isSuccess  = r.status === 'SUCCESS';
    const hasBacklog = isSuccess && r.backlogs.length > 0;
    const isMismatch = r.status === 'CREDENTIAL_MISMATCH';
    const isError    = r.status === 'ERROR';

    const statusLabel = isMismatch ? 'MISMATCH'
                      : isError    ? 'ERROR'
                      : hasBacklog ? 'BACKLOG' : 'PASS';

    const bkSubsList = hasBacklog
      ? r.backlogs.map((s, idx) => `${idx + 1}. ${s.name} (${s.grade})`).join('\n') : '';

    const rowData = {
      sno, rollNo: r.rollNo, name: r.name,
      sgpa: r.sgpa || '',
      pct: r.percentage || '', creds: r.totalCredits || '',
      status: statusLabel,
      bkCount: isSuccess ? r.backlogs.length : '',
      bkSubs: bkSubsList, err: r.error || '',
    };

    const row = ws1.addRow(rowData);
    const fill = isMismatch || isError ? ROW_WARN : hasBacklog ? ROW_FAIL : ROW_PASS;
    // Dynamic row height: more backlogs = taller row for readable numbered list
    const bkLines = hasBacklog ? r.backlogs.length : 0;
    const rowHeight = bkLines > 1 ? Math.max(22, bkLines * 16 + 6) : 22;
    applyDataRow(row, fill, rowHeight);

    const sc = row.getCell('status');
    sc.font = { bold: true, size: 10, name: 'Calibri',
      color: { argb: statusLabel === 'PASS' ? 'FF27AE60'
                   : statusLabel === 'BACKLOG' ? 'FFC0392B' : 'FFE67E22' } };
    sno++;
  }

  // ── SHEET 2: BACKLOGS ──
  const ws2 = wb.addWorksheet('Backlogs', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws2.columns = [
    { header: 'Roll Number',  key: 'rollNo',  width: 18 },
    { header: 'Student Name', key: 'name',    width: 55 },
    { header: 'Sub Code',     key: 'code',    width: 14 },
    { header: 'Subject Name', key: 'subject', width: 48 },
    { header: 'Grade',        key: 'grade',   width: 10 },
    { header: 'Credits Lost', key: 'credits', width: 12 },
  ];
  applyHdr(ws2.getRow(1), HDR_RED);
  for (const r of results) {
    if (r.status !== 'SUCCESS') continue;
    r.backlogs.forEach(sub => {
      const row = ws2.addRow({ rollNo: r.rollNo, name: r.name, code: sub.code, subject: sub.name, grade: sub.grade, credits: sub.credits });
      applyDataRow(row, ROW_FAIL);
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `Results_${timestamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

// ════════════════════════════════════════════════════════
//  MAIN RUNNER — emits events via callback
// ════════════════════════════════════════════════════════
async function runScraper(options = {}) {
  const {
    portal = DEFAULT_PORTAL,
    students = DEFAULT_STUDENTS,
    headless = true,
    pauseControl = { paused: false },  // shared object for pause/resume
    onProgress = () => {},
    onStudentDone = () => {},
    onLog = () => {},
    onComplete = () => {},
  } = options;

  // Merge portal config with defaults
  const portalConfig = {
    loginUrl: portal.loginUrl || DEFAULT_PORTAL.loginUrl,
    marksheetUrl: portal.marksheetUrl || DEFAULT_PORTAL.marksheetUrl,
    logoutUrl: portal.logoutUrl || DEFAULT_PORTAL.logoutUrl,
    defaultPassword: portal.defaultPassword || '',
    selectors: {
      username: portal.selectors?.username || DEFAULT_PORTAL.selectors.username,
      password: portal.selectors?.password || DEFAULT_PORTAL.selectors.password,
      submit: portal.selectors?.submit || DEFAULT_PORTAL.selectors.submit,
    }
  };

  const total = students.length;
  const startTime = Date.now();
  const results = new Array(total);
  const timesPerStudent = [];
  let completed = 0;

  onProgress({ phase: 'launching', message: 'Launching browser...', current: 0, total, percentage: 0, eta: null });

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--start-maximized', '--disable-infobars', '--no-sandbox', '--disable-gpu'],
    defaultViewport: headless ? { width: 1366, height: 768 } : null,
  });

  onProgress({ phase: 'running', message: 'Browser ready. Processing students one by one...', current: 0, total, percentage: 0, eta: null });

  // Sequential processing with pause support
  for (let queueIdx = 0; queueIdx < students.length; queueIdx++) {
    // ── Pause check: wait while paused ──
    while (pauseControl.paused) {
      onProgress({
        phase: 'paused',
        message: `⏸ Paused at ${completed}/${total}. Resume to continue...`,
        current: completed,
        total,
        percentage: Math.round((completed / total) * 100),
        eta: '—',
        currentStudent: null,
      });
      await DELAY(1000);
    }

    const student = students[queueIdx];
    const index = queueIdx;
    const studentStart = Date.now();
    const studentLog = (msg) => onLog(`[${student.rollNo}] ${msg}`);

    onProgress({
      phase: 'running',
      message: `Processing ${student.rollNo}`,
      current: completed,
      total,
      percentage: Math.round((completed / total) * 100),
      eta: calculateETA(timesPerStudent, total - completed),
      currentStudent: { rollNo: student.rollNo, name: student.name, index },
    });

    const result = await scrapeStudent(browser, student, portalConfig, studentLog);
    results[index] = result;

    const elapsed = Date.now() - studentStart;
    timesPerStudent.push(elapsed);
    completed++;

    onStudentDone(result, index);
    onProgress({
      phase: 'running',
      message: `Done ${student.rollNo} in ${(elapsed/1000).toFixed(1)}s`,
      current: completed,
      total,
      percentage: Math.round((completed / total) * 100),
      eta: calculateETA(timesPerStudent, total - completed),
      currentStudent: null,
    });
  }

  await browser.close();

  // Build Excel
  onProgress({
    phase: 'generating',
    message: 'Generating Excel report...',
    current: total,
    total,
    percentage: 99,
    eta: '< 10s',
  });

  const excelPath = await buildExcel(results);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const success  = results.filter(r => r.status === 'SUCCESS').length;
  const bkStuds  = results.filter(r => r.status === 'SUCCESS' && r.backlogs.length > 0).length;
  const fullPass = success - bkStuds;
  const mismatch = results.filter(r => r.status === 'CREDENTIAL_MISMATCH').length;
  const errors   = results.filter(r => r.status === 'ERROR').length;

  const summary = {
    total,
    success,
    fullPass,
    backlogs: bkStuds,
    mismatch,
    errors,
    elapsed: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    excelPath,
    results,
  };

  onProgress({
    phase: 'done',
    message: 'Scraping complete!',
    current: total,
    total,
    percentage: 100,
    eta: '0s',
  });

  onComplete(summary);
  return summary;
}

function calculateETA(times, remaining) {
  if (times.length === 0 || remaining <= 0) return '0s';
  // Use average of last 5 times for better accuracy
  const recent = times.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const totalMs = avg * remaining;
  const totalSec = Math.round(totalMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

module.exports = { runScraper, DEFAULT_STUDENTS };
