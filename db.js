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

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'not started',
    metric TEXT DEFAULT '',
    target INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS youtube_videos (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    youtube_video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clip_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
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

// Migration: add author column to clip_comments
var columns = db.pragma('table_info(clip_comments)');
var hasAuthor = columns.some(function(c) { return c.name === 'author'; });
if (!hasAuthor) {
  db.exec("ALTER TABLE clip_comments ADD COLUMN author TEXT NOT NULL DEFAULT 'Anonymous'");
}

module.exports = db;
