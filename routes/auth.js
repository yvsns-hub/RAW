const express = require('express');
const bcrypt = require('bcryptjs');
const { userQueries, seedKIETPortal } = require('../db/database');

const router = express.Router();

// ─── SIGNUP ───
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    // Check if email already exists
    const existing = userQueries.findByEmail.get(email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = userQueries.create.run(username.trim(), email.toLowerCase().trim(), hash, 'user');

    // Seed KIET portal for the new user
    seedKIETPortal(result.lastInsertRowid);

    // Auto-login after signup
    req.session.userId = result.lastInsertRowid;

    res.json({
      success: true,
      user: { id: result.lastInsertRowid, username: username.trim(), email: email.toLowerCase().trim(), role: 'user' }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// ─── LOGIN ───
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = userQueries.findByEmail.get(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.id;

    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// ─── LOGOUT ───
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ─── GET CURRENT USER ───
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null }); // 200 OK with null — no red console errors
  }
  const user = userQueries.findById.get(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  res.json({ user });
});

module.exports = router;
