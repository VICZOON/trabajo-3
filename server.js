// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY || '';
if (!OPENWEATHER_KEY) {
  console.warn('⚠️  No OPENWEATHER_KEY found in .env. Weather endpoint will fail without it.');
}

const app = express();
app.use(cors()); // Ajusta en prod según necesidades
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ensure data dir
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// open / create sqlite database
const dbPath = path.join(dataDir, 'students.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB error:', err);
  else console.log('SQLite DB listo en', dbPath);
});

// create table if not exists
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

// --- Weather proxy endpoint ---
// Query params: ?city=Posadas&country=AR  (country optional)
app.get('/weather', async (req, res) => {
  const city = req.query.city || 'Posadas';
  const country = req.query.country || 'AR';
  const q = encodeURIComponent(`${city},${country}`);
  if (!OPENWEATHER_KEY) {
    return res.status(500).json({ error: 'No API key configured on server' });
  }

  try {
    // Use OpenWeatherMap Current Weather Data (by city name)
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${OPENWEATHER_KEY}&units=metric&lang=es`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).send(text);
    }
    const data = await r.json();
    // Return a compact payload
    const payload = {
      city: data.name,
      country: data.sys?.country,
      temp: data.main?.temp,
      feels_like: data.main?.feels_like,
      humidity: data.main?.humidity,
      weather: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon
    };
    res.json(payload);
  } catch (err) {
    console.error('Weather fetch error', err);
    res.status(500).json({ error: 'Error fetching weather' });
  }
});

// --- Students API ---
// GET all students
app.get('/api/students', (req, res) => {
  db.all('SELECT id, nombre, apellido, materia, anio, created_at FROM students ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST new student
app.post('/api/students', (req, res) => {
  const { nombre, apellido, materia, anio } = req.body;
  if (!nombre || !apellido || !materia || typeof anio === 'undefined') {
    return res.status(400).json({ error: 'Faltan campos. Requeridos: nombre, apellido, materia, anio' });
  }
  // ensure anio is integer
  const anioInt = parseInt(anio, 10);
  if (Number.isNaN(anioInt)) return res.status(400).json({ error: 'Año debe ser un número entero' });

  const stmt = db.prepare('INSERT INTO students (nombre, apellido, materia, anio) VALUES (?, ?, ?, ?)');
  stmt.run([nombre, apellido, materia, anioInt], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nombre, apellido, materia, anio: anioInt });
  });
  stmt.finalize();
});

// simple health route
app.get('/api/health', (req, res) => res.json({ ok: true }));

// fallback to index.html for SPA navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
