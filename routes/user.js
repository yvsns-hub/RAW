const express = require('express');
const { client, userQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(requireAuth);

// ─── GET PROFILE STATS ───
router.get('/profile', async (req, res) => {
  try {
    const userId = req.session.userId;
    const qUser = userQueries.findById.get(userId);
    
    // Get user stats
    const qJobs = client.execute({ sql: 'SELECT COUNT(*) as count FROM jobs WHERE user_id = ?', args: [userId] });
    const qPortals = client.execute({ sql: 'SELECT COUNT(*) as count FROM portals WHERE user_id = ?', args: [userId] });
    const qStudents = client.execute({ sql: 'SELECT SUM(completed_students) as count FROM jobs WHERE user_id = ?', args: [userId] });

    const [user, rsJobs, rsPortals, rsStudents] = await Promise.all([qUser, qJobs, qPortals, qStudents]);

    res.json({
      success: true,
      user: user ? { ...user, id: Number(user.id) } : null,
      stats: {
        totalJobs: Number(rsJobs.rows[0].count),
        totalPortals: Number(rsPortals.rows[0].count),
        totalStudentsScraped: Number(rsStudents.rows[0].count || 0)
      }
    });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: 'Server error fetching profile.' });
  }
});

// ─── UPDATE PROFILE ───
router.put('/profile', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { username, password } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }
      const hash = await bcrypt.hash(password, 10);
      await client.execute({
        sql: 'UPDATE users SET username = ?, password_hash = ? WHERE id = ?',
        args: [username.trim(), hash, userId]
      });
    } else {
      await client.execute({
        sql: 'UPDATE users SET username = ? WHERE id = ?',
        args: [username.trim(), userId]
      });
    }

    const updatedUser = await userQueries.findById.get(userId);
    res.json({ success: true, user: updatedUser ? { ...updatedUser, id: Number(updatedUser.id) } : null });
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});

module.exports = router;
