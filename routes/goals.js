var express = require('express');
var router = express.Router();
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

// GET all goals
router.get('/', function(req, res) {
  res.json(db.prepare('SELECT * FROM goals ORDER BY id').all());
});

// POST create goal
router.post('/', requireAdmin, function(req, res) {
  var b = req.body;
  var result = db.prepare(
    'INSERT INTO goals (text, type, status, metric, target) VALUES (?, ?, ?, ?, ?)'
  ).run(b.text, b.type, b.status || 'not started', b.metric || '', b.target || 0);
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update goal
router.put('/:id', requireAdmin, function(req, res) {
  var existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  var b = req.body;
  db.prepare('UPDATE goals SET text=?, type=?, status=?, metric=?, target=? WHERE id=?').run(
    b.text !== undefined ? b.text : existing.text,
    b.type !== undefined ? b.type : existing.type,
    b.status !== undefined ? b.status : existing.status,
    b.metric !== undefined ? b.metric : existing.metric,
    b.target !== undefined ? b.target : existing.target,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
});

// DELETE goal
router.delete('/:id', requireAdmin, function(req, res) {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
