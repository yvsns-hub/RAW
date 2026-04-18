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
    const existing = await userQueries.findByEmail.get(email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await userQueries.create.run(username.trim(), email.toLowerCase().trim(), hash, 'user');
    
    // In @libsql/client, the insert ID is BigInt, convert to number
    const userId = Number(result.lastInsertRowid);

    // Seed KIET portal for the new user
    await seedKIETPortal(userId);

    // Auto-login after signup
    req.session.userId = userId;

    res.json({
      success: true,
      user: { id: userId, username: username.trim(), email: email.toLowerCase().trim(), role: 'user' }
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

    const user = await userQueries.findByEmail.get(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = Number(user.id);

    res.json({
      success: true,
      user: { id: Number(user.id), username: user.username, email: user.email, role: user.role }
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
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null }); // 200 OK with null — no red console errors
  }
  const user = await userQueries.findById.get(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  // Convert BigInt id to Number if necessary
  user.id = Number(user.id);
  res.json({ user });
});

module.exports = router;
