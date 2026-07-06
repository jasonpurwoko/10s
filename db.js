var mysql = require('mysql2/promise');

var pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '10s',
  waitForConnections: true,
  connectionLimit: 10
});

var initDone = false;

async function columnExists(table, column) {
  var [rows] = await pool.execute(
    "SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column]
  );
  return rows[0].c > 0;
}

async function tableExists(table) {
  var [rows] = await pool.execute(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return rows[0].c > 0;
}

// One-time migration: move from YouTube-linked videos to directly-uploaded videos.
async function migrate() {
  // Bring a legacy `videos` table up to the current schema.
  if (await tableExists('videos')) {
    if (!(await columnExists('videos', 'title'))) {
      await pool.execute("ALTER TABLE videos ADD COLUMN title VARCHAR(255) DEFAULT '' AFTER name");
    }
    if (!(await columnExists('videos', 'duration'))) {
      await pool.execute("ALTER TABLE videos ADD COLUMN duration INT DEFAULT 0");
    }
    if (!(await columnExists('videos', 'sort_order'))) {
      await pool.execute("ALTER TABLE videos ADD COLUMN sort_order INT DEFAULT 0");
    }
  }

  // Repoint clips from youtube_videos to uploaded videos. Legacy YouTube clips are
  // dropped (they reference videos that no longer exist in this model).
  if (await tableExists('clips') && await columnExists('clips', 'youtube_video_id') && !(await columnExists('clips', 'video_id'))) {
    await pool.execute('DROP TABLE IF EXISTS clip_comments');
    await pool.execute('DROP TABLE IF EXISTS clips');
  }

  // The YouTube source is gone; drop its table once nothing references it.
  await pool.execute('DROP TABLE IF EXISTS youtube_videos');
}

async function init() {
  if (initDone) return;
  initDone = true;

  await pool.execute("CREATE TABLE IF NOT EXISTS sessions (\n    id VARCHAR(20) PRIMARY KEY,\n    date VARCHAR(20) NOT NULL,\n    type VARCHAR(50) NOT NULL,\n    duration INT NOT NULL,\n    intensity VARCHAR(20) DEFAULT 'medium',\n    focus TEXT,\n    rating INT DEFAULT 0,\n    score VARCHAR(100) DEFAULT '',\n    notes TEXT,\n    video_count INT DEFAULT 0,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS goals (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    text TEXT NOT NULL,\n    type VARCHAR(50) NOT NULL,\n    status VARCHAR(50) DEFAULT 'not started',\n    metric VARCHAR(100) DEFAULT '',\n    target INT DEFAULT 0\n  )");

  // Directly-uploaded videos (replaces the old youtube_videos table).
  await pool.execute("CREATE TABLE IF NOT EXISTS videos (\n    id VARCHAR(20) PRIMARY KEY,\n    session_id VARCHAR(20) NOT NULL,\n    name VARCHAR(255) NOT NULL,\n    title VARCHAR(255) DEFAULT '',\n    size BIGINT NOT NULL,\n    mime_type VARCHAR(100) NOT NULL,\n    filename VARCHAR(255) NOT NULL,\n    duration INT DEFAULT 0,\n    sort_order INT DEFAULT 0,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE\n  )");

  await migrate();

  await pool.execute("CREATE TABLE IF NOT EXISTS clips (\n    id VARCHAR(20) PRIMARY KEY,\n    video_id VARCHAR(20) NOT NULL,\n    title VARCHAR(255) NOT NULL,\n    start_time INT NOT NULL,\n    end_time INT NOT NULL,\n    notes TEXT,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS clip_comments (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    clip_id VARCHAR(20) NOT NULL,\n    text TEXT NOT NULL,\n    author VARCHAR(100) NOT NULL DEFAULT 'Anonymous',\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE\n  )");
}

module.exports = { pool: pool, init: init };
