const express = require('express');
const { client, userQueries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply admin middleware to all routes in this file
router.use(requireAdmin);

// ─── ADMIN STATS ───
router.get('/stats', async (req, res) => {
  try {
    const qUsers = client.execute('SELECT COUNT(*) as count FROM users');
    const qJobs = client.execute('SELECT COUNT(*) as count FROM jobs');
    const qPortals = client.execute('SELECT COUNT(*) as count FROM portals');
    const qStudents = client.execute('SELECT SUM(completed_students) as count FROM jobs');

    const [rsUsers, rsJobs, rsPortals, rsStudents] = await Promise.all([qUsers, qJobs, qPortals, qStudents]);

    res.json({
      success: true,
      stats: {
        totalUsers: Number(rsUsers.rows[0].count),
        totalJobs: Number(rsJobs.rows[0].count),
        totalPortals: Number(rsPortals.rows[0].count),
        totalStudentsScraped: Number(rsStudents.rows[0].count || 0)
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error fetching admin stats.' });
  }
});

// ─── ADMIN SETTINGS ───
router.get('/settings', async (req, res) => {
  try {
    const rs = await client.execute('SELECT * FROM settings');
    const config = {};
    rs.rows.forEach(s => config[s.key] = s.value);
    res.json({ success: true, settings: config });
  } catch (err) {
    console.error('Admin get settings error:', err);
    res.status(500).json({ error: 'Server error fetching settings.' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { adsense_enabled, adsense_script } = req.body;
    const batch = [];
    
    if (adsense_enabled !== undefined) {
      batch.push({
        sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        args: ['adsense_enabled', String(adsense_enabled)]
      });
    }
    if (adsense_script !== undefined) {
      batch.push({
        sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        args: ['adsense_script', adsense_script]
      });
    }

    if (batch.length > 0) {
      await client.batch(batch, "write");
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Admin set settings error:', err);
    res.status(500).json({ error: 'Server error saving settings.' });
  }
});

// ─── LIST ALL USERS ───
router.get('/users', async (req, res) => {
  try {
    const users = await userQueries.findAll.all();
    const cleaned = users.map(u => ({ ...u, id: Number(u.id) }));
    res.json({ success: true, users: cleaned });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Server error fetching users.' });
  }
});

// ─── VIEW USER DATA (Portals/Jobs) ───
router.get('/users/:id/data', async (req, res) => {
  try {
    const userId = req.params.id;
    const qPortals = client.execute({ sql: 'SELECT * FROM portals WHERE user_id = ?', args: [userId] });
    const qJobs = client.execute({ sql: 'SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', args: [userId] });
    const qUser = userQueries.findById.get(userId);

    const [rsPortals, rsJobs, user] = await Promise.all([qPortals, qJobs, qUser]);

    res.json({
      success: true,
      user: user ? { ...user, id: Number(user.id) } : null,
      portals: rsPortals.rows.map(p => ({ ...p, id: Number(p.id), user_id: Number(p.user_id) })),
      jobs: rsJobs.rows.map(j => ({ ...j, id: Number(j.id), user_id: Number(j.user_id) }))
    });
  } catch (err) {
    console.error('Admin view user data error:', err);
    res.status(500).json({ error: 'Server error fetching user data.' });
  }
});

// ─── LIST ALL JOBS ───
router.get('/jobs', async (req, res) => {
  try {
    const rs = await client.execute(`
      SELECT j.*, u.username as owner_name, u.email as owner_email
      FROM jobs j
      JOIN users u ON j.user_id = u.id
      ORDER BY j.created_at DESC
      LIMIT 200
    `);
    const cleaned = rs.rows.map(j => ({
      ...j,
      id: Number(j.id),
      user_id: Number(j.user_id),
      total_students: Number(j.total_students),
      completed_students: Number(j.completed_students)
    }));
    res.json({ success: true, jobs: cleaned });
  } catch (err) {
    console.error('Admin list jobs error:', err);
    res.status(500).json({ error: 'Server error fetching jobs.' });
  }
});

module.exports = router;
