import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import jwt from 'jsonwebtoken';
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

const JWT_SECRET    = process.env.JWT_SECRET    || 'magnet-arena-dev-secret';
const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:5173';
const SERVICE_URL   = process.env.SERVICE_URL   || 'http://localhost:3003';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const googleAuthEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const githubAuthEnabled = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);

const logger = pino({
  level: process.env.NODE_ENV === 'test'       ? 'silent'
       : process.env.NODE_ENV === 'production' ? 'info'
       : 'debug',
  base: { service: 'auth-service' },
});

// ── Metrics ───────────────────────────────────────────────────────────────────

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const authLoginsTotal = new client.Counter({
  name: 'auth_logins_total',
  help: 'Total OAuth login attempts',
  labelNames: ['provider', 'status'],
  registers: [register],
});

const authLoginDuration = new client.Histogram({
  name: 'auth_login_duration_seconds',
  help: 'OAuth callback handler duration in seconds',
  labelNames: ['provider'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const authTokensIssuedTotal = new client.Counter({
  name: 'auth_tokens_issued_total',
  help: 'Total JWT tokens successfully issued',
  registers: [register],
});

// ── User store ────────────────────────────────────────────────────────────────

function mapUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_id,
    name: row.name,
    avatar: row.avatar,
    createdAt: row.created_at,
  };
}

async function upsertUser({ provider, providerId, name, avatar }) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, provider, provider_id, name, avatar)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_id) DO UPDATE
       SET name = EXCLUDED.name,
           avatar = EXCLUDED.avatar
     RETURNING id, provider, provider_id, name, avatar, created_at`,
    [`${provider}:${providerId}`, provider, providerId, name, avatar ?? null],
  );
  return mapUser(rows[0]);
}

// ── Passport strategies ───────────────────────────────────────────────────────

if (googleAuthEnabled) {
  passport.use(new GoogleStrategy(
    {
      clientID:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL:  `${SERVICE_URL}/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await upsertUser({
          provider:   'google',
          providerId: profile.id,
          name:       profile.displayName,
          avatar:     profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    },
  ));
} else {
  logger.warn('Google OAuth is disabled because credentials are not configured');
}

if (githubAuthEnabled) {
  passport.use(new GitHubStrategy(
    {
      clientID:     GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL:  `${SERVICE_URL}/auth/github/callback`,
      state:        false,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await upsertUser({
          provider:   'github',
          providerId: String(profile.id),
          name:       profile.displayName || profile.username,
          avatar:     profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    },
  ));
} else {
  logger.warn('GitHub OAuth is disabled because credentials are not configured');
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(pinoHttp({
  logger,
  ignore: (req) => req.url.includes('/callback'),
}));
app.use(passport.initialize());

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', uptime: process.uptime() });
});

// ── Metrics endpoint ──────────────────────────────────────────────────────────

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── OAuth routes ──────────────────────────────────────────────────────────────

if (googleAuthEnabled) {
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile'], session: false }),
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}?auth_error=1` }),
    (req, res) => {
      const end = authLoginDuration.startTimer({ provider: 'google' });
      try {
        const token = jwt.sign(req.user, JWT_SECRET, { expiresIn: '7d' });
        authLoginsTotal.inc({ provider: 'google', status: 'success' });
        authTokensIssuedTotal.inc();
        res.redirect(`${FRONTEND_URL}?token=${encodeURIComponent(token)}`);
      } finally {
        end();
      }
    },
  );
} else {
  app.get(['/auth/google', '/auth/google/callback'], (_req, res) => {
    authLoginsTotal.inc({ provider: 'google', status: 'disabled' });
    res.status(503).json({ error: 'Google OAuth is not configured' });
  });
}

if (githubAuthEnabled) {
  app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:email'], session: false, state: false }),
  );

  app.get('/auth/github/callback', (req, res, next) => {
    const end = authLoginDuration.startTimer({ provider: 'github' });
    passport.authenticate('github', { session: false }, (err, user, info) => {
      if (err) {
        authLoginsTotal.inc({ provider: 'github', status: 'error' });
        end();
        logger.error({ err }, 'GitHub strategy error');
        return res.redirect(`${FRONTEND_URL}?auth_error=strategy_error`);
      }
      if (!user) {
        authLoginsTotal.inc({ provider: 'github', status: 'no_user' });
        end();
        logger.warn({ info }, 'No user returned from GitHub');
        return res.redirect(`${FRONTEND_URL}?auth_error=no_user`);
      }
      logger.info({ userId: user.id }, 'GitHub user authenticated');
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
      authLoginsTotal.inc({ provider: 'github', status: 'success' });
      authTokensIssuedTotal.inc();
      end();
      logger.debug({ userId: user.id }, 'Token created');
      res.redirect(`${FRONTEND_URL}?token=${encodeURIComponent(token)}`);
    })(req, res, next);
  });
} else {
  app.get(['/auth/github', '/auth/github/callback'], (_req, res) => {
    authLoginsTotal.inc({ provider: 'github', status: 'disabled' });
    res.status(503).json({ error: 'GitHub OAuth is not configured' });
  });
}

// ── Token verification ────────────────────────────────────────────────────────

app.get('/auth/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const user = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/auth/logout', (_req, res) => {
  res.json({ ok: true });
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

const PORT = process.env.PORT || 3003;
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => logger.info({ port: PORT }, 'auth-service ready'));
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
