var express = require('express');
var router = express.Router();
var db = require('../db');
var requireAdmin = require('../middleware/auth').requireAdmin;

// GET all goals
router.get('/', async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM goals ORDER BY id');
  res.json(rows);
});

// POST create goal
router.post('/', requireAdmin, async function(req, res) {
  var b = req.body;
  var [result] = await db.pool.execute(
    'INSERT INTO goals (text, type, status, metric, target) VALUES (?, ?, ?, ?, ?)',
    [b.text, b.type, b.status || 'not started', b.metric || '', b.target || 0]
  );
  var [rows] = await db.pool.execute('SELECT * FROM goals WHERE id = ?', [result.insertId]);
  res.json(rows[0]);
});

// PUT update goal
router.put('/:id', requireAdmin, async function(req, res) {
  var [rows] = await db.pool.execute('SELECT * FROM goals WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  var existing = rows[0];

  var b = req.body;
  await db.pool.execute('UPDATE goals SET text=?, type=?, status=?, metric=?, target=? WHERE id=?', [
    b.text !== undefined ? b.text : existing.text,
    b.type !== undefined ? b.type : existing.type,
    b.status !== undefined ? b.status : existing.status,
    b.metric !== undefined ? b.metric : existing.metric,
    b.target !== undefined ? b.target : existing.target,
    req.params.id
  ]);
  var [updated] = await db.pool.execute('SELECT * FROM goals WHERE id = ?', [req.params.id]);
  res.json(updated[0]);
});

// DELETE goal
router.delete('/:id', requireAdmin, async function(req, res) {
  await db.pool.execute('DELETE FROM goals WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
