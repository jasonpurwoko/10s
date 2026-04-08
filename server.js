var express = require('express');
var path = require('path');
var fs = require('fs');
var cookieParser = require('cookie-parser');
var auth = require('./middleware/auth');

var app = express();
var PORT = process.env.PORT || 3000;

// Ensure uploads dir
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth endpoints
app.post('/api/auth/login', function(req, res) {
  var password = req.body.password;
  if (!auth.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured' });
  if (password !== auth.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  res.cookie('10s_admin', auth.adminToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', function(req, res) {
  res.clearCookie('10s_admin', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/status', function(req, res) {
  var isAdmin = !!(auth.ADMIN_PASSWORD && req.cookies && req.cookies['10s_admin'] === auth.adminToken);
  res.json({ isAdmin: isAdmin });
});

// Routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/clips', require('./routes/clips'));

var db = require('./db');
db.init().then(function() {
  app.listen(PORT, function() {
    console.log('10s server running on http://localhost:' + PORT);
  });
}).catch(function(err) {
  console.error('Warning: Failed to initialize database:', err.message || err);
  console.log('Starting server without database connection...');
  app.listen(PORT, function() {
    console.log('10s server running on http://localhost:' + PORT + ' (no database)');
  });
});
