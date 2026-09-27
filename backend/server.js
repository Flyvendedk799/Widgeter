const express = require('express');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(path.join(__dirname, 'marketplace.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        author TEXT,
        json_content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const upload = multer();

app.get('/widgets', (req, res) => {
    db.all('SELECT id, name, description, author, created_at FROM widgets ORDER BY created_at DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/widgets/:id', (req, res) => {
    db.get('SELECT * FROM widgets WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    });
});

app.post('/widgets', upload.single('widgetFile'), (req, res) => {
    const auth = req.headers['authorization'];
    if (auth !== 'Bearer tobias-secret') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let jsonContent = '';
    let name = req.body.name || 'Untitled';
    let description = req.body.description || '';
    let author = req.body.author || 'Tobias';

    if (req.file) {
        jsonContent = req.file.buffer.toString('utf8');
        try {
            const parsed = JSON.parse(jsonContent);
            if (parsed.name) name = parsed.name;
        } catch(e) {
            return res.status(400).json({ error: 'Invalid JSON file' });
        }
    } else if (req.body.json_content) {
        jsonContent = req.body.json_content;
        try {
            const parsed = JSON.parse(jsonContent);
            if (parsed.name) name = parsed.name;
        } catch(e) {
            return res.status(400).json({ error: 'Invalid JSON content' });
        }
    } else {
        return res.status(400).json({ error: 'No widget file or json_content provided' });
    }

    db.run('INSERT INTO widgets (name, description, author, json_content) VALUES (?, ?, ?, ?)', 
        [name, description, author, jsonContent], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

const port = process.env.PORT || 3055;
app.listen(port, () => console.log(`Marketplace API listening on port ${port}`));
