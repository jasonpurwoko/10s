var express = require('express');
var router = express.Router();
var multer = require('multer');
var path = require('path');
var fs = require('fs');
var db = require('../db');

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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  }
});

// GET videos (optionally filtered by sessionId)
router.get('/', function(req, res) {
  if (req.query.sessionId) {
    res.json(db.prepare('SELECT * FROM videos WHERE session_id = ? ORDER BY created_at DESC').all(req.query.sessionId));
  } else {
    res.json(db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all());
  }
});

// POST upload videos
router.post('/', upload.array('videos', 20), function(req, res) {
  var sessionId = req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  var insert = db.prepare(
    'INSERT INTO videos (id, session_id, name, size, mime_type, filename) VALUES (?, ?, ?, ?, ?, ?)'
  );

  var results = [];
  var tx = db.transaction(function(files) {
    files.forEach(function(file) {
      var id = genId();
      insert.run(id, sessionId, file.originalname, file.size, file.mimetype, file.filename);
      results.push({
        id: id,
        session_id: sessionId,
        name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
        filename: file.filename
      });
    });
  });
  tx(req.files);

  // Update video count
  var count = db.prepare('SELECT COUNT(*) as c FROM videos WHERE session_id = ?').get(sessionId).c;
  db.prepare('UPDATE sessions SET video_count = ? WHERE id = ?').run(count, sessionId);

  res.json(results);
});

// DELETE one video
router.delete('/:id', function(req, res) {
  var video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Not found' });

  // Remove file
  var fp = path.join(__dirname, '..', 'uploads', video.filename);
  try { fs.unlinkSync(fp); } catch(e) {}

  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);

  // Update video count
  var count = db.prepare('SELECT COUNT(*) as c FROM videos WHERE session_id = ?').get(video.session_id).c;
  db.prepare('UPDATE sessions SET video_count = ? WHERE id = ?').run(count, video.session_id);

  res.json({ ok: true });
});

module.exports = router;
