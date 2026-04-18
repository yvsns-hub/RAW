const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('📖 Reading existing KIET_Results.xlsx...');
  
  const inputPath  = path.join(__dirname, 'KIET_Results.xlsx');
  const outputPath = path.join(__dirname, 'KIET_Results_Final_Numbered.xlsx');

  // ── READ existing data ──
  const oldWb = new ExcelJS.Workbook();
  await oldWb.xlsx.readFile(inputPath);

  // Read Summary sheet to get student-level data
  const summarySheet = oldWb.getWorksheet('📊 Summary');
  // Read Subject Details for per-subject data
  const detailSheet = oldWb.getWorksheet('📋 Subject Details');
  // Read Mismatches
  const mismatchSheet = oldWb.getWorksheet('⚠️ Mismatches');

  // Parse students from summary
  const studentMap = {};
  summarySheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const rollNo = (row.getCell(2).value || '').toString().trim();
    if (!rollNo) return;
    studentMap[rollNo] = {
      sno:       row.getCell(1).value,
      rollNo:    rollNo,
      name:      (row.getCell(3).value || '').toString().trim(),
      sgpa:      (row.getCell(4).value || '').toString().trim(),
      // skip cgpa (5), pct (6), creds (7)
      status:    (row.getCell(8).value || '').toString().trim(),
      bkCount:   row.getCell(9).value,
      passCount: row.getCell(10).value,
      passed: [],
      backlogs: [],
    };
  });

  // Parse subjects from detail sheet
  detailSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const rollNo  = (row.getCell(1).value || '').toString().trim();
    const subCode = (row.getCell(3).value || '').toString().trim();
    const subName = (row.getCell(4).value || '').toString().trim();
    const subType = (row.getCell(5).value || '').toString().trim();
    const internal= (row.getCell(6).value || '').toString().trim();
    const grade   = (row.getCell(7).value || '').toString().trim();
    const credits = (row.getCell(8).value || '').toString().trim();
    const result  = (row.getCell(9).value || '').toString().trim();
    
    if (!rollNo || !studentMap[rollNo]) return;

    const sub = { code: subCode, name: subName, type: subType, internal, grade, credits };
    if (result === 'BACKLOG') {
      studentMap[rollNo].backlogs.push(sub);
    } else {
      studentMap[rollNo].passed.push(sub);
    }
  });

  // Parse mismatches
  const mismatches = [];
  if (mismatchSheet) {
    mismatchSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      mismatches.push({
        rollNo: (row.getCell(1).value || '').toString().trim(),
        name:   (row.getCell(2).value || '').toString().trim(),
        issue:  (row.getCell(3).value || '').toString().trim(),
      });
    });
  }

  const allStudents = Object.values(studentMap);
  
  // Find max backlogs any student has for column count
  let maxBacklogs = 0;
  allStudents.forEach(s => {
    if (s.backlogs.length > maxBacklogs) maxBacklogs = s.backlogs.length;
  });
  console.log(`📊 ${allStudents.length} students, max backlogs: ${maxBacklogs}`);

  // ════════════════════════════════════════════════════
  //  BUILD NEW EXCEL
  // ════════════════════════════════════════════════════
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KIET Result Scraper';
  wb.created = new Date();

  // ─── STYLES ───
  const HDR_DARK  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
  const HDR_RED   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
  const HDR_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B3C' } };
  const ROW_PASS  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F5E3' } };
  const ROW_FAIL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E6' } };
  const ROW_WARN  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8CD' } };
  const WHITE_BG  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

  const thinBorder = {
    top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
  };

  const applyHdr = (row, fill = HDR_DARK) => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = fill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { ...thinBorder, bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    });
    // Adjust header height
    row.height = 32;
  };

  const styleRow = (row, fill, isBkRow = false) => {
    row.eachCell({ includeEmpty: true }, cell => {
      if (fill) cell.fill = fill;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });
    // Let row height resize based on content if it has multiple backlogs
  };

  // Helper to format backlogs as a numbered string
  const formatBacklogs = (backlogs) => {
    if (!backlogs || backlogs.length === 0) return '';
    return backlogs.map((bk, i) => `${i + 1}. ${bk.name}`).join('\n');
  };

  // ════════════════════════════════════════════════════
  //  SHEET 1: ALL STUDENTS
  //  Columns: S.No | Roll No | Name | SGPA | No. of Backlogs | Backlogs | Overall Status
  // ════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('All Students', { views: [{ state: 'frozen', ySplit: 1 }] });

  const cols = [
    { header: 'S.No',          key: 'sno',    width: 6  },
    { header: 'Roll Number',   key: 'rollNo', width: 16 },
    { header: 'Student Name',  key: 'name',   width: 42 },
    { header: 'SGPA',          key: 'sgpa',   width: 10 },
    { header: 'No. of Backlogs', key: 'bkCount', width: 14 },
    { header: 'Backlogs',      key: 'backlogs', width: 45 },
    { header: 'Overall Status', key: 'overallStatus', width: 16 },
  ];
  ws1.columns = cols;
  applyHdr(ws1.getRow(1));

  let sno = 1;
  allStudents.forEach(s => {
    const isMismatch = s.status.includes('MISMATCH');
    const isError    = s.status.includes('ERROR');
    const hasBacklog = s.backlogs.length > 0;
    const overallStatus = isMismatch ? 'MISMATCH' : isError ? 'ERROR' : hasBacklog ? 'FAIL' : 'PASS';

    const row = ws1.addRow({
      sno:           sno,
      rollNo:        s.rollNo,
      name:          s.name,
      sgpa:          s.sgpa || '',
      bkCount:       hasBacklog ? s.backlogs.length : (isMismatch || isError ? '' : 0),
      backlogs:      formatBacklogs(s.backlogs),
      overallStatus: overallStatus,
    });

    let fill;
    if (isMismatch || isError) fill = ROW_WARN;
    else if (hasBacklog)       fill = ROW_FAIL;
    else                       fill = ROW_PASS;
    styleRow(row, fill);

    row.getCell('overallStatus').font = {
      bold: true, size: 11, name: 'Calibri',
      color: { argb: overallStatus === 'PASS' ? 'FF1A6B3C' : overallStatus === 'FAIL' ? 'FFC0392B' : 'FFB8860B' }
    };
    
    // Bold backlog cell text in red
    if (hasBacklog) {
        row.getCell('backlogs').font = { name: 'Calibri', size: 10, color: { argb: 'FFC0392B' }, bold: true };
    }

    sno++;
  });
  ws1.autoFilter = { from: 'A1', to: ws1.getColumn(cols.length).letter + '1' };

  // ════════════════════════════════════════════════════
  //  SHEET 2: PASSED STUDENTS ONLY
  // ════════════════════════════════════════════════════
  const passedStudents = allStudents.filter(s => !s.status.includes('MISMATCH') && !s.status.includes('ERROR') && s.backlogs.length === 0);

  const ws2 = wb.addWorksheet('✅ Passed Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws2.columns = [
    { header: 'S.No',          key: 'sno',    width: 6  },
    { header: 'Roll Number',   key: 'rollNo', width: 16 },
    { header: 'Student Name',  key: 'name',   width: 42 },
    { header: 'SGPA',          key: 'sgpa',   width: 10 },
    { header: 'Subjects Passed', key: 'passCount', width: 16 },
    { header: 'Overall Status', key: 'status', width: 16 },
  ];
  applyHdr(ws2.getRow(1), HDR_GREEN);

  sno = 1;
  passedStudents.forEach(s => {
    const row = ws2.addRow({
      sno: sno,
      rollNo: s.rollNo,
      name: s.name,
      sgpa: s.sgpa,
      passCount: s.passed.length,
      status: 'PASS',
    });
    styleRow(row, ROW_PASS);
    row.getCell('status').font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF1A6B3C' } };
    sno++;
  });

  // ════════════════════════════════════════════════════
  //  SHEET 3: BACKLOG STUDENTS ONLY
  // ════════════════════════════════════════════════════
  const backlogStudents = allStudents.filter(s => !s.status.includes('MISMATCH') && !s.status.includes('ERROR') && s.backlogs.length > 0);

  const ws3 = wb.addWorksheet('🔴 Backlog Students', { views: [{ state: 'frozen', ySplit: 1 }] });

  const bkCols = [
    { header: 'S.No',          key: 'sno',    width: 6  },
    { header: 'Roll Number',   key: 'rollNo', width: 16 },
    { header: 'Student Name',  key: 'name',   width: 42 },
    { header: 'SGPA',          key: 'sgpa',   width: 10 },
    { header: 'No. of Backlogs', key: 'bkCount', width: 14 },
    { header: 'Backlogs',      key: 'backlogs', width: 45 },
    { header: 'Overall Status', key: 'overallStatus', width: 16 },
  ];
  ws3.columns = bkCols;
  applyHdr(ws3.getRow(1), HDR_RED);

  sno = 1;
  backlogStudents.forEach(s => {
    const row = ws3.addRow({
      sno: sno,
      rollNo: s.rollNo,
      name: s.name,
      sgpa: s.sgpa,
      bkCount: s.backlogs.length,
      backlogs: formatBacklogs(s.backlogs),
      overallStatus: 'FAIL',
    });
    
    styleRow(row, ROW_FAIL);

    row.getCell('overallStatus').font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FFC0392B' } };
    row.getCell('backlogs').font = { name: 'Calibri', size: 10, color: { argb: 'FFC0392B' }, bold: true };
    
    sno++;
  });

  // ════════════════════════════════════════════════════
  //  SHEET 4: CREDENTIAL MISMATCHES
  // ════════════════════════════════════════════════════
  if (mismatches.length > 0) {
    const ws4 = wb.addWorksheet('⚠️ Mismatches', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws4.columns = [
      { header: 'S.No',          key: 'sno',    width: 6  },
      { header: 'Roll Number',   key: 'rollNo', width: 18 },
      { header: 'Student Name',  key: 'name',   width: 42 },
      { header: 'Issue',         key: 'issue',  width: 40 },
    ];
    applyHdr(ws4.getRow(1), { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8860B' } });

    sno = 1;
    mismatches.forEach(m => {
      const row = ws4.addRow({ sno, rollNo: m.rollNo, name: m.name, issue: m.issue });
      styleRow(row, ROW_WARN);
      sno++;
    });
  }

  // ════════════════════════════════════════════════════
  //  SAVE
  // ════════════════════════════════════════════════════
  await wb.xlsx.writeFile(outputPath);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        EXCEL REFORMATTED SUCCESSFULLY        ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  📊 All Students       : ${String(allStudents.length).padEnd(18)}║`);
  console.log(`║  ✅ Passed Students    : ${String(passedStudents.length).padEnd(18)}║`);
  console.log(`║  🔴 Backlog Students   : ${String(backlogStudents.length).padEnd(18)}║`);
  console.log(`║  ⚠️  Mismatches        : ${String(mismatches.length).padEnd(18)}║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  📂 ${outputPath.substring(0, 40).padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════╝');
})();
