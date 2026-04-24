const express = require('express');
const { jobQueries, portalQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { rebuildExcel } = require('../results/scraper-engine');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(requireAuth);

// ─── LIST JOBS ───
router.get('/', async (req, res) => {
  try {
    const jobs = await jobQueries.findByUser.all(req.session.userId);
    // Convert BigInts manually for consistent JSON output if needed
    const cleaned = (jobs || []).map(j => ({
      ...j,
      id: Number(j.id),
      total_students: Number(j.total_students),
      completed_students: Number(j.completed_students),
      pass_count: Number(j.pass_count),
      backlog_count: Number(j.backlog_count),
      error_count: Number(j.error_count),
      mismatch_count: Number(j.mismatch_count)
    }));
    res.json({ jobs: cleaned });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// ─── GET JOB DETAILS ───
router.get('/:id', async (req, res) => {
  try {
    const job = await jobQueries.findById.get(parseInt(req.params.id));
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
        pass_count: Number(job.pass_count),
        backlog_count: Number(job.backlog_count),
        error_count: Number(job.error_count),
        mismatch_count: Number(job.mismatch_count),
        students_input: JSON.parse(job.students_input || '[]'),
        results_data: JSON.parse(job.results_data || '[]'),
      }
    });
  } catch (err) {
    console.error('Get job details error:', err);
    res.status(500).json({ error: 'Failed to fetch job details.' });
  }
});

// ─── CREATE JOB (just creates DB record, scraper is started via Socket.IO) ───
router.post('/', async (req, res) => {
  try {
    const { portal_id, semester, students, headless } = req.body;

    if (!portal_id || !students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Portal and student list are required.' });
    }

    // Get portal info
    const portal = await portalQueries.findById.get(parseInt(portal_id), req.session.userId);
    if (!portal) {
      return res.status(404).json({ error: 'Portal not found.' });
    }

    const result = await jobQueries.create.run(
      req.session.userId,
      Number(portal.id),
      portal.name,
      semester || '',
      headless !== false ? 1 : 0,
      students.length,
      JSON.stringify(students)
    );

    res.json({
      success: true,
      jobId: Number(result.lastInsertRowid),
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
router.get('/:id/download', async (req, res) => {
  try {
    const job = await jobQueries.findById.get(parseInt(req.params.id));
    if (!job || Number(job.user_id) !== req.session.userId) {
      return res.status(404).send('Job not found.');
    }

    let filePath = job.excel_path;
    let fileExists = filePath && fs.existsSync(filePath);

    // If file doesn't exist on disk (e.g. Render restart wiped ephemeral storage),
    // regenerate from stored results_data in the database
    if (!fileExists) {
      const resultsData = JSON.parse(job.results_data || '[]');
      if (!resultsData.length) {
        return res.status(404).send('No results data available. The job may not have completed successfully.');
      }
      console.log(`📦 Regenerating Excel for job ${req.params.id} from stored data...`);
      filePath = await rebuildExcel(resultsData);
      if (!filePath) {
        return res.status(500).send('Failed to regenerate Excel file.');
      }
      // Update the stored path so next download is faster
      await jobQueries.updateExcelPath.run(filePath, parseInt(req.params.id));
    }

    // Send the file with correct headers so MS Excel recognizes it
    const filename = `Results_${job.portal_name || 'RAW'}_${job.semester || ''}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'no-cache');

    // Stream the file directly — avoids any encoding issues
    const fileStream = fs.createReadStream(path.resolve(filePath));
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error reading Excel file.');
      }
    });
    fileStream.pipe(res);
  } catch (err) {
    console.error('Download excel error:', err);
    if (!res.headersSent) {
      res.status(500).send('Failed to download file.');
    }
  }
});

// ─── DELETE JOB ───
router.delete('/:id', async (req, res) => {
  try {
    const job = await jobQueries.findById.get(parseInt(req.params.id));
    if (!job || Number(job.user_id) !== req.session.userId) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    await jobQueries.deleteJob.run(parseInt(req.params.id), req.session.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: 'Failed to delete job.' });
  }
});

module.exports = router;
