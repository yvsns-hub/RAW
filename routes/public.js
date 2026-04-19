const express = require('express');
const { client } = require('../db/database');

const router = express.Router();

// ─── PUBLIC SETTINGS ───
// These are non-sensitive configuration values needed by the frontend for all users
router.get('/settings', async (req, res) => {
  try {
    const rs = await client.execute({
      sql: 'SELECT key, value FROM settings WHERE key IN (?, ?)',
      args: ['adsense_enabled', 'adsense_script']
    });
    
    const config = {};
    rs.rows.forEach(s => config[s.key] = s.value);
    
    res.json({ success: true, settings: config });
  } catch (err) {
    console.error('Public settings error:', err);
    res.status(500).json({ error: 'Server error fetching public settings.' });
  }
});

module.exports = router;
