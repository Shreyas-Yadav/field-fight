import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pinoHttp from 'pino-http';
import client from 'prom-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.MATCH_DB_PATH ?? join(__dirname, 'matches.json');

const logger = pino({
  level: process.env.NODE_ENV === 'test'       ? 'silent'
       : process.env.NODE_ENV === 'production' ? 'info'
       : 'debug',
  base: { service: 'match-history-service' },
});

// ── Metrics ───────────────────────────────────────────────────────────────────

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const matchHistoryMatchesPostedTotal = new client.Counter({
  name: 'match_history_matches_posted_total',
  help: 'Total matches successfully recorded',
  registers: [register],
});

const matchHistoryRequestDuration = new client.Histogram({
  name: 'match_history_request_duration_seconds',
  help: 'Response latency for match history API requests',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// GET /matches?limit=20 — recent matches
app.get('/matches', (req, res) => {
  const end = matchHistoryRequestDuration.startTimer({ method: 'GET', route: '/matches' });
  const rawLimit = parseInt(req.query.limit ?? '20', 10);
  if (isNaN(rawLimit)) logger.warn({ received: req.query.limit }, 'Invalid limit param, using default');
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, 100);
  const matches = loadMatches();
  res.json(matches.slice(-limit).reverse());
  end({ status_code: 200 });
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
  const end = matchHistoryRequestDuration.startTimer({ method: 'POST', route: '/matches' });
  try {
    const { p0Id, p0Name, p1Id, p1Name, winner, gameMode, p0Moves, p1Moves } = req.body;

    if (typeof winner !== 'number' || typeof gameMode !== 'string') {
      end({ status_code: 400 });
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
    matchHistoryMatchesPostedTotal.inc();
    end({ status_code: 201 });
    res.status(201).json({ id: entry.id });
  } catch (err) {
    end({ status_code: 500 });
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
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => logger.info({ port: PORT }, 'match-history-service ready'));
}
export { app };
