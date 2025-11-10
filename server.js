// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY || '';
if (!OPENWEATHER_KEY) {
  console.warn('⚠️  No OPENWEATHER_KEY found in .env. Weather endpoint will fail without it.');
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'docs')));

// Crear carpeta "data" si no existe
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Conectar SQLite
const dbPath = path.join(dataDir, 'students.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB error:', err);
  else console.log('SQLite DB listo en', dbPath);
});

// Crear tabla si no existe
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      materia TEXT NOT NULL,
      anio INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// --- Endpoint clima ---
app.get('/weather', async (req, res) => {
  const city = req.query.city || 'Posadas';
  const country = req.query.country || 'AR';
  const q = encodeURIComponent(`${city},${country}`);

  if (!OPENWEATHER_KEY) {
    return res.status(500).json({ error: 'No API key configured on server' });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${OPENWEATHER_KEY}&units=metric&lang=es`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send(await response.text());

    const data = await response.json();
    res.json({
      city: data.name,
      country: data.sys?.country,
      temp: data.main?.temp,
      feels_like: data.main?.feels_like,
      humidity: data.main?.humidity,
      weather: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon
    });
  } catch (err) {
    console.error('Weather fetch error', err);
    res.status(500).json({ error: 'Error fetching weather' });
  }
});

// --- Obtener alumnos ---
app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Guardar alumno ---
app.post('/api/students', (req, res) => {
  const { nombre, apellido, materia, anio } = req.body;
  if (!nombre || !apellido || !materia || typeof anio === 'undefined') {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const anioInt = parseInt(anio, 10);
  if (isNaN(anioInt)) return res.status(400).json({ error: 'Año debe ser número' });

  const stmt = db.prepare('INSERT INTO students (nombre, apellido, materia, anio) VALUES (?, ?, ?, ?)');
  stmt.run([nombre, apellido, materia, anioInt], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, nombre, apellido, materia, anio: anioInt });
  });
});

// --- Health check ---
app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Fallback para SPA (solo 1 vez!) ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// Iniciar server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor levantado en http://localhost:${PORT}`);
});

