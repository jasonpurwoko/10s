var express = require('express');
var router = express.Router();
var db = require('../db');

// GET all skills
router.get('/', function(req, res) {
  res.json(db.prepare('SELECT * FROM skills ORDER BY id').all());
});

// PUT bulk update
router.put('/', function(req, res) {
  var skills = req.body;
  var update = db.prepare('UPDATE skills SET value = ? WHERE id = ?');
  var tx = db.transaction(function(list) {
    list.forEach(function(sk) { update.run(sk.value, sk.id); });
  });
  tx(skills);
  res.json(db.prepare('SELECT * FROM skills ORDER BY id').all());
});

module.exports = router;
