const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

// ─── CONNECTION SETUP ───
// On Render, we use Turso (Cloud SQLite). Locally, we can still use a file.
const isProduction = process.env.NODE_ENV === 'production' || process.env.TURSO_DATABASE_URL;

const config = {
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'data', 'database.sqlite')}`,
  authToken: process.env.TURSO_AUTH_TOKEN || null,
};

console.log(`🗄️ Database: Connecting to ${config.url.startsWith('file:') ? 'Local SQLite' : 'Turso Cloud'}`);

const client = createClient(config);

// ─── INITIALIZATION ───
async function initDB() {
  // Ensure local data directory exists if using file
  if (config.url.startsWith('file:')) {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create Tables
  await client.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS portals (
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
    )`,
    `CREATE TABLE IF NOT EXISTS jobs (
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
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('adsense_enabled', 'false')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('adsense_script', '')`
  ], "write");

  // Migrations
  try { await client.execute(`ALTER TABLE portals ADD COLUMN default_password TEXT DEFAULT ''`); } catch(e) {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`); } catch(e) {}

  // Selector Cleanup
  try {
    await client.execute(`UPDATE portals SET username_selector = '#MainContent_UserName' WHERE username_selector IN ('#username', '', NULL)`);
    await client.execute(`UPDATE portals SET password_selector = '#MainContent_Password' WHERE password_selector IN ('#password', '', NULL)`);
    await client.execute(`UPDATE portals SET submit_selector = 'input[type="submit"]' WHERE submit_selector IN ('input[type=submit]', '', NULL)`);
  } catch(e) {}
}

// ─── QUERY HELPERS (Async) ───
// These helpers wrap the LibSQL client to provide a cleaner API
const userQueries = {
  create: {
    run: (username, email, hash, role) => client.execute({
      sql: `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      args: [username, email, hash, role]
    })
  },
  findByEmail: {
    get: async (email) => {
      const rs = await client.execute({ sql: `SELECT * FROM users WHERE email = ?`, args: [email] });
      return rs.rows[0];
    }
  },
  findById: {
    get: async (id) => {
      const rs = await client.execute({ sql: `SELECT id, username, email, role, created_at FROM users WHERE id = ?`, args: [id] });
      return rs.rows[0];
    }
  },
  findAll: {
    all: async () => {
      const rs = await client.execute(`SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC`);
      return rs.rows;
    }
  },
  delete: {
    run: (id) => client.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [id] })
  }
};

const portalQueries = {
  create: {
    run: (userId, name, login, marks, logout, uSel, pSel, sSel, defPass, sems) => client.execute({
      sql: `INSERT INTO portals (user_id, name, login_url, marksheet_url, logout_url, username_selector, password_selector, submit_selector, default_password, semesters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, name, login, marks, logout, uSel, pSel, sSel, defPass, sems]
    })
  },
  findByUser: {
    all: async (userId) => {
      const rs = await client.execute({ sql: `SELECT * FROM portals WHERE user_id = ? ORDER BY created_at DESC`, args: [userId] });
      return rs.rows;
    }
  },
  findById: {
    get: async (id, userId) => {
      const rs = await client.execute({ sql: `SELECT * FROM portals WHERE id = ? AND user_id = ?`, args: [id, userId] });
      return rs.rows[0];
    }
  },
  update: {
    run: (name, login, marks, logout, uSel, pSel, sSel, defPass, sems, id, userId) => client.execute({
      sql: `UPDATE portals SET name=?, login_url=?, marksheet_url=?, logout_url=?, username_selector=?, password_selector=?, submit_selector=?, default_password=?, semesters=? WHERE id=? AND user_id=?`,
      args: [name, login, marks, logout, uSel, pSel, sSel, defPass, sems, id, userId]
    })
  },
  delete: {
    run: (id, userId) => client.execute({ sql: `DELETE FROM portals WHERE id = ? AND user_id = ?`, args: [id, userId] })
  }
};

const jobQueries = {
  create: {
    run: async (userId, portalId, portalName, semester, headless, total, input) => {
      return client.execute({
        sql: `INSERT INTO jobs (user_id, portal_id, portal_name, semester, headless, total_students, students_input) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, portalId, portalName, semester, headless, total, input]
      });
    }
  },
  findByUser: {
    all: async (userId) => {
      const rs = await client.execute({ sql: `SELECT id, portal_name, semester, status, total_students, completed_students, pass_count, backlog_count, error_count, mismatch_count, elapsed, excel_path, created_at, completed_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, args: [userId] });
      return rs.rows;
    }
  },
  findById: {
    get: async (id) => {
      const rs = await client.execute({ sql: `SELECT * FROM jobs WHERE id = ?`, args: [id] });
      return rs.rows[0];
    }
  },
  updateProgress: {
    run: (completed, passed, backlogs, errors, mismatch, jobId) => client.execute({
      sql: `UPDATE jobs SET completed_students=?, pass_count=?, backlog_count=?, error_count=?, mismatch_count=? WHERE id=?`,
      args: [completed, passed, backlogs, errors, mismatch, jobId]
    })
  },
  complete: {
    run: (completed, passed, backlogs, errors, mismatch, data, path, elapsed, jobId) => client.execute({
      sql: `UPDATE jobs SET status='completed', completed_students=?, pass_count=?, backlog_count=?, error_count=?, mismatch_count=?, results_data=?, excel_path=?, elapsed=?, completed_at=datetime('now') WHERE id=?`,
      args: [completed, passed, backlogs, errors, mismatch, data, path, elapsed, jobId]
    })
  },
  fail: {
    run: (elapsed, jobId) => client.execute({
      sql: `UPDATE jobs SET status='failed', elapsed=?, completed_at=datetime('now') WHERE id=?`,
      args: [elapsed, jobId]
    })
  },
  deleteJob: {
    run: (id, userId) => client.execute({ sql: `DELETE FROM jobs WHERE id = ? AND user_id = ?`, args: [id, userId] })
  },
  updateExcelPath: {
    run: (excelPath, jobId) => client.execute({
      sql: `UPDATE jobs SET excel_path = ? WHERE id = ?`,
      args: [excelPath, jobId]
    })
  }
};

const settingsQueries = {
  get: async (key) => {
    const rs = await client.execute({ sql: `SELECT value FROM settings WHERE key = ?`, args: [key] });
    return rs.rows[0];
  },
  set: {
    run: (key, value) => client.execute({
      sql: `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      args: [key, value]
    })
  },
  getAll: {
    all: async () => {
      const rs = await client.execute(`SELECT * FROM settings`);
      return rs.rows;
    }
  }
};

async function seedKIETPortal(userId) {
  const rs = await client.execute({ sql: `SELECT id FROM portals WHERE user_id = ? AND name = 'KIET Group of Institutions' LIMIT 1`, args: [userId] });
  if (rs.rows.length === 0) {
    await portalQueries.create.run(
      userId,
      'KIET Group of Institutions',
      'https://www.kietgroup.info/Account/Login',
      'https://www.kietgroup.info/Student/MarkSheet.aspx',
      'https://www.kietgroup.info/Account/Logout.aspx',
      '#MainContent_UserName',
      '#MainContent_Password',
      'input[type="submit"]',
      '',
      JSON.stringify(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'])
    );
  }
}

module.exports = { initDB, client, userQueries, portalQueries, jobQueries, settingsQueries, seedKIETPortal };
