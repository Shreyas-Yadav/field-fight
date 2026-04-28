import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pinoHttp from 'pino-http';
import client from 'prom-client';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = join(__dirname, 'users.json');

const JWT_SECRET    = process.env.JWT_SECRET    || 'magnet-arena-dev-secret';
const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:5173';
const SERVICE_URL   = process.env.SERVICE_URL   || 'http://localhost:3003';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
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

// ── User store (flat JSON) ────────────────────────────────────────────────────

function loadUsers() {
  if (!existsSync(USERS_PATH)) return [];
  try { return JSON.parse(readFileSync(USERS_PATH, 'utf8')); } catch { return []; }
}

function saveUsers(users) {
  try {
    writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to persist users.json');
    throw err;
  }
}

function upsertUser({ provider, providerId, name, avatar }) {
  const users = loadUsers();
  let user = users.find(u => u.provider === provider && u.providerId === providerId);
  if (!user) {
    user = {
      id: `${provider}:${providerId}`,
      provider,
      providerId,
      name,
      avatar: avatar ?? null,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
  }
  return user;
}

// ── Passport strategies ───────────────────────────────────────────────────────

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID     || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL:  `${SERVICE_URL}/auth/google/callback`,
  },
  (_accessToken, _refreshToken, profile, done) => {
    const user = upsertUser({
      provider:   'google',
      providerId: profile.id,
      name:       profile.displayName,
      avatar:     profile.photos?.[0]?.value,
    });
    done(null, user);
  },
));

passport.use(new GitHubStrategy(
  {
    clientID:     process.env.GITHUB_CLIENT_ID     || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackURL:  `${SERVICE_URL}/auth/github/callback`,
    state:        false,
  },
  (_accessToken, _refreshToken, profile, done) => {
    const user = upsertUser({
      provider:   'github',
      providerId: String(profile.id),
      name:       profile.displayName || profile.username,
      avatar:     profile.photos?.[0]?.value,
    });
    done(null, user);
  },
));

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(pinoHttp({
  logger,
  ignore: (req) => req.url.includes('/callback'),
}));
app.use(passport.initialize());

// ── Metrics endpoint ──────────────────────────────────────────────────────────

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── OAuth routes ──────────────────────────────────────────────────────────────

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
app.listen(PORT, () => logger.info({ port: PORT }, 'auth-service ready'));
