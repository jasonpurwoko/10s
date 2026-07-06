var express = require('express');
var router = express.Router();
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

var CLIP_SELECT = 'SELECT c.*, v.filename, v.name AS video_name, v.title AS video_title FROM clips c JOIN videos v ON c.video_id = v.id';

// GET all clips (optionally by videoId)
router.get('/', async function(req, res) {
  var sql = CLIP_SELECT;
  if (req.query.videoId) {
    sql += ' WHERE c.video_id = ? ORDER BY c.created_at DESC';
    var [rows] = await db.pool.execute(sql, [req.query.videoId]);
    res.json(rows);
  } else {
    sql += ' ORDER BY c.created_at DESC';
    var [rows] = await db.pool.execute(sql);
    res.json(rows);
  }
});

// GET one clip
router.get('/:id', async function(req, res) {
  var [rows] = await db.pool.execute(CLIP_SELECT + ' WHERE c.id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// POST create clip (public)
router.post('/', async function(req, res) {
  var b = req.body;
  if (!b.videoId || b.startTime === undefined || b.endTime === undefined || !b.title) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (b.startTime >= b.endTime) {
    return res.status(400).json({ error: 'Start time must be before end time' });
  }
  var [vRows] = await db.pool.execute('SELECT id FROM videos WHERE id = ?', [b.videoId]);
  if (!vRows.length) return res.status(400).json({ error: 'Video not found' });

  var id = genId();
  await db.pool.execute(
    'INSERT INTO clips (id, video_id, title, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [id, b.videoId, b.title, b.startTime, b.endTime, b.notes || '']
  );

  var [rows] = await db.pool.execute(CLIP_SELECT + ' WHERE c.id = ?', [id]);
  res.json(rows[0]);
});

// PUT update clip
router.put('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM clips WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var existing = rows[0];
  var b = req.body;
  await db.pool.execute('UPDATE clips SET title=?, start_time=?, end_time=?, notes=? WHERE id=?', [
    b.title !== undefined ? b.title : existing.title,
    b.startTime !== undefined ? b.startTime : existing.start_time,
    b.endTime !== undefined ? b.endTime : existing.end_time,
    b.notes !== undefined ? b.notes : existing.notes,
    req.params.id
  ]);
  var [updated] = await db.pool.execute(CLIP_SELECT + ' WHERE c.id = ?', [req.params.id]);
  res.json(updated[0]);
});

// DELETE clip
router.delete('/:id', requireAdmin, async function(req, res) {
  await db.pool.execute('DELETE FROM clips WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// --- Comments ---

// GET comments for a clip
router.get('/:id/comments', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM clip_comments WHERE clip_id = ? ORDER BY created_at ASC', [req.params.id]);
  res.json(rows);
});

// POST add comment (public — requires author name)
router.post('/:id/comments', async function(req, res) {
  var b = req.body;
  if (!b.text) return res.status(400).json({ error: 'text required' });
  if (!b.author || !b.author.trim()) return res.status(400).json({ error: 'author required' });
  var [result] = await db.pool.execute('INSERT INTO clip_comments (clip_id, text, author) VALUES (?, ?, ?)', [req.params.id, b.text, b.author.trim()]);
  var [rows] = await db.pool.execute('SELECT * FROM clip_comments WHERE id = ?', [result.insertId]);
  res.json(rows[0]);
});

// DELETE a comment
router.delete('/:clipId/comments/:commentId', requireAdmin, async function(req, res) {
  await db.pool.execute('DELETE FROM clip_comments WHERE id = ? AND clip_id = ?', [req.params.commentId, req.params.clipId]);
  res.json({ ok: true });
});

module.exports = router;
