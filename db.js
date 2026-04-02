var Database = require('better-sqlite3');
var path = require('path');

var db = new Database(path.join(__dirname, '10s.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL,
    intensity TEXT DEFAULT 'medium',
    focus TEXT DEFAULT '',
    rating INTEGER DEFAULT 0,
    score TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    video_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    value REAL DEFAULT 5.0,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'not started',
    metric TEXT DEFAULT '',
    target INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default skills if empty
var count = db.prepare('SELECT COUNT(*) as c FROM skills').get().c;
if (count === 0) {
  var insert = db.prepare('INSERT INTO skills (name, value, color) VALUES (?, ?, ?)');
  insert.run('Serve', 5.0, 'var(--blue)');
  insert.run('Forehand', 5.0, 'var(--green)');
  insert.run('Backhand', 5.0, 'var(--purple)');
  insert.run('Footwork', 5.0, 'var(--orange)');
  insert.run('Net play', 5.0, 'var(--red)');
}

module.exports = db;
