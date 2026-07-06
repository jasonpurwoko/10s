var express = require('express');
var router = express.Router();
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

function toClient(row) {
  return {
    id: row.id,
    video_id: row.video_id,
    idx: row.idx,
    start_sec: Number(row.start_sec),
    end_sec: Number(row.end_sec),
    label: row.label || ''
  };
}

// Validate a list of segments: numeric, start < end, sorted, non-overlapping.
// Returns an error string or null.
function validateSegments(segments) {
  if (!Array.isArray(segments)) return 'segments must be an array';
  for (var i = 0; i < segments.length; i++) {
    var s = segments[i];
    var start = Number(s.start_sec);
    var end = Number(s.end_sec);
    if (!isFinite(start) || !isFinite(end) || start < 0) return 'Segment ' + i + ': start_sec/end_sec must be non-negative numbers';
    if (start >= end) return 'Segment ' + i + ': start_sec must be less than end_sec';
    if (i > 0 && start < Number(segments[i - 1].end_sec)) return 'Segments must be sorted and non-overlapping (segment ' + i + ' starts before segment ' + (i - 1) + ' ends)';
  }
  return null;
}

async function getVideo(videoId) {
  var [rows] = await db.pool.execute('SELECT id FROM videos WHERE id = ?', [videoId]);
  return rows.length ? rows[0] : null;
}

// GET /api/segments?videoId=:id — ordered segmentation for a video
router.get('/', async function(req, res) {
  if (!req.query.videoId) return res.status(400).json({ error: 'videoId required' });
  var [rows] = await db.pool.execute('SELECT * FROM rally_segments WHERE video_id = ? ORDER BY idx ASC', [req.query.videoId]);
  res.json(rows.map(toClient));
});

// PUT /api/segments/:videoId — replace-all + renumber idx
router.put('/:videoId', requireAdmin, async function(req, res) {
  if (!(await getVideo(req.params.videoId))) return res.status(404).json({ error: 'Video not found' });
  var segments = req.body && req.body.segments;
  var err = validateSegments(segments);
  if (err) return res.status(400).json({ error: err });

  var conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM rally_segments WHERE video_id = ?', [req.params.videoId]);
    for (var i = 0; i < segments.length; i++) {
      await conn.execute(
        'INSERT INTO rally_segments (video_id, idx, start_sec, end_sec, label) VALUES (?, ?, ?, ?, ?)',
        [req.params.videoId, i, Number(segments[i].start_sec), Number(segments[i].end_sec), segments[i].label || '']
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  var [rows] = await db.pool.execute('SELECT * FROM rally_segments WHERE video_id = ? ORDER BY idx ASC', [req.params.videoId]);
  res.json(rows.map(toClient));
});

// POST /api/segments/:videoId — append one segment after the current last
router.post('/:videoId', requireAdmin, async function(req, res) {
  if (!(await getVideo(req.params.videoId))) return res.status(404).json({ error: 'Video not found' });
  var b = req.body || {};
  var [existing] = await db.pool.execute('SELECT * FROM rally_segments WHERE video_id = ? ORDER BY idx ASC', [req.params.videoId]);
  var combined = existing.concat([{ start_sec: b.start_sec, end_sec: b.end_sec }]);
  var err = validateSegments(combined);
  if (err) return res.status(400).json({ error: err });

  var idx = existing.length;
  var [result] = await db.pool.execute(
    'INSERT INTO rally_segments (video_id, idx, start_sec, end_sec, label) VALUES (?, ?, ?, ?, ?)',
    [req.params.videoId, idx, Number(b.start_sec), Number(b.end_sec), b.label || '']
  );
  var [rows] = await db.pool.execute('SELECT * FROM rally_segments WHERE id = ?', [result.insertId]);
  res.json(toClient(rows[0]));
});

// DELETE /api/segments/:segmentId — delete one segment and renumber the rest
router.delete('/:segmentId', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM rally_segments WHERE id = ?', [req.params.segmentId]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var videoId = rows[0].video_id;
  await db.pool.execute('DELETE FROM rally_segments WHERE id = ?', [req.params.segmentId]);
  var [remaining] = await db.pool.execute('SELECT id FROM rally_segments WHERE video_id = ? ORDER BY idx ASC', [videoId]);
  for (var i = 0; i < remaining.length; i++) {
    await db.pool.execute('UPDATE rally_segments SET idx = ? WHERE id = ?', [i, remaining[i].id]);
  }
  res.json({ ok: true });
});

module.exports = router;
