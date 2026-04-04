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

async function init() {
  if (initDone) return;
  initDone = true;

  await pool.execute("CREATE TABLE IF NOT EXISTS sessions (\n    id VARCHAR(20) PRIMARY KEY,\n    date VARCHAR(20) NOT NULL,\n    type VARCHAR(50) NOT NULL,\n    duration INT NOT NULL,\n    intensity VARCHAR(20) DEFAULT 'medium',\n    focus TEXT,\n    rating INT DEFAULT 0,\n    score VARCHAR(100) DEFAULT '',\n    notes TEXT,\n    video_count INT DEFAULT 0,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS goals (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    text TEXT NOT NULL,\n    type VARCHAR(50) NOT NULL,\n    status VARCHAR(50) DEFAULT 'not started',\n    metric VARCHAR(100) DEFAULT '',\n    target INT DEFAULT 0\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS youtube_videos (\n    id VARCHAR(20) PRIMARY KEY,\n    url TEXT NOT NULL,\n    youtube_id VARCHAR(20) NOT NULL,\n    title VARCHAR(255) DEFAULT '',\n    session_id VARCHAR(20),\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS clips (\n    id VARCHAR(20) PRIMARY KEY,\n    youtube_video_id VARCHAR(20) NOT NULL,\n    title VARCHAR(255) NOT NULL,\n    start_time INT NOT NULL,\n    end_time INT NOT NULL,\n    notes TEXT,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (youtube_video_id) REFERENCES youtube_videos(id) ON DELETE CASCADE\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS clip_comments (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    clip_id VARCHAR(20) NOT NULL,\n    text TEXT NOT NULL,\n    author VARCHAR(100) NOT NULL DEFAULT 'Anonymous',\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE\n  )");

  await pool.execute("CREATE TABLE IF NOT EXISTS videos (\n    id VARCHAR(20) PRIMARY KEY,\n    session_id VARCHAR(20) NOT NULL,\n    name VARCHAR(255) NOT NULL,\n    size BIGINT NOT NULL,\n    mime_type VARCHAR(100) NOT NULL,\n    filename VARCHAR(255) NOT NULL,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE\n  )");
}

module.exports = { pool: pool, init: init };
