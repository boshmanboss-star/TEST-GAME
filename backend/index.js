const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createSeedHash, revealSeed, computeOutcome } = require('./provably_fair');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 4000;
const DB_FILE = process.env.DATABASE_FILE || './data/db.sqlite';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);

// Init DB tables (credits stored in cents)
db.prepare(`CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT,
  credits_cents INTEGER DEFAULT 100000,
  created_at INTEGER
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS pf_sessions (
  id TEXT PRIMARY KEY,
  server_seed_hash TEXT,
  server_seed TEXT,
  created_at INTEGER,
  revealed INTEGER DEFAULT 0
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS plays (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  pf_session_id TEXT,
  client_seed TEXT,
  outcome TEXT,
  payout_cents INTEGER,
  created_at INTEGER
)`).run();

// Game interface config (ce que voit le joueur)
const frontendConfig = [
  {"palier":1,"portes":3,"gagnantes_affiche":1,"perdantes_affiche":2,"chance_affiche":"33.3%","multi_affiche":"x3.00"},
  {"palier":2,"portes":4,"gagnantes_affiche":1,"perdantes_affiche":3,"chance_affiche":"25.0%","multi_affiche":"x4.00"},
  {"palier":3,"portes":5,"gagnantes_affiche":2,"perdantes_affiche":3,"chance_affiche":"40.0%","multi_affiche":"x2.50"},
  {"palier":4,"portes":6,"gagnantes_affiche":2,"perdantes_affiche":4,"chance_affiche":"33.3%","multi_affiche":"x3.00"},
  {"palier":5,"portes":7,"gagnantes_affiche":3,"perdantes_affiche":4,"chance_affiche":"42.9%","multi_affiche":"x2.33"},
  {"palier":6,"portes":8,"gagnantes_affiche":3,"perdantes_affiche":5,"chance_affiche":"37.5%","multi_affiche":"x2.67"},
  {"palier":7,"portes":9,"gagnantes_affiche":4,"perdantes_affiche":5,"chance_affiche":"44.4%","multi_affiche":"x2.25"},
  {"palier":8,"portes":10,"gagnantes_affiche":4,"perdantes_affiche":6,"chance_affiche":"40.0%","multi_affiche":"x2.50"},
  {"palier":9,"portes":11,"gagnantes_affiche":5,"perdantes_affiche":6,"chance_affiche":"45.5%","multi_affiche":"x2.20"},
  {"palier":10,"portes":12,"gagnantes_affiche":5,"perdantes_affiche":7,"chance_affiche":"41.7%","multi_affiche":"x2.40"}
];

// Example real probabilities & multipliers used by server (tunable)
const probas_reelles = {1:0.15,2:0.12,3:0.10,4:0.15,5:0.08,6:0.10,7:0.07,8:0.08,9:0.06,10:0.05};
const multiplicateurs_reels = {1:2.0,2:2.5,3:2.0,4:2.2,5:1.8,6:2.0,7:1.7,8:1.8,9:1.6,10:1.7};

const app = express();
app.use(bodyParser.json());
app.use(cors());

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (!ADMIN_KEY) return res.status(500).json({ error: 'ADMIN_KEY not set on server' });
  if (key === ADMIN_KEY) return next();
  return res.status(401).json({ error: 'admin auth required' });
}

// Simple auth (no password for MVP) — returns player id
app.post('/api/auth/signup', (req, res) => {
  const name = req.body.name || 'joueur';
  const id = uuidv4();
  const now = Date.now();
  // credits default 1000.00€ -> 100000 cents
  db.prepare('INSERT INTO players (id,name,credits_cents,created_at) VALUES (?,?,?,?)').run(id, name, 100000, now);
  res.json({ id, name, credits: 1000.00 });
});

app.post('/api/auth/login', (req, res) => {
  const id = req.body.id;
  const row = db.prepare('SELECT id,name,credits_cents FROM players WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Joueur non trouvé' });
  res.json({ id: row.id, name: row.name, credits: (row.credits_cents/100).toFixed(2) });
});

// Publish current game interface
app.get('/api/config', (req, res) => {
  res.json({ interface: frontendConfig });
});

// Create a provably-fair session (server publishes hash) - protected admin
app.post('/api/pf/create', adminAuth, (req, res) => {
  const seed = createSeedHash(true); // returns {server_seed, server_seed_hash}
  const id = uuidv4();
  db.prepare('INSERT INTO pf_sessions (id, server_seed_hash, server_seed, created_at, revealed) VALUES (?,?,?,?,?)')
    .run(id, seed.server_seed_hash, seed.server_seed, Date.now(), 0);
  // For transparency publish the hash only (not server_seed)
  res.json({ pf_session_id: id, server_seed_hash: seed.server_seed_hash });
});

// Reveal server_seed for a session (admin action)
app.post('/api/pf/reveal', adminAuth, (req, res) => {
  const id = req.body.pf_session_id;
  const session = db.prepare('SELECT * FROM pf_sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'session pf introuvable' });
  db.prepare('UPDATE pf_sessions SET revealed = 1 WHERE id = ?').run(id);
  res.json({ pf_session_id: id, server_seed: session.server_seed });
});

// Play endpoint: player sends clientSeed and chooses to play full sequence (palier 1..10)
app.post('/api/play', (req, res) => {
  const { playerId, clientSeed } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId requis' });
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'joueur introuvable' });

  // Get latest pf_session (for demo we use the last created)
  const session = db.prepare('SELECT * FROM pf_sessions ORDER BY created_at DESC LIMIT 1').get();
  if (!session) return res.status(500).json({ error: 'Pas de session provably-fair active. Créez-en une via /api/pf/create (admin)' });

  const results = [];
  let totalPayout = 0;
  const palierMax = 10;
  const miseParPalierCents = 100; // 1€ = 100 cents per palier
  for (let palier = 1; palier <= palierMax; palier++) {
    const { randFloat, proof } = computeOutcome(session.server_seed, clientSeed || '', palier);
    const prob = probas_reelles[palier];
    const multi = multiplicateurs_reels[palier];
    const win = randFloat < prob;
    const payoutCents = win ? Math.round((multi) * miseParPalierCents) : 0;
    if (win) totalPayout += payoutCents;
    results.push({ palier, randFloat, prob, multi, win, payout_cents: payoutCents, proof });
  }

  // Update DB: store play and update player credits (credits stored in cents)
  const totalWager = miseParPalierCents * palierMax;
  const newCredits = player.credits_cents - totalWager + totalPayout;
  db.prepare('UPDATE players SET credits_cents = ? WHERE id = ?').run(newCredits, playerId);

  const playId = uuidv4();
  db.prepare('INSERT INTO plays (id, player_id, pf_session_id, client_seed, outcome, payout_cents, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(playId, playerId, session.id, clientSeed || '', JSON.stringify(results), totalPayout, Date.now());

  res.json({ pf_session_id: session.id, server_seed_hash: session.server_seed_hash, results, total_payout_cents: totalPayout, new_credits_cents: newCredits });
});

// Simple endpoint to get player
app.get('/api/player/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT id,name,credits_cents FROM players WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Joueur introuvable' });
  res.json({ id: row.id, name: row.name, credits: (row.credits_cents/100).toFixed(2) });
});

app.listen(PORT, () => {
  console.log(`Backend started on ${PORT}`);
});
