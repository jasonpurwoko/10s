var crypto = require('crypto');

var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

var adminToken = ADMIN_PASSWORD
  ? crypto.createHmac('sha256', ADMIN_PASSWORD).update('10s-admin').digest('hex')
  : '';

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(403).json({ error: 'Admin not configured' });
  if (req.cookies && req.cookies['10s_admin'] === adminToken) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = { requireAdmin: requireAdmin, adminToken: adminToken, ADMIN_PASSWORD: ADMIN_PASSWORD };
