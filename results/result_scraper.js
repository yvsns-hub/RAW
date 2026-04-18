const puppeteer = require('puppeteer');
const ExcelJS   = require('exceljs');
const path      = require('path');
const fs        = require('fs');

// ════════════════════════════════════════════════════════
//  STUDENT LIST  (Roll No → Name)
//  Username = Password = Roll Number (per instructions)
// ════════════════════════════════════════════════════════
const students = [
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
//  CONSTANTS
// ════════════════════════════════════════════════════════
const PORTAL_URL    = 'https://www.kietgroup.info/Account/Login';
const MARKSHEET_URL = 'https://www.kietgroup.info/Student/MarkSheet.aspx';
const LOGOUT_URL    = 'https://www.kietgroup.info/Account/Logout.aspx';
const DELAY         = ms => new Promise(r => setTimeout(r, ms));

// Grade mapping: F = fail, everything else = pass
const FAIL_GRADES = new Set(['F', 'AB', 'ABSENT', 'W']);

// ════════════════════════════════════════════════════════
//  SCRAPE ONE STUDENT
// ════════════════════════════════════════════════════════
async function scrapeStudent(browser, student) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  try {
    // ── Step 1: Login ──
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });
    await DELAY(1500);

    await page.waitForSelector('#MainContent_UserName', { timeout: 10000 });
    await page.click('#MainContent_UserName', { clickCount: 3 });
    await page.type('#MainContent_UserName', student.rollNo, { delay: 30 });

    await page.click('#MainContent_Password', { clickCount: 3 });
    await page.type('#MainContent_Password', student.rollNo, { delay: 30 });

    await page.click('input[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await DELAY(1500);

    // Check login success
    const afterUrl = page.url();
    if (afterUrl.toLowerCase().includes('login') || afterUrl.toLowerCase().includes('account')) {
      // Still on login page — credential mismatch or error message
      const errText = await page.evaluate(() => {
        const err = document.querySelector('.validation-summary-errors, .field-validation-error, .alert, #MainContent_FailureText');
        return err ? err.innerText.trim() : 'Unknown error';
      });
      console.log(`[${student.rollNo}] ❌ Login failed: ${errText}`);
      await page.close();
      return {
        ...student,
        status: 'CREDENTIAL_MISMATCH',
        sgpa: '', cgpa: '', percentage: '', totalCredits: '',
        subjects: [], backlogs: [], passed: [],
        error: errText || 'Credentials mismatch'
      };
    }

    console.log(`[${student.rollNo}] ✅ Logged in`);

    // ── Step 2: Go to MarkSheet ──
    await page.goto(MARKSHEET_URL, { waitUntil: 'domcontentloaded' });
    await DELAY(2000);

    // ── Step 3: Extract result data ──
    const data = await page.evaluate(() => {
      const result = {
        sgpa: '', cgpa: '', percentage: '', totalCredits: '',
        subjects: []
      };

      const bodyText = document.body.innerText;

      // Extract SGPA
      const sgpaMatch = bodyText.match(/SGPA[\s\t:]*([0-9.]+)/i);
      if (sgpaMatch) result.sgpa = sgpaMatch[1];

      // Extract CGPA
      const cgpaMatch = bodyText.match(/CGPA\)[\s\n\t]*([0-9.]+)/i) ||
                        bodyText.match(/Average\(CGPA\)[\s\S]*?\n([0-9.]+)/i) ||
                        bodyText.match(/CGPA[\s\t:]*([0-9.]+)/i);
      if (cgpaMatch) result.cgpa = cgpaMatch[1];

      // Extract Equivalent Percentage
      const pctMatch = bodyText.match(/Equivalent Percentage[\s\n\t]*([0-9.]+)/i) ||
                       bodyText.match(/Equivelent Percentage[\s\n\t]*([0-9.]+)/i);
      if (pctMatch) result.percentage = pctMatch[1];

      // Extract Total Credits
      const credMatch = bodyText.match(/TotalCredits[\s\t]*([0-9.]+)/i) ||
                        bodyText.match(/Total Credits[\s\n\t]*([0-9.]+)/i);
      if (credMatch) result.totalCredits = credMatch[1];

      // Parse subject table — columns: #, Code, Subject, Type, Internal, Grade, Credits
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
          // # | Code | Subject | Type | Internal | Grade | Credits
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

    console.log(`[${student.rollNo}] SGPA: ${data.sgpa} | CGPA: ${data.cgpa} | %: ${data.percentage} | Backlogs: ${backlogs.length}`);

    // ── Step 4: Logout ──
    await page.goto(LOGOUT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
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
    console.error(`[${student.rollNo}] ⚠️  Error: ${err.message}`);
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
//  BUILD EXCEL
// ════════════════════════════════════════════════════════
async function buildExcel(results) {
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'KIET Result Scraper';
  wb.created   = new Date();

  // ─── STYLES ───────────────────────────────────────────
  const HDR_DARK  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
  const HDR_RED   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
  const HDR_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B3C' } };
  const ROW_PASS  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F5E3' } };
  const ROW_FAIL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E6' } };
  const ROW_WARN  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8CD' } };

  const applyHdr = (row, fillStyle = HDR_DARK) => {
    row.eachCell(cell => {
      cell.fill      = fillStyle;
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right:  { style: 'thin',   color: { argb: 'FF888888' } }
      };
    });
    row.height = 32;
  };

  const applyDataRow = (row, fillStyle) => {
    row.eachCell({ includeEmpty: true }, cell => {
      if (fillStyle) cell.fill = fillStyle;
      cell.font      = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right:  { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left:   { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
    });
    row.height = 22;
  };

  // ════════════════════════════════════════════════════
  //  SHEET 1: SUMMARY
  // ════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('📊 Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws1.columns = [
    { header: 'S.No',              key: 'sno',        width: 6  },
    { header: 'Roll Number',       key: 'rollNo',     width: 16 },
    { header: 'Student Name',      key: 'name',       width: 42 },
    { header: 'SGPA (Sem 1)',      key: 'sgpa',       width: 12 },
    { header: 'CGPA',              key: 'cgpa',       width: 10 },
    { header: 'Equivalent %',      key: 'pct',        width: 14 },
    { header: 'Total Credits',     key: 'creds',      width: 13 },
    { header: 'Overall Status',    key: 'status',     width: 14 },
    { header: 'No. of Backlogs',   key: 'bkCount',    width: 14 },
    { header: 'No. Passed',        key: 'passCount',  width: 12 },
    { header: 'Backlog Subjects',  key: 'bkSubs',     width: 70 },
    { header: 'Error / Note',      key: 'err',        width: 40 },
  ];
  applyHdr(ws1.getRow(1));

  let sno = 1;
  for (const r of results) {
    const isSuccess  = r.status === 'SUCCESS';
    const hasBacklog = isSuccess && r.backlogs.length > 0;
    const isMismatch = r.status === 'CREDENTIAL_MISMATCH';
    const isError    = r.status === 'ERROR';

    const statusLabel = isMismatch ? '⚠️ MISMATCH'
                      : isError    ? '❌ ERROR'
                      : hasBacklog ? '🔴 BACKLOG'
                                   : '✅ PASS';

    const bkSubsList = hasBacklog
      ? r.backlogs.map(s => `${s.name} (${s.grade})`).join(' | ')
      : '';

    const row = ws1.addRow({
      sno,
      rollNo:    r.rollNo,
      name:      r.name,
      sgpa:      r.sgpa     || '',
      cgpa:      r.cgpa     || '',
      pct:       r.percentage || '',
      creds:     r.totalCredits || '',
      status:    statusLabel,
      bkCount:   isSuccess ? r.backlogs.length : '',
      passCount: isSuccess ? r.passed.length   : '',
      bkSubs:    bkSubsList,
      err:       r.error || '',
    });

    const fill = isMismatch || isError ? ROW_WARN
               : hasBacklog            ? ROW_FAIL
                                       : ROW_PASS;
    applyDataRow(row, fill);

    // Bold the status cell
    row.getCell('status').font = { bold: true, size: 10, name: 'Calibri' };
    sno++;
  }

  ws1.autoFilter = { from: 'A1', to: 'L1' };

  // ════════════════════════════════════════════════════
  //  SHEET 2: CREDENTIAL MISMATCHES / ERRORS
  // ════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('⚠️ Mismatches', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws2.columns = [
    { header: 'Roll Number',  key: 'rollNo', width: 18 },
    { header: 'Student Name', key: 'name',   width: 42 },
    { header: 'Issue',        key: 'issue',  width: 45 },
  ];
  applyHdr(ws2.getRow(1), HDR_RED);

  results
    .filter(r => r.status !== 'SUCCESS')
    .forEach(r => {
      const row = ws2.addRow({ rollNo: r.rollNo, name: r.name, issue: r.error || r.status });
      applyDataRow(row, ROW_WARN);
    });

  // ════════════════════════════════════════════════════
  //  SHEET 3: SUBJECT-LEVEL DETAIL (All students)
  // ════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('📋 Subject Details', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws3.columns = [
    { header: 'Roll Number',  key: 'rollNo',   width: 16 },
    { header: 'Student Name', key: 'name',     width: 38 },
    { header: 'Sub Code',     key: 'code',     width: 14 },
    { header: 'Subject Name', key: 'subject',  width: 48 },
    { header: 'Type',         key: 'type',     width: 10 },
    { header: 'Internal',     key: 'internal', width: 10 },
    { header: 'Grade',        key: 'grade',    width: 10 },
    { header: 'Credits',      key: 'credits',  width: 10 },
    { header: 'Result',       key: 'result',   width: 12 },
  ];
  applyHdr(ws3.getRow(1));

  for (const r of results) {
    if (r.status !== 'SUCCESS') continue;
    r.subjects.forEach(sub => {
      const isFail = FAIL_GRADES.has((sub.grade || '').trim().toUpperCase()) || sub.grade === 'F';
      const row = ws3.addRow({
        rollNo:   r.rollNo,
        name:     r.name,
        code:     sub.code,
        subject:  sub.name,
        type:     sub.type,
        internal: sub.internal,
        grade:    sub.grade,
        credits:  sub.credits,
        result:   isFail ? 'BACKLOG' : 'PASS',
      });
      applyDataRow(row, isFail ? ROW_FAIL : ROW_PASS);
      row.getCell('result').font = { bold: true, size: 10, name: 'Calibri',
        color: { argb: isFail ? 'FFC0392B' : 'FF1A6B3C' } };
    });
  }
  ws3.autoFilter = { from: 'A1', to: 'I1' };

  // ════════════════════════════════════════════════════
  //  SHEET 4: BACKLOGS ONLY
  // ════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('🔴 Backlogs Only', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws4.columns = [
    { header: 'Roll Number',  key: 'rollNo',   width: 16 },
    { header: 'Student Name', key: 'name',     width: 38 },
    { header: 'Sub Code',     key: 'code',     width: 14 },
    { header: 'Subject Name', key: 'subject',  width: 48 },
    { header: 'Type',         key: 'type',     width: 10 },
    { header: 'Internal',     key: 'internal', width: 10 },
    { header: 'Grade',        key: 'grade',    width: 10 },
    { header: 'Credits Lost', key: 'credits',  width: 12 },
  ];
  applyHdr(ws4.getRow(1), HDR_RED);

  for (const r of results) {
    if (r.status !== 'SUCCESS') continue;
    r.backlogs.forEach(sub => {
      const row = ws4.addRow({
        rollNo:   r.rollNo,
        name:     r.name,
        code:     sub.code,
        subject:  sub.name,
        type:     sub.type,
        internal: sub.internal,
        grade:    sub.grade,
        credits:  sub.credits,
      });
      applyDataRow(row, ROW_FAIL);
    });
  }

  // ════════════════════════════════════════════════════
  //  SAVE
  // ════════════════════════════════════════════════════
  const outPath = path.join(__dirname, 'KIET_Results.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Excel saved → ${outPath}`);
  return outPath;
}

// ════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════
(async () => {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     KIET RESULT SCRAPER  v2.0           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`📋 Total students : ${students.length}`);
  console.log(`🌐 Portal         : ${PORTAL_URL}\n`);

  const browser = await puppeteer.launch({
    headless: false,           // visible – watch progress
    args: ['--start-maximized', '--disable-infobars'],
    defaultViewport: null,
  });

  const results = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    process.stdout.write(`\n[${String(i + 1).padStart(2, '0')}/${students.length}] ${student.rollNo} – ${student.name} ... `);
    const result = await scrapeStudent(browser, student);
    results.push(result);
    await DELAY(1000);
  }

  await browser.close();

  console.log('\n\n📊 Building Excel file...');
  const filePath = await buildExcel(results);

  // Final summary
  const success  = results.filter(r => r.status === 'SUCCESS').length;
  const bkStuds  = results.filter(r => r.status === 'SUCCESS' && r.backlogs.length > 0).length;
  const fullPass = success - bkStuds;
  const mismatch = results.filter(r => r.status === 'CREDENTIAL_MISMATCH').length;
  const errors   = results.filter(r => r.status === 'ERROR').length;
  const elapsed  = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║           FINAL SUMMARY                 ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ✅ Successful logins  : ${String(success).padEnd(14)}║`);
  console.log(`║  🟢 Fully Passed       : ${String(fullPass).padEnd(14)}║`);
  console.log(`║  🔴 Has Backlogs       : ${String(bkStuds).padEnd(14)}║`);
  console.log(`║  ⚠️  Cred Mismatch     : ${String(mismatch).padEnd(14)}║`);
  console.log(`║  ❌ Errors             : ${String(errors).padEnd(14)}║`);
  console.log(`║  ⏱️  Total time        : ${(elapsed + ' min').padEnd(14)}║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  📂 ${filePath.substring(0, 36).padEnd(36)}  ║`);
  console.log('╚══════════════════════════════════════════╝');
})();
