var express = require('express');
var router = express.Router();
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseYouTubeId(url) {
  var match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// GET all youtube videos (optionally by sessionId)
router.get('/', function(req, res) {
  if (req.query.sessionId) {
    res.json(db.prepare('SELECT * FROM youtube_videos WHERE session_id = ? ORDER BY created_at DESC').all(req.query.sessionId));
  } else {
    res.json(db.prepare('SELECT * FROM youtube_videos ORDER BY created_at DESC').all());
  }
});

// GET one
router.get('/:id', function(req, res) {
  var row = db.prepare('SELECT * FROM youtube_videos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST create
router.post('/', requireAdmin, function(req, res) {
  var b = req.body;
  var ytId = parseYouTubeId(b.url || '');
  if (!ytId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  var id = genId();
  db.prepare(
    'INSERT INTO youtube_videos (id, url, youtube_id, title, session_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, b.url, ytId, b.title || '', b.sessionId || null);
  res.json(db.prepare('SELECT * FROM youtube_videos WHERE id = ?').get(id));
});

// PUT update
router.put('/:id', requireAdmin, function(req, res) {
  var existing = db.prepare('SELECT * FROM youtube_videos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  var b = req.body;
  db.prepare('UPDATE youtube_videos SET title=?, session_id=? WHERE id=?').run(
    b.title !== undefined ? b.title : existing.title,
    b.sessionId !== undefined ? b.sessionId : existing.session_id,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM youtube_videos WHERE id = ?').get(req.params.id));
});

// DELETE
router.delete('/:id', requireAdmin, function(req, res) {
  db.prepare('DELETE FROM youtube_videos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
