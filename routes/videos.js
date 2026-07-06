var express = require('express');
var router = express.Router();
var multer = require('multer');
var path = require('path');
var fs = require('fs');
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

var storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname) || '.mp4';
    cb(null, genId() + ext);
  }
});

var upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  }
});

function toClient(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    name: row.name,
    title: row.title,
    size: row.size,
    mime_type: row.mime_type,
    filename: row.filename,
    duration: row.duration,
    sort_order: row.sort_order,
    url: '/uploads/' + row.filename,
    created_at: row.created_at
  };
}

// GET videos (optionally filtered by sessionId)
router.get('/', async function(req, res) {
  var rows;
  if (req.query.sessionId) {
    [rows] = await db.pool.execute('SELECT * FROM videos WHERE session_id = ? ORDER BY sort_order ASC, created_at ASC', [req.query.sessionId]);
  } else {
    [rows] = await db.pool.execute('SELECT * FROM videos ORDER BY sort_order ASC, created_at ASC');
  }
  res.json(rows.map(toClient));
});

// GET one
router.get('/:id', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(toClient(rows[0]));
});

// POST upload videos (multipart, field name "videos")
router.post('/', requireAdmin, upload.array('videos', 20), async function(req, res) {
  var sessionId = req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  // Continue sort order after any videos already attached to this session.
  var [maxRows] = await db.pool.execute('SELECT COALESCE(MAX(sort_order), -1) AS m FROM videos WHERE session_id = ?', [sessionId]);
  var nextOrder = maxRows[0].m + 1;

  var results = [];
  for (var i = 0; i < req.files.length; i++) {
    var file = req.files[i];
    var id = genId();
    var title = stripExt(file.originalname);
    await db.pool.execute(
      'INSERT INTO videos (id, session_id, name, title, size, mime_type, filename, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sessionId, file.originalname, title, file.size, file.mimetype, file.filename, nextOrder + i]
    );
    var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [id]);
    results.push(toClient(rows[0]));
  }

  // Update cached video count
  var [countRows] = await db.pool.execute('SELECT COUNT(*) as c FROM videos WHERE session_id = ?', [sessionId]);
  await db.pool.execute('UPDATE sessions SET video_count = ? WHERE id = ?', [countRows[0].c, sessionId]);

  res.json(results);
});

// PUT update video (rename / reorder)
router.put('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var existing = rows[0];
  var b = req.body;
  await db.pool.execute('UPDATE videos SET title=?, sort_order=? WHERE id=?', [
    b.title !== undefined ? b.title : existing.title,
    b.sortOrder !== undefined ? b.sortOrder : existing.sort_order,
    req.params.id
  ]);
  var [updated] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [req.params.id]);
  res.json(toClient(updated[0]));
});

// DELETE one video
router.delete('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var video = rows[0];

  // Remove file from disk
  var fp = path.join(__dirname, '..', 'uploads', video.filename);
  try { fs.unlinkSync(fp); } catch(e) {}

  await db.pool.execute('DELETE FROM videos WHERE id = ?', [req.params.id]);

  // Update cached video count
  var [countRows] = await db.pool.execute('SELECT COUNT(*) as c FROM videos WHERE session_id = ?', [video.session_id]);
  await db.pool.execute('UPDATE sessions SET video_count = ? WHERE id = ?', [countRows[0].c, video.session_id]);

  res.json({ ok: true });
});

// Surface multer/upload errors (bad type, too large) as clean JSON.
router.use(function(err, req, res, next) {
  if (!err) return next();
  var msg = err.message || 'Upload failed';
  if (err.code === 'LIMIT_FILE_SIZE') msg = 'File too large (max 2 GB)';
  res.status(400).json({ error: msg });
});

module.exports = router;
