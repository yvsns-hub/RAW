const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ════════════════════════════════════════════════════════
//  CREATE TABLES
// ════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    login_url TEXT NOT NULL,
    marksheet_url TEXT NOT NULL,
    logout_url TEXT DEFAULT '',
    username_selector TEXT DEFAULT '#MainContent_UserName',
    password_selector TEXT DEFAULT '#MainContent_Password',
    submit_selector TEXT DEFAULT 'input[type="submit"]',
    default_password TEXT DEFAULT '',
    semesters TEXT DEFAULT '["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"]',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    portal_id INTEGER,
    portal_name TEXT DEFAULT '',
    semester TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    headless INTEGER DEFAULT 1,
    total_students INTEGER DEFAULT 0,
    completed_students INTEGER DEFAULT 0,
    pass_count INTEGER DEFAULT 0,
    backlog_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    mismatch_count INTEGER DEFAULT 0,
    students_input TEXT DEFAULT '[]',
    results_data TEXT DEFAULT '[]',
    excel_path TEXT DEFAULT '',
    elapsed TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (portal_id) REFERENCES portals(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('adsense_enabled', 'false');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('adsense_script', '');

`);

// ─── Migration: add new columns to existing DBs safely ───
try { db.exec(`ALTER TABLE portals ADD COLUMN default_password TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`); } catch(e) {}

// ─── Migration: fix portals that were saved with wrong default selectors ───
// If a portal was saved when the UI defaulted to #username/#password (a bug),
// correct them to the proper KIET-style selectors.
try {
  db.exec(`
    UPDATE portals
    SET username_selector = '#MainContent_UserName'
    WHERE username_selector = '#username' OR username_selector = '' OR username_selector IS NULL
  `);
  db.exec(`
    UPDATE portals
    SET password_selector = '#MainContent_Password'
    WHERE password_selector = '#password' OR password_selector = '' OR password_selector IS NULL
  `);
  db.exec(`
    UPDATE portals
    SET submit_selector = 'input[type="submit"]'
    WHERE submit_selector = 'input[type=submit]' OR submit_selector = '' OR submit_selector IS NULL
  `);
} catch(e) { console.warn('Selector migration warning:', e.message); }

// ════════════════════════════════════════════════════════
//  SEED DEFAULT PORTAL (KIET)
// ════════════════════════════════════════════════════════
const kietExists = db.prepare(`SELECT id FROM portals WHERE name = 'KIET Group of Institutions' LIMIT 1`).get();
// We'll seed KIET for the first user who signs up

// ════════════════════════════════════════════════════════
//  USER HELPERS
// ════════════════════════════════════════════════════════
const userQueries = {
  create: db.prepare(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`),
  findByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findById: db.prepare(`SELECT id, username, email, role, created_at FROM users WHERE id = ?`),
  findAll: db.prepare(`SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC`),
  delete: db.prepare(`DELETE FROM users WHERE id = ?`),
};

// ════════════════════════════════════════════════════════
//  PORTAL HELPERS
// ════════════════════════════════════════════════════════
const portalQueries = {
  create: db.prepare(`
    INSERT INTO portals (user_id, name, login_url, marksheet_url, logout_url, username_selector, password_selector, submit_selector, default_password, semesters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findByUser: db.prepare(`SELECT * FROM portals WHERE user_id = ? ORDER BY created_at DESC`),
  findById: db.prepare(`SELECT * FROM portals WHERE id = ? AND user_id = ?`),
  update: db.prepare(`
    UPDATE portals SET name=?, login_url=?, marksheet_url=?, logout_url=?, username_selector=?, password_selector=?, submit_selector=?, default_password=?, semesters=?
    WHERE id=? AND user_id=?
  `),
  delete: db.prepare(`DELETE FROM portals WHERE id = ? AND user_id = ?`),
};

// ════════════════════════════════════════════════════════
//  JOB HELPERS
// ════════════════════════════════════════════════════════
const jobQueries = {
  create: db.prepare(`
    INSERT INTO jobs (user_id, portal_id, portal_name, semester, headless, total_students, students_input)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  findByUser: db.prepare(`SELECT id, portal_name, semester, status, total_students, completed_students, pass_count, backlog_count, error_count, mismatch_count, elapsed, excel_path, created_at, completed_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`),
  findById: db.prepare(`SELECT * FROM jobs WHERE id = ?`),
  updateProgress: db.prepare(`UPDATE jobs SET completed_students=?, pass_count=?, backlog_count=?, error_count=?, mismatch_count=? WHERE id=?`),
  complete: db.prepare(`UPDATE jobs SET status='completed', completed_students=?, pass_count=?, backlog_count=?, error_count=?, mismatch_count=?, results_data=?, excel_path=?, elapsed=?, completed_at=datetime('now') WHERE id=?`),
  fail: db.prepare(`UPDATE jobs SET status='failed', elapsed=?, completed_at=datetime('now') WHERE id=?`),
  deleteJob: db.prepare(`DELETE FROM jobs WHERE id = ? AND user_id = ?`),
};


function seedKIETPortal(userId) {
  const existing = db.prepare(`SELECT id FROM portals WHERE user_id = ? AND name = 'KIET Group of Institutions' LIMIT 1`).get(userId);
  if (!existing) {
    portalQueries.create.run(
      userId,
      'KIET Group of Institutions',
      'https://www.kietgroup.info/Account/Login',
      'https://www.kietgroup.info/Student/MarkSheet.aspx',
      'https://www.kietgroup.info/Account/Logout.aspx',
      '#MainContent_UserName',
      '#MainContent_Password',
      'input[type="submit"]',
      JSON.stringify(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'])
    );
  }
}

// ════════════════════════════════════════════════════════
//  SETTINGS HELPERS
// ════════════════════════════════════════════════════════
const settingsQueries = {
  get: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  set: db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`),
  getAll: db.prepare(`SELECT * FROM settings`),
};

module.exports = { db, userQueries, portalQueries, jobQueries, settingsQueries, seedKIETPortal };

