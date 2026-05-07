const express = require('express');
const { paymentJobQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { buildPaymentExcel } = require('../results/payment-scraper');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(requireAuth);

// ─── LIST PAYMENT JOBS ───
router.get('/', async (req, res) => {
  try {
    const jobs = await paymentJobQueries.findByUser.all(req.session.userId);
    const cleaned = (jobs || []).map(j => ({
      ...j,
      id: Number(j.id),
      total_students: Number(j.total_students),
      completed_students: Number(j.completed_students),
      paid_count: Number(j.paid_count),
      not_paid_count: Number(j.not_paid_count),
      error_count: Number(j.error_count),
      mismatch_count: Number(j.mismatch_count)
    }));
    res.json({ jobs: cleaned });
  } catch (err) {
    console.error('List payment jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch payment jobs.' });
  }
});

// ─── GOOGLE SHEETS CONFIG (must be before /:id wildcard) ───
const { getAppsScriptCode } = require('../results/google-sheets');
const configPath = path.join(__dirname, '..', 'data', 'google-config.json');

function loadGoogleConfig() {
  try { return fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}; } catch { return {}; }
}
function saveGoogleConfig(data) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

router.get('/google-config', (req, res) => {
  const config = loadGoogleConfig();
  res.json({ appsScriptUrl: config.appsScriptUrl || '' });
});

router.post('/google-config', (req, res) => {
  const { appsScriptUrl } = req.body;
  const config = loadGoogleConfig();
  config.appsScriptUrl = (appsScriptUrl || '').trim();
  saveGoogleConfig(config);
  res.json({ success: true });
});

router.get('/apps-script-code', (req, res) => {
  res.json({ code: getAppsScriptCode() });
});

// ─── GET PAYMENT JOB DETAILS ───
router.get('/:id', async (req, res) => {
  try {
    const job = await paymentJobQueries.findById.get(parseInt(req.params.id));
    if (!job || Number(job.user_id) !== req.session.userId) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    res.json({
      job: {
        ...job,
        id: Number(job.id),
        user_id: Number(job.user_id),
        total_students: Number(job.total_students),
        completed_students: Number(job.completed_students),
        paid_count: Number(job.paid_count),
        not_paid_count: Number(job.not_paid_count),
        error_count: Number(job.error_count),
        mismatch_count: Number(job.mismatch_count),
        students_input: JSON.parse(job.students_input || '[]'),
        results_data: JSON.parse(job.results_data || '[]'),
      }
    });
  } catch (err) {
    console.error('Get payment job details error:', err);
    res.status(500).json({ error: 'Failed to fetch job details.' });
  }
});

// ─── CREATE PAYMENT JOB ───
router.post('/', async (req, res) => {
  try {
    const { students, target_month, target_year, sheet_link } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Student list is required.' });
    }
    if (!target_month || !target_year) {
      return res.status(400).json({ error: 'Target month and year are required.' });
    }

    const result = await paymentJobQueries.create.run(
      req.session.userId,
      target_month,
      target_year,
      students.length,
      JSON.stringify(students),
      sheet_link || ''
    );

    res.json({
      success: true,
      jobId: Number(result.lastInsertRowid),
    });
  } catch (err) {
    console.error('Create payment job error:', err);
    res.status(500).json({ error: 'Failed to create payment job.' });
  }
});

// ─── DOWNLOAD EXCEL ───
router.get('/:id/download', async (req, res) => {
  try {
    const job = await paymentJobQueries.findById.get(parseInt(req.params.id));
    if (!job || Number(job.user_id) !== req.session.userId) {
      return res.status(404).send('Job not found.');
    }

    let filePath = job.excel_path;
    let fileExists = filePath && fs.existsSync(filePath);

    if (!fileExists) {
      const resultsData = JSON.parse(job.results_data || '[]');
      if (!resultsData.length) {
        return res.status(404).send('No results data available.');
      }
      console.log(`📦 Regenerating Payment Excel for job ${req.params.id}...`);
      filePath = await buildPaymentExcel(resultsData, job.target_month, job.target_year);
      if (!filePath) {
        return res.status(500).send('Failed to regenerate Excel file.');
      }
      await paymentJobQueries.updateExcelPath.run(filePath, parseInt(req.params.id));
    }

    const filename = `MessBill_${job.target_month}_${job.target_year}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const fileStream = fs.createReadStream(path.resolve(filePath));
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) res.status(500).send('Error reading Excel file.');
    });
    fileStream.pipe(res);
  } catch (err) {
    console.error('Download payment excel error:', err);
    if (!res.headersSent) res.status(500).send('Failed to download file.');
  }
});

// ─── DELETE PAYMENT JOB ───
router.delete('/:id', async (req, res) => {
  try {
    const job = await paymentJobQueries.findById.get(parseInt(req.params.id));
    if (!job || Number(job.user_id) !== req.session.userId) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    await paymentJobQueries.deleteJob.run(parseInt(req.params.id), req.session.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete payment job error:', err);
    res.status(500).json({ error: 'Failed to delete job.' });
  }
});

module.exports = router;
