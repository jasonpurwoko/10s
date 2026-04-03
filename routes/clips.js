var express = require('express');
var router = express.Router();
var db = require('../db');

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// GET all clips (optionally by youtubeVideoId)
router.get('/', function(req, res) {
  var sql = 'SELECT c.*, y.youtube_id, y.title as video_title, y.url as video_url FROM clips c JOIN youtube_videos y ON c.youtube_video_id = y.id';
  if (req.query.youtubeVideoId) {
    sql += ' WHERE c.youtube_video_id = ?';
    sql += ' ORDER BY c.created_at DESC';
    res.json(db.prepare(sql).all(req.query.youtubeVideoId));
  } else {
    sql += ' ORDER BY c.created_at DESC';
    res.json(db.prepare(sql).all());
  }
});

// GET one clip
router.get('/:id', function(req, res) {
  var row = db.prepare(
    'SELECT c.*, y.youtube_id, y.title as video_title, y.url as video_url FROM clips c JOIN youtube_videos y ON c.youtube_video_id = y.id WHERE c.id = ?'
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST create clip
router.post('/', function(req, res) {
  var b = req.body;
  if (!b.youtubeVideoId || b.startTime === undefined || b.endTime === undefined || !b.title) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (b.startTime >= b.endTime) {
    return res.status(400).json({ error: 'Start time must be before end time' });
  }
  var yt = db.prepare('SELECT id FROM youtube_videos WHERE id = ?').get(b.youtubeVideoId);
  if (!yt) return res.status(400).json({ error: 'YouTube video not found' });

  var id = genId();
  db.prepare(
    'INSERT INTO clips (id, youtube_video_id, title, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, b.youtubeVideoId, b.title, b.startTime, b.endTime, b.notes || '');

  var row = db.prepare(
    'SELECT c.*, y.youtube_id, y.title as video_title FROM clips c JOIN youtube_videos y ON c.youtube_video_id = y.id WHERE c.id = ?'
  ).get(id);
  res.json(row);
});

// PUT update clip
router.put('/:id', function(req, res) {
  var existing = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  var b = req.body;
  db.prepare('UPDATE clips SET title=?, start_time=?, end_time=?, notes=? WHERE id=?').run(
    b.title !== undefined ? b.title : existing.title,
    b.startTime !== undefined ? b.startTime : existing.start_time,
    b.endTime !== undefined ? b.endTime : existing.end_time,
    b.notes !== undefined ? b.notes : existing.notes,
    req.params.id
  );
  var row = db.prepare(
    'SELECT c.*, y.youtube_id, y.title as video_title FROM clips c JOIN youtube_videos y ON c.youtube_video_id = y.id WHERE c.id = ?'
  ).get(req.params.id);
  res.json(row);
});

// DELETE clip
router.delete('/:id', function(req, res) {
  db.prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Comments ---

// GET comments for a clip
router.get('/:id/comments', function(req, res) {
  res.json(db.prepare('SELECT * FROM clip_comments WHERE clip_id = ? ORDER BY created_at ASC').all(req.params.id));
});

// POST add comment
router.post('/:id/comments', function(req, res) {
  var b = req.body;
  if (!b.text) return res.status(400).json({ error: 'text required' });
  var result = db.prepare('INSERT INTO clip_comments (clip_id, text) VALUES (?, ?)').run(req.params.id, b.text);
  res.json(db.prepare('SELECT * FROM clip_comments WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE a comment
router.delete('/:clipId/comments/:commentId', function(req, res) {
  db.prepare('DELETE FROM clip_comments WHERE id = ? AND clip_id = ?').run(req.params.commentId, req.params.clipId);
  res.json({ ok: true });
});

module.exports = router;
