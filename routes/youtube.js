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
router.get('/', async function(req, res) {
  if (req.query.sessionId) {
    var [rows] = await db.pool.execute('SELECT * FROM youtube_videos WHERE session_id = ? ORDER BY sort_order ASC, created_at ASC', [req.query.sessionId]);
    res.json(rows);
  } else {
    var [rows] = await db.pool.execute('SELECT * FROM youtube_videos ORDER BY sort_order ASC, created_at ASC');
    res.json(rows);
  }
});

// GET one
router.get('/:id', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM youtube_videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// POST create
router.post('/', requireAdmin, async function(req, res) {
  var b = req.body;
  var ytId = parseYouTubeId(b.url || '');
  if (!ytId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  var id = genId();
  await db.pool.execute(
    'INSERT INTO youtube_videos (id, url, youtube_id, title, session_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [id, b.url, ytId, b.title || '', b.sessionId || null, b.sortOrder || 0]
  );
  var [rows] = await db.pool.execute('SELECT * FROM youtube_videos WHERE id = ?', [id]);
  res.json(rows[0]);
});

// PUT update
router.put('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM youtube_videos WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var existing = rows[0];
  var b = req.body;
  await db.pool.execute('UPDATE youtube_videos SET title=?, session_id=?, sort_order=? WHERE id=?', [
    b.title !== undefined ? b.title : existing.title,
    b.sessionId !== undefined ? b.sessionId : existing.session_id,
    b.sortOrder !== undefined ? b.sortOrder : existing.sort_order,
    req.params.id
  ]);
  var [updated] = await db.pool.execute('SELECT * FROM youtube_videos WHERE id = ?', [req.params.id]);
  res.json(updated[0]);
});

// DELETE
router.delete('/:id', requireAdmin, async function(req, res) {
  await db.pool.execute('DELETE FROM youtube_videos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
