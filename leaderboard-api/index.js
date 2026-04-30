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
  base: { service: 'leaderboard-api' },
});

// ── Metrics ───────────────────────────────────────────────────────────────────

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const leaderboardScoresPostedTotal = new client.Counter({
  name: 'leaderboard_scores_posted_total',
  help: 'Total scores successfully recorded',
  registers: [register],
});

const leaderboardRequestDuration = new client.Histogram({
  name: 'leaderboard_request_duration_seconds',
  help: 'Response latency for leaderboard API requests',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

const leaderboardInvalidRequestsTotal = new client.Counter({
  name: 'leaderboard_invalid_requests_total',
  help: 'Total requests rejected with 400',
  registers: [register],
});

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'leaderboard-api', uptime: process.uptime() });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/scores', async (req, res, next) => {
  const end = leaderboardRequestDuration.startTimer({ method: 'GET', route: '/api/scores' });
  try {
    const rawLimit = parseInt(req.query.limit ?? '20', 10);
    if (isNaN(rawLimit)) logger.warn({ received: req.query.limit }, 'Invalid limit param, using default');
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, 100);
    const { rows } = await pool.query(
      `SELECT id, winner, game_mode, p0_moves, p1_moves, created_at
       FROM leaderboard_scores
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

app.post('/api/scores', async (req, res, next) => {
  const end = leaderboardRequestDuration.startTimer({ method: 'POST', route: '/api/scores' });
  try {
    const { winner, gameMode, p0Moves, p1Moves } = req.body;

    if (
      typeof winner !== 'number' ||
      typeof gameMode !== 'string' ||
      typeof p0Moves !== 'number' ||
      typeof p1Moves !== 'number'
    ) {
      leaderboardInvalidRequestsTotal.inc();
      end({ status_code: 400 });
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { rows } = await pool.query(
      `INSERT INTO leaderboard_scores (winner, game_mode, p0_moves, p1_moves)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [winner, gameMode, p0Moves, p1Moves],
    );
    leaderboardScoresPostedTotal.inc();
    end({ status_code: 201 });
    res.status(201).json({ id: Number(rows[0].id) });
  } catch (err) {
    end({ status_code: 500 });
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
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => logger.info({ port: PORT }, 'leaderboard-api ready'));
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
