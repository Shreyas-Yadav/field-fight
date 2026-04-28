import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pinoHttp from 'pino-http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, 'matches.json');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'match-history-service' },
});

// ── Store helpers ─────────────────────────────────────────────────────────────

function loadMatches() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return []; }
}

function saveMatches(matches) {
  try {
    writeFileSync(DB_PATH, JSON.stringify(matches, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to persist matches.json');
    throw err;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// GET /matches?limit=20 — recent matches
app.get('/matches', (req, res) => {
  const rawLimit = parseInt(req.query.limit ?? '20', 10);
  if (isNaN(rawLimit)) logger.warn({ received: req.query.limit }, 'Invalid limit param, using default');
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, 100);
  const matches = loadMatches();
  res.json(matches.slice(-limit).reverse());
});

// GET /matches/player/:playerId — matches for a specific player
app.get('/matches/player/:playerId', (req, res) => {
  const matches = loadMatches();
  const filtered = matches.filter(
    m => m.p0Id === req.params.playerId || m.p1Id === req.params.playerId,
  );
  res.json(filtered.slice(-20).reverse());
});

// POST /matches — save a new match
app.post('/matches', (req, res, next) => {
  try {
    const { p0Id, p0Name, p1Id, p1Name, winner, gameMode, p0Moves, p1Moves } = req.body;

    if (typeof winner !== 'number' || typeof gameMode !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const matches = loadMatches();
    const entry = {
      id:        Date.now(),
      p0Id:      p0Id   ?? null,
      p0Name:    p0Name ?? 'ALPHA',
      p1Id:      p1Id   ?? null,
      p1Name:    p1Name ?? 'BRAVO',
      winner,
      gameMode,
      p0Moves:   p0Moves ?? 0,
      p1Moves:   p1Moves ?? 0,
      createdAt: new Date().toISOString(),
    };
    matches.push(entry);
    saveMatches(matches);
    res.status(201).json({ id: entry.id });
  } catch (err) {
    next(err);
  }
});

// ── Error handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status ?? 500).json({
    error: isDev ? err.message : 'Internal server error',
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => logger.info({ port: PORT }, 'match-history-service ready'));
