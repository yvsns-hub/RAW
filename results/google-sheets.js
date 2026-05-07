const path = require('path');
const fs = require('fs');

// ─── GOOGLE SHEETS AUTO-UPDATER (Apps Script Method) ───
// Uses a Google Apps Script Web App deployed from the target sheet.
// NO service account or API keys needed!
//
// HOW IT WORKS:
// 1. User deploys a small Apps Script from their Google Sheet
// 2. The script creates a web app URL
// 3. Our server POSTs paid student data to that URL
// 4. The script fills in the data on the sheet (only empty cells, no colors)

// ─── EXTRACT SPREADSHEET ID FROM URL ───
function extractSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

const MONTH_NAMES_GS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ─── UPDATE VIA APPS SCRIPT WEB APP ───
async function updateGoogleSheet(sheetLink, paidResults, onLog = console.log, appsScriptUrl = '', targetMonth = '', targetYear = '') {
  if (!sheetLink) {
    onLog('📄 No sheet link provided, skipping Google Sheets update.');
    return { success: false, reason: 'no_link' };
  }

  const spreadsheetId = extractSpreadsheetId(sheetLink);
  if (!spreadsheetId) {
    onLog('❌ Could not extract Spreadsheet ID from the link.');
    return { success: false, reason: 'invalid_link' };
  }

  // Check for Apps Script URL (from env, data file, or parameter)
  let scriptUrl = appsScriptUrl
    || process.env.GOOGLE_APPS_SCRIPT_URL
    || '';

  // Try loading from local file
  if (!scriptUrl) {
    const configPath = path.join(__dirname, '..', 'data', 'google-config.json');
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        scriptUrl = config.appsScriptUrl || '';
      }
    } catch (e) {}
  }

  if (!scriptUrl) {
    onLog('⚠️ Google Apps Script URL not configured. Skipping sheet update.');
    onLog('💡 Deploy the Apps Script from your Google Sheet and save the URL.');
    onLog('📋 Go to Mess Bill → Settings for setup instructions.');
    return { success: false, reason: 'no_script_url' };
  }

  // Filter only paid students
  const paidData = (paidResults || [])
    .filter(r => r.status === 'PAID')
    .map(r => ({
      rollNo: r.rollNo,
      name: r.name || r.portalName || '',
      sno: r.sno || '',
      roomNo: r.roomNo || '',
      receiptId: r.receiptIds || '',
      date: r.dates || '',
      amount: r.amounts || '',
    }));

  if (paidData.length === 0) {
    onLog('ℹ️ No paid students to send to Google Sheet.');
    return { success: true, filled: 0, skipped: 0 };
  }

  const monthName = MONTH_NAMES_GS[parseInt(targetMonth) - 1] || '';
  onLog(`📤 Sending ${paidData.length} paid students to Google Sheet (target: ${monthName || '?'} ${targetYear || '?'})...`);

  try {
    // Google Apps Script web apps redirect POST requests.
    // Using text/plain avoids Google intercepting the request with an HTML login page.
    const payload = JSON.stringify({
      action: 'fillPaidData',
      spreadsheetId,
      targetMonth: monthName,
      targetYear: targetYear || '',
      paidStudents: paidData,
    });

    const response = await fetch(scriptUrl, {
      method: 'POST',
      body: payload,
      redirect: 'follow',
    });

    const text = await response.text();
    onLog(`📥 Response status: ${response.status}, length: ${text.length}`);

    // Parse the response — Apps Script may return:
    // 1. Pure JSON
    // 2. HTML page wrapping JSON (common with redirects)
    // 3. HTML error page
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // Try to extract JSON from HTML response
      // Apps Script often wraps response in: {"result":...} or plain {...}
      const jsonMatch = text.match(/\{"success"[\s\S]*?\}/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[0]); } catch { result = null; }
      }
      if (!result) {
        // Check for common Google error pages
        if (text.includes('Sign in') || text.includes('accounts.google.com')) {
          onLog('❌ Google is asking for login. Make sure the Apps Script is deployed with "Anyone" access.');
          return { success: false, reason: 'auth_required', error: 'Apps Script requires authentication. Redeploy with "Anyone" access.' };
        }
        if (text.includes('ScriptError') || text.includes('Exception')) {
          const errMatch = text.match(/(?:ScriptError|Exception)[^<]*/);
          onLog(`❌ Apps Script error: ${errMatch ? errMatch[0] : 'Unknown script error'}`);
          return { success: false, reason: 'script_error', error: errMatch ? errMatch[0] : text.substring(0, 200) };
        }
        onLog(`❌ Unexpected response from Apps Script (not JSON). First 200 chars: ${text.substring(0, 200)}`);
        return { success: false, reason: 'invalid_response', error: 'Response was not JSON. Check Apps Script deployment.' };
      }
    }

    if (result.success) {
      // Log diagnostics if available
      if (result.debug) {
        onLog(`📊 Sheet: "${result.debug.sheetName || '?'}" | Rows: ${result.debug.totalRows || '?'} | Roll Col: ${result.debug.rollColName || '?'} (index ${result.debug.rollCol ?? '?'})`);
        if (result.debug.headers) onLog(`📋 Headers: ${result.debug.headers}`);
        if (result.debug.sampleRolls) onLog(`🔍 Sample rolls in sheet: ${result.debug.sampleRolls}`);
        if (result.debug.samplePaid) onLog(`📤 Sample paid rolls sent: ${result.debug.samplePaid}`);
        if (result.debug.matchedRolls !== undefined) onLog(`🎯 Roll numbers matched: ${result.debug.matchedRolls}`);
      }
      onLog(`✅ Google Sheet updated! ${result.filled || 0} students filled, ${result.skipped || 0} skipped (already filled).`);
      return { success: true, filled: result.filled || 0, skipped: result.skipped || 0 };
    } else {
      onLog(`❌ Sheet update failed: ${result.error || 'Unknown error'}`);
      return { success: false, reason: 'script_error', error: result.error };
    }
  } catch (err) {
    onLog(`❌ Error connecting to Apps Script: ${err.message}`);
    return { success: false, reason: 'network_error', error: err.message };
  }
}

// ─── APPS SCRIPT CODE (to be deployed by the user) ───
// This is the code the user copies into their Google Sheet's Apps Script editor
function getAppsScriptCode() {
  return `// ═══════════════════════════════════════════════════
// RAW Mess Bill Auto-Filler — Google Apps Script
// Paste this into your Google Sheet's Apps Script editor
// Then deploy as Web App (Execute as: Me, Access: Anyone)
// ═══════════════════════════════════════════════════

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    if (data.action !== 'fillPaidData') {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var spreadsheetId = data.spreadsheetId;
    var paidStudents = data.paidStudents || [];
    var targetMonth = (data.targetMonth || '').toUpperCase();
    var targetYear = (data.targetYear || '').toString();
    
    // Open the spreadsheet
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var allSheets = ss.getSheets();
    var sheet = null;
    
    // Find the sheet tab matching the target month/year
    if (targetMonth) {
      var shortMonth = targetMonth.substring(0, 3); // JAN, FEB, etc.
      for (var si = 0; si < allSheets.length; si++) {
        var tabName = allSheets[si].getName().toUpperCase();
        // Match: "JANUARY 2026", "JAN 2026", "JANUARY", "JAN2026", etc.
        var hasMonth = tabName.indexOf(targetMonth) >= 0 || tabName.indexOf(shortMonth) >= 0;
        var hasYear = !targetYear || tabName.indexOf(targetYear) >= 0;
        if (hasMonth && hasYear) {
          sheet = allSheets[si];
          break;
        }
      }
      // If month+year didn't match, try just month name
      if (!sheet) {
        for (var si = 0; si < allSheets.length; si++) {
          var tabName = allSheets[si].getName().toUpperCase();
          if (tabName.indexOf(targetMonth) >= 0 || tabName.indexOf(shortMonth) >= 0) {
            sheet = allSheets[si];
            break;
          }
        }
      }
    }
    
    // Fallback to first sheet if no match
    if (!sheet) sheet = allSheets[0];
    
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    
    if (values.length < 2) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Sheet "' + sheet.getName() + '" has no data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find column indices from headers
    var headers = values[0].map(function(h) { return (h || '').toString().trim().toUpperCase(); });
    
    var rollCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (headers[c].indexOf('ROLL') >= 0 || headers[c].indexOf('ADMISSION') >= 0) {
        rollCol = c; break;
      }
    }
    
    // Fallback: scan for roll-number-like values
    if (rollCol === -1) {
      for (var c = 0; c < headers.length; c++) {
        for (var r = 1; r < Math.min(values.length, 10); r++) {
          var cell = (values[r][c] || '').toString().trim();
          if (/^[0-9]{2}[A-Z]/i.test(cell) && cell.length >= 10) {
            rollCol = c; break;
          }
        }
        if (rollCol >= 0) break;
      }
    }
    
    if (rollCol === -1) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Cannot find Roll Number column' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find other columns
    var receiptCol = findCol(headers, ['RECEIPT', 'RECIEPT']);
    var dateCol = findCol(headers, ['DATE']);
    var paidCol = findCol(headers, ['PAID', 'STATUS']);
    var amountCol = findCol(headers, ['AMOUNT', 'AMT']);
    var remarksCol = findCol(headers, ['REMARK']);
    
    // Build paid lookup
    var paidMap = {};
    for (var i = 0; i < paidStudents.length; i++) {
      var key = paidStudents[i].rollNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      paidMap[key] = paidStudents[i];
    }
    
    // Collect sample roll numbers for debugging
    var sampleSheetRolls = [];
    for (var sr = 1; sr < Math.min(values.length, 6); sr++) {
      var rv = (values[sr][rollCol] || '').toString().trim();
      if (rv) sampleSheetRolls.push(rv);
    }
    
    var samplePaidRolls = [];
    var paidKeys = Object.keys(paidMap);
    for (var sp = 0; sp < Math.min(paidKeys.length, 5); sp++) {
      samplePaidRolls.push(paidKeys[sp]);
    }
    
    // Count matches (for debug)
    var matchedRolls = 0;
    for (var row = 1; row < values.length; row++) {
      var cellRoll = (values[row][rollCol] || '').toString().trim();
      if (!cellRoll) continue;
      var key = cellRoll.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (paidMap[key]) matchedRolls++;
    }
    
    // Fill data (only empty cells, no formatting)
    var filled = 0;
    var skipped = 0;
    
    for (var row = 1; row < values.length; row++) {
      var cellRoll = (values[row][rollCol] || '').toString().trim();
      if (!cellRoll) continue;
      
      var key = cellRoll.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      var pd = paidMap[key];
      if (!pd) continue;
      
      var didFill = false;
      var sheetRow = row + 1; // 1-indexed
      
      if (receiptCol >= 0 && !(values[row][receiptCol] || '').toString().trim()) {
        sheet.getRange(sheetRow, receiptCol + 1).setValue(pd.receiptId || '');
        didFill = true;
      }
      if (dateCol >= 0 && !(values[row][dateCol] || '').toString().trim()) {
        sheet.getRange(sheetRow, dateCol + 1).setValue(pd.date || '');
        didFill = true;
      }
      if (paidCol >= 0 && !(values[row][paidCol] || '').toString().trim()) {
        sheet.getRange(sheetRow, paidCol + 1).setValue('PAID');
        didFill = true;
      }
      if (amountCol >= 0 && !(values[row][amountCol] || '').toString().trim()) {
        sheet.getRange(sheetRow, amountCol + 1).setValue(pd.amount || '');
        didFill = true;
      }
      if (remarksCol >= 0 && !(values[row][remarksCol] || '').toString().trim()) {
        sheet.getRange(sheetRow, remarksCol + 1).setValue('DONE');
        didFill = true;
      }
      
      if (didFill) filled++;
      else skipped++;
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      filled: filled,
      skipped: skipped,
      total: paidStudents.length,
      debug: {
        sheetName: sheet.getName(),
        totalRows: values.length,
        rollCol: rollCol,
        rollColName: headers[rollCol] || '?',
        headers: headers.join(', '),
        sampleRolls: sampleSheetRolls.join(', '),
        samplePaid: samplePaidRolls.join(', '),
        matchedRolls: matchedRolls,
        receiptCol: receiptCol,
        dateCol: dateCol,
        paidCol: paidCol,
        amountCol: amountCol,
        remarksCol: remarksCol
      }
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function findCol(headers, keywords) {
  for (var c = 0; c < headers.length; c++) {
    for (var k = 0; k < keywords.length; k++) {
      if (headers[c].indexOf(keywords[k]) >= 0) return c;
    }
  }
  return -1;
}

// Test function (run manually to verify)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'RAW Mess Bill Auto-Filler is running!'
  })).setMimeType(ContentService.MimeType.JSON);
}`;
}

module.exports = { updateGoogleSheet, extractSpreadsheetId, getAppsScriptCode };
