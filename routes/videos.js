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

// ---- Chunked upload ----
// Hosting proxies (e.g. Hostinger's LiteSpeed) drop large request bodies at the
// connection level, so big videos are uploaded as a series of small PUTs:
// init -> PUT each chunk -> complete (reassemble + register the video).
var CHUNK_DIR = path.join(__dirname, '..', 'uploads', '.chunks');
var MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // matches the multer limit

function chunkUploadDir(uploadId) {
  return path.join(CHUNK_DIR, uploadId);
}

function readChunkMeta(uploadId) {
  if (!/^[a-z0-9]{6,32}$/.test(uploadId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(chunkUploadDir(uploadId), 'meta.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

// Remove upload dirs abandoned for over a day.
function sweepStaleChunkUploads() {
  var entries;
  try { entries = fs.readdirSync(CHUNK_DIR); } catch (e) { return; }
  entries.forEach(function(name) {
    try {
      var meta = JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, name, 'meta.json'), 'utf8'));
      if (Date.now() - meta.created > 24 * 60 * 60 * 1000) {
        fs.rmSync(path.join(CHUNK_DIR, name), { recursive: true, force: true });
      }
    } catch (e) {}
  });
}

// POST start a chunked upload
router.post('/chunked/init', requireAdmin, async function(req, res) {
  var b = req.body || {};
  var size = parseInt(b.size);
  var totalChunks = parseInt(b.totalChunks);
  if (!b.sessionId) return res.status(400).json({ error: 'sessionId required' });
  if (!b.name) return res.status(400).json({ error: 'name required' });
  if (!isFinite(size) || size < 0 || size > MAX_VIDEO_BYTES) return res.status(400).json({ error: 'Invalid size (max 2 GB)' });
  if (!isFinite(totalChunks) || totalChunks < 1 || totalChunks > 4096) return res.status(400).json({ error: 'Invalid totalChunks' });
  if (String(b.mimeType || '').indexOf('video/') !== 0) return res.status(400).json({ error: 'Only video files allowed' });

  var [sRows] = await db.pool.execute('SELECT id FROM sessions WHERE id = ?', [b.sessionId]);
  if (!sRows.length) return res.status(400).json({ error: 'Session not found' });

  sweepStaleChunkUploads();

  var uploadId = genId();
  fs.mkdirSync(chunkUploadDir(uploadId), { recursive: true });
  fs.writeFileSync(path.join(chunkUploadDir(uploadId), 'meta.json'), JSON.stringify({
    sessionId: b.sessionId,
    name: String(b.name),
    size: size,
    mimeType: String(b.mimeType),
    totalChunks: totalChunks,
    created: Date.now()
  }));
  res.json({ uploadId: uploadId });
});

// PUT one chunk (raw body)
router.put('/chunked/:uploadId/:index', requireAdmin, express.raw({ type: '*/*', limit: '16mb' }), function(req, res) {
  var meta = readChunkMeta(req.params.uploadId);
  if (!meta) return res.status(404).json({ error: 'Upload not found or expired' });
  var idx = parseInt(req.params.index);
  if (!isFinite(idx) || idx < 0 || idx >= meta.totalChunks) return res.status(400).json({ error: 'Invalid chunk index' });
  var body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  fs.writeFileSync(path.join(chunkUploadDir(req.params.uploadId), 'chunk_' + idx), body);
  res.json({ ok: true, received: body.length });
});

// POST reassemble the chunks and register the video
router.post('/chunked/:uploadId/complete', requireAdmin, async function(req, res) {
  var uploadId = req.params.uploadId;
  var meta = readChunkMeta(uploadId);
  if (!meta) return res.status(404).json({ error: 'Upload not found or expired' });
  var dir = chunkUploadDir(uploadId);

  var total = 0;
  for (var i = 0; i < meta.totalChunks; i++) {
    var st;
    try { st = fs.statSync(path.join(dir, 'chunk_' + i)); }
    catch (e) { return res.status(400).json({ error: 'Missing chunk ' + i }); }
    total += st.size;
  }
  if (total !== meta.size) return res.status(400).json({ error: 'Size mismatch: expected ' + meta.size + ' bytes, got ' + total });

  var ext = path.extname(meta.name);
  if (!/^\.[A-Za-z0-9]{1,8}$/.test(ext)) ext = '.mp4';
  var filename = genId() + ext;
  var outPath = path.join(__dirname, '..', 'uploads', filename);
  var out = fs.createWriteStream(outPath);
  try {
    for (var j = 0; j < meta.totalChunks; j++) {
      await new Promise(function(resolve, reject) {
        var rs = fs.createReadStream(path.join(dir, 'chunk_' + j));
        rs.on('error', reject);
        rs.on('end', resolve);
        rs.pipe(out, { end: false });
      });
    }
    await new Promise(function(resolve, reject) {
      out.on('finish', resolve);
      out.on('error', reject);
      out.end();
    });
  } catch (e) {
    try { out.destroy(); fs.unlinkSync(outPath); } catch (e2) {}
    return res.status(500).json({ error: 'Failed to assemble upload' });
  }

  var [maxRows] = await db.pool.execute('SELECT COALESCE(MAX(sort_order), -1) AS m FROM videos WHERE session_id = ?', [meta.sessionId]);
  var id = genId();
  await db.pool.execute(
    'INSERT INTO videos (id, session_id, name, title, size, mime_type, filename, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, meta.sessionId, meta.name, stripExt(meta.name), total, meta.mimeType, filename, maxRows[0].m + 1]
  );
  var [countRows] = await db.pool.execute('SELECT COUNT(*) as c FROM videos WHERE session_id = ?', [meta.sessionId]);
  await db.pool.execute('UPDATE sessions SET video_count = ? WHERE id = ?', [countRows[0].c, meta.sessionId]);

  fs.rmSync(dir, { recursive: true, force: true });

  var [rows] = await db.pool.execute('SELECT * FROM videos WHERE id = ?', [id]);
  res.json(toClient(rows[0]));
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
