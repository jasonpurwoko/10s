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

var storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname) || '.mp4';
    cb(null, genId() + ext);
  }
});

var upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  }
});

// GET videos (optionally filtered by sessionId)
router.get('/', async function(req, res) {
  if (req.query.sessionId) {
    var [rows] = await db.pool.execute('SELECT * FROM videos WHERE session_id = ? ORDER BY created_at DESC', [req.query.sessionId]);
    res.json(rows);
  } else {
    var [rows] = await db.pool.execute('SELECT * FROM videos ORDER BY created_at DESC');
    res.json(rows);
  }
});

// POST upload videos
router.post('/', requireAdmin, upload.array('videos', 20), async function(req, res) {
  var sessionId = req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  var results = [];
  for (var i = 0; i < req.files.length; i++) {
    var file = req.files[i];
    var id = genId();
    await db.pool.execute(
      'INSERT INTO videos (id, session_id, name, size, mime_type, filename) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sessionId, file.originalname, file.size, file.mimetype, file.filename]
    );
    results.push({
      id: id,
      session_id: sessionId,
      name: file.originalname,
      size: file.size,
      mime_type: file.mimetype,
      filename: file.filename
    });
  }

  // Update video count
  var [countRows] = await db.pool.execute('SELECT COUNT(*) as c FROM videos WHERE session_id = ?', [sessionId]);
  await db.pool.execute('UPDATE sessions SET video_count = ? WHERE id = ?', [countRows[0].c, sessionId]);

  res.json(results);
});

// DELETE one video
router.delete('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var video = rows[0];

  // Remove file
  var fp = path.join(__dirname, '..', 'uploads', video.filename);
  try { fs.unlinkSync(fp); } catch(e) {}

  await db.pool.execute('DELETE FROM videos WHERE id = ?', [req.params.id]);

  // Update video count
  var [countRows] = await db.pool.execute('SELECT COUNT(*) as c FROM videos WHERE session_id = ?', [video.session_id]);
  await db.pool.execute('UPDATE sessions SET video_count = ? WHERE id = ?', [countRows[0].c, video.session_id]);

  res.json({ ok: true });
});

module.exports = router;
