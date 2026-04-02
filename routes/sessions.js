var express = require('express');
var router = express.Router();
var db = require('../db');
var fs = require('fs');
var path = require('path');

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// GET all sessions
router.get('/', function(req, res) {
  var rows = db.prepare('SELECT * FROM sessions ORDER BY date DESC, created_at DESC').all();
  res.json(rows);
});

// GET one session
router.get('/:id', function(req, res) {
  var row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST create session
router.post('/', function(req, res) {
  var b = req.body;
  var id = genId();
  db.prepare(
    'INSERT INTO sessions (id, date, type, duration, intensity, focus, rating, score, notes, video_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, b.date, b.type, b.duration, b.intensity || 'medium', b.focus || '', b.rating || 0, b.score || '', b.notes || '', b.videoCount || 0);
  var session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  res.json(session);
});

// PUT update session
router.put('/:id', function(req, res) {
  var existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  var b = req.body;
  db.prepare(
    'UPDATE sessions SET date=?, type=?, duration=?, intensity=?, focus=?, rating=?, score=?, notes=?, video_count=? WHERE id=?'
  ).run(
    b.date !== undefined ? b.date : existing.date,
    b.type !== undefined ? b.type : existing.type,
    b.duration !== undefined ? b.duration : existing.duration,
    b.intensity !== undefined ? b.intensity : existing.intensity,
    b.focus !== undefined ? b.focus : existing.focus,
    b.rating !== undefined ? b.rating : existing.rating,
    b.score !== undefined ? b.score : existing.score,
    b.notes !== undefined ? b.notes : existing.notes,
    b.video_count !== undefined ? b.video_count : (b.videoCount !== undefined ? b.videoCount : existing.video_count),
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id));
});

// DELETE session (cascade deletes videos from DB; we also remove files)
router.delete('/:id', function(req, res) {
  var videos = db.prepare('SELECT filename FROM videos WHERE session_id = ?').all(req.params.id);
  videos.forEach(function(v) {
    var fp = path.join(__dirname, '..', 'uploads', v.filename);
    try { fs.unlinkSync(fp); } catch(e) {}
  });
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
