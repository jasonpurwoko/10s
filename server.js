var express = require('express');
var path = require('path');
var fs = require('fs');

var app = express();
var PORT = process.env.PORT || 3000;

// Ensure uploads dir
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/clips', require('./routes/clips'));

app.listen(PORT, function() {
  console.log('10s server running on http://localhost:' + PORT);
});
