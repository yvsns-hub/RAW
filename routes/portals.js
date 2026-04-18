const express = require('express');
const { portalQueries } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── LIST PORTALS ───
router.get('/', (req, res) => {
  const portals = portalQueries.findByUser.all(req.session.userId);
  // Parse semesters JSON
  const parsed = portals.map(p => ({
    ...p,
    semesters: JSON.parse(p.semesters || '[]'),
  }));
  res.json({ portals: parsed });
});

// ─── CREATE PORTAL ───
router.post('/', (req, res) => {
  try {
    const { name, login_url, marksheet_url, logout_url, username_selector, password_selector, submit_selector, default_password, semesters } = req.body;

    if (!name || !login_url || !marksheet_url) {
      return res.status(400).json({ error: 'Name, Login URL, and Marksheet URL are required.' });
    }

    const result = portalQueries.create.run(
      req.session.userId,
      name.trim(),
      login_url.trim(),
      marksheet_url.trim(),
      (logout_url || '').trim(),
      (username_selector || '#username').trim(),
      (password_selector || '#password').trim(),
      (submit_selector || 'input[type="submit"]').trim(),
      (default_password || '').trim(),
      JSON.stringify(semesters || ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'])
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create portal error:', err);
    res.status(500).json({ error: 'Failed to create portal.' });
  }
});

// ─── UPDATE PORTAL ───
router.put('/:id', (req, res) => {
  try {
    const { name, login_url, marksheet_url, logout_url, username_selector, password_selector, submit_selector, default_password, semesters } = req.body;

    if (!name || !login_url || !marksheet_url) {
      return res.status(400).json({ error: 'Name, Login URL, and Marksheet URL are required.' });
    }

    const result = portalQueries.update.run(
      name.trim(),
      login_url.trim(),
      marksheet_url.trim(),
      (logout_url || '').trim(),
      (username_selector || '#username').trim(),
      (password_selector || '#password').trim(),
      (submit_selector || 'input[type="submit"]').trim(),
      (default_password || '').trim(),
      JSON.stringify(semesters || []),
      parseInt(req.params.id),
      req.session.userId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Portal not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update portal error:', err);
    res.status(500).json({ error: 'Failed to update portal.' });
  }
});

// ─── DELETE PORTAL ───
router.delete('/:id', (req, res) => {
  const result = portalQueries.delete.run(parseInt(req.params.id), req.session.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Portal not found.' });
  }
  res.json({ success: true });
});

module.exports = router;
