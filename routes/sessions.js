var express = require('express');
var router = express.Router();
var db = require('../db');
var fs = require('fs');
var path = require('path');
var requireAdmin = require('../middleware/auth').requireAdmin;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// GET all sessions
router.get('/', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM sessions ORDER BY date DESC, created_at DESC');
  res.json(rows);
});

// GET one session
router.get('/:id', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// POST create session
router.post('/', requireAdmin, async function(req, res) {
  var b = req.body;
  var id = genId();
  await db.pool.execute(
    'INSERT INTO sessions (id, date, type, duration, intensity, focus, rating, score, notes, video_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, b.date, b.type, b.duration, b.intensity || 'medium', b.focus || '', b.rating || 0, b.score || '', b.notes || '', b.videoCount || 0]
  );
  var [rows] = await db.pool.execute('SELECT * FROM sessions WHERE id = ?', [id]);
  res.json(rows[0]);
});

// PUT update session
router.put('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var existing = rows[0];

  var b = req.body;
  await db.pool.execute(
    'UPDATE sessions SET date=?, type=?, duration=?, intensity=?, focus=?, rating=?, score=?, notes=?, video_count=? WHERE id=?',
    [
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
    ]
  );
  var [updated] = await db.pool.execute('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  res.json(updated[0]);
});

// DELETE session
router.delete('/:id', requireAdmin, async function(req, res) {
  var [videos] = await db.pool.execute('SELECT filename FROM videos WHERE session_id = ?', [req.params.id]);
  videos.forEach(function(v) {
    var fp = path.join(__dirname, '..', 'uploads', v.filename);
    try { fs.unlinkSync(fp); } catch(e) {}
  });
  await db.pool.execute('DELETE FROM sessions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
