import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'scores.json');

function loadScores() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return []; }
}

function saveScores(scores) {
  writeFileSync(DB_PATH, JSON.stringify(scores, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/scores', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
  const scores = loadScores();
  res.json(scores.slice(-limit).reverse());
});

app.post('/api/scores', (req, res) => {
  const { winner, gameMode, p0Moves, p1Moves } = req.body;

  if (
    typeof winner !== 'number' ||
    typeof gameMode !== 'string' ||
    typeof p0Moves !== 'number' ||
    typeof p1Moves !== 'number'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const scores = loadScores();
  const entry = {
    id: Date.now(),
    winner,
    game_mode: gameMode,
    p0_moves: p0Moves,
    p1_moves: p1Moves,
    created_at: new Date().toISOString(),
  };
  scores.push(entry);
  saveScores(scores);
  res.status(201).json({ id: entry.id });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`leaderboard-api listening on :${PORT}`));
