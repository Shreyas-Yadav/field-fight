import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pinoHttp from 'pino-http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'scores.json');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'leaderboard-api' },
});

function loadScores() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return []; }
}

function saveScores(scores) {
  try {
    writeFileSync(DB_PATH, JSON.stringify(scores, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to persist scores.json');
    throw err;
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/api/scores', (req, res) => {
  const rawLimit = parseInt(req.query.limit ?? '20', 10);
  if (isNaN(rawLimit)) logger.warn({ received: req.query.limit }, 'Invalid limit param, using default');
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, 100);
  const scores = loadScores();
  res.json(scores.slice(-limit).reverse());
});

app.post('/api/scores', (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status ?? 500).json({
    error: isDev ? err.message : 'Internal server error',
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => logger.info({ port: PORT }, 'leaderboard-api ready'));
