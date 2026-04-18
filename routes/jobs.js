const express = require('express');
const { jobQueries, portalQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const path = require('path');

const router = express.Router();
router.use(requireAuth);

// ─── LIST JOBS ───
router.get('/', (req, res) => {
  const jobs = jobQueries.findByUser.all(req.session.userId);
  res.json({ jobs });
});

// ─── GET JOB DETAILS ───
router.get('/:id', (req, res) => {
  const job = jobQueries.findById.get(parseInt(req.params.id));
  if (!job || job.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  res.json({
    job: {
      ...job,
      students_input: JSON.parse(job.students_input || '[]'),
      results_data: JSON.parse(job.results_data || '[]'),
    }
  });
});

// ─── CREATE JOB (just creates DB record, scraper is started via Socket.IO) ───
router.post('/', (req, res) => {
  try {
    const { portal_id, semester, students, headless } = req.body;

    if (!portal_id || !students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Portal and student list are required.' });
    }

    // Get portal info
    const portal = portalQueries.findById.get(parseInt(portal_id), req.session.userId);
    if (!portal) {
      return res.status(404).json({ error: 'Portal not found.' });
    }

    const result = jobQueries.create.run(
      req.session.userId,
      portal.id,
      portal.name,
      semester || '',
      headless !== false ? 1 : 0,
      students.length,
      JSON.stringify(students)
    );

    res.json({
      success: true,
      jobId: result.lastInsertRowid,
      portal: {
        name: portal.name,
        login_url: portal.login_url,
        marksheet_url: portal.marksheet_url,
        logout_url: portal.logout_url,
        username_selector: portal.username_selector,
        password_selector: portal.password_selector,
        submit_selector: portal.submit_selector,
      }
    });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job.' });
  }
});

// ─── DOWNLOAD EXCEL ───
router.get('/:id/download', (req, res) => {
  const job = jobQueries.findById.get(parseInt(req.params.id));
  if (!job || job.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  if (!job.excel_path) {
    return res.status(404).json({ error: 'No Excel file available for this job.' });
  }
  res.download(job.excel_path, path.basename(job.excel_path));
});

// ─── DELETE JOB ───
router.delete('/:id', (req, res) => {
  const job = jobQueries.findById.get(parseInt(req.params.id));
  if (!job || job.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  jobQueries.deleteJob.run(parseInt(req.params.id), req.session.userId);
  res.json({ success: true });
});

module.exports = router;
