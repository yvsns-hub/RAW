const express = require('express');
const { db, userQueries, jobQueries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply admin middleware to all routes in this file
router.use(requireAdmin);

// ─── ADMIN STATS ───
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const totalPortals = db.prepare('SELECT COUNT(*) as count FROM portals').get().count;
    const totalStudentsScraped = db.prepare('SELECT SUM(completed_students) as count FROM jobs').get().count || 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalJobs,
        totalPortals,
        totalStudentsScraped
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error fetching admin stats.' });
  }
});

// ─── ADMIN SETTINGS ───
router.get('/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const config = {};
    settings.forEach(s => config[s.key] = s.value);
    res.json({ success: true, settings: config });
  } catch (err) {
    console.error('Admin get settings error:', err);
    res.status(500).json({ error: 'Server error fetching settings.' });
  }
});

router.post('/settings', (req, res) => {
  try {
    const { adsense_enabled, adsense_script } = req.body;
    const db = require('../db/database').db;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))');
    
    db.transaction(() => {
      if (adsense_enabled !== undefined) stmt.run('adsense_enabled', String(adsense_enabled));
      if (adsense_script !== undefined) stmt.run('adsense_script', adsense_script);
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('Admin set settings error:', err);
    res.status(500).json({ error: 'Server error saving settings.' });
  }
});

// ─── LIST ALL USERS ───
router.get('/users', (req, res) => {
  try {
    const users = userQueries.findAll.all();
    res.json({ success: true, users });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Server error fetching users.' });
  }
});

// ─── VIEW USER DATA (Portals/Jobs) ───
router.get('/users/:id/data', (req, res) => {
  try {
    const userId = req.params.id;
    const portals = db.prepare('SELECT * FROM portals WHERE user_id = ?').all(userId);
    const jobs = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);
    const user = userQueries.findById.get(userId);

    res.json({
      success: true,
      user,
      portals,
      jobs
    });
  } catch (err) {
    console.error('Admin view user data error:', err);
    res.status(500).json({ error: 'Server error fetching user data.' });
  }
});

// ─── LIST ALL JOBS ───
router.get('/jobs', (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT j.*, u.username as owner_name, u.email as owner_email
      FROM jobs j
      JOIN users u ON j.user_id = u.id
      ORDER BY j.created_at DESC
      LIMIT 200
    `).all();
    res.json({ success: true, jobs });
  } catch (err) {
    console.error('Admin list jobs error:', err);
    res.status(500).json({ error: 'Server error fetching jobs.' });
  }
});

module.exports = router;
