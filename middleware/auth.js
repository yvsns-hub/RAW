const { userQueries } = require('../db/database');

// Auth middleware — checks if user is logged in via session
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated. Please login.' });
}

// Admin middleware — checks if logged in user is an admin
async function requireAdmin(req, res, next) {
  if (req.session && req.session.userId) {
    const user = await userQueries.findById.get(req.session.userId);
    if (user && user.role === 'admin') {
      return next();
    }
  }
  return res.status(403).json({ error: 'Forbidden. Admin access required.' });
}

module.exports = { requireAuth, requireAdmin };
