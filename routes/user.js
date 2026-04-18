const express = require('express');
const { db, userQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(requireAuth);

// ─── GET PROFILE STATS ───
router.get('/profile', (req, res) => {
  try {
    const userId = req.session.userId;
    const user = userQueries.findById.get(userId);
    
    // Get user stats
    const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE user_id = ?').get(userId).count;
    const totalPortals = db.prepare('SELECT COUNT(*) as count FROM portals WHERE user_id = ?').get(userId).count;
    const totalStudentsScraped = db.prepare('SELECT SUM(completed_students) as count FROM jobs WHERE user_id = ?').get(userId).count || 0;

    res.json({
      success: true,
      user,
      stats: {
        totalJobs,
        totalPortals,
        totalStudentsScraped
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
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(username.trim(), hash, userId);
    } else {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), userId);
    }

    const updatedUser = userQueries.findById.get(userId);
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});

module.exports = router;
