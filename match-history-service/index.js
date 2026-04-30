import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import client from 'prom-client';
import pg from 'pg';

const { Pool } = pg;
pg.types.setTypeParser(20, value => Number(value));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://magnet_vis:magnet_vis_password@127.0.0.1:55432/magnet_vis';
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

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

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'match-history-service', uptime: process.uptime() });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// GET /matches?limit=20 — recent matches
app.get('/matches', async (req, res, next) => {
  const end = matchHistoryRequestDuration.startTimer({ method: 'GET', route: '/matches' });
  try {
    const rawLimit = parseInt(req.query.limit ?? '20', 10);
    if (isNaN(rawLimit)) logger.warn({ received: req.query.limit }, 'Invalid limit param, using default');
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, 100);
    const { rows } = await pool.query(
      `SELECT id,
              p0_id AS "p0Id",
              p0_name AS "p0Name",
              p1_id AS "p1Id",
              p1_name AS "p1Name",
              winner,
              game_mode AS "gameMode",
              p0_moves AS "p0Moves",
              p1_moves AS "p1Moves",
              created_at AS "createdAt"
       FROM matches
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows);
    end({ status_code: 200 });
  } catch (err) {
    end({ status_code: 500 });
    next(err);
  }
});

// GET /matches/player/:playerId — matches for a specific player
app.get('/matches/player/:playerId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,
              p0_id AS "p0Id",
              p0_name AS "p0Name",
              p1_id AS "p1Id",
              p1_name AS "p1Name",
              winner,
              game_mode AS "gameMode",
              p0_moves AS "p0Moves",
              p1_moves AS "p1Moves",
              created_at AS "createdAt"
       FROM matches
       WHERE p0_id = $1 OR p1_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [req.params.playerId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /matches — save a new match
app.post('/matches', async (req, res, next) => {
  const end = matchHistoryRequestDuration.startTimer({ method: 'POST', route: '/matches' });
  try {
    const { p0Id, p0Name, p1Id, p1Name, winner, gameMode, p0Moves, p1Moves } = req.body;

    if (typeof winner !== 'number' || typeof gameMode !== 'string') {
      end({ status_code: 400 });
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { rows } = await pool.query(
      `INSERT INTO matches (p0_id, p0_name, p1_id, p1_name, winner, game_mode, p0_moves, p1_moves)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        p0Id ?? null,
        p0Name ?? 'ALPHA',
        p1Id ?? null,
        p1Name ?? 'BRAVO',
        winner,
        gameMode,
        p0Moves ?? 0,
        p1Moves ?? 0,
      ],
    );
    matchHistoryMatchesPostedTotal.inc();
    end({ status_code: 201 });
    res.status(201).json({ id: Number(rows[0].id) });
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
  const server = app.listen(PORT, () => logger.info({ port: PORT }, 'match-history-service ready'));
  const shutdown = () => {
    logger.info('SIGTERM received — closing server');
    server.close(() => {
      logger.info('Server closed');
      pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
export { app, pool };
