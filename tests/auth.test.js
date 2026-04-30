import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prepareDatabase, truncateTables } from './db.js';

const JWT_SECRET = 'magnet-arena-dev-secret';

let app;
let pool;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GITHUB_CLIENT_ID = 'test-github-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret';
  await prepareDatabase();
  await truncateTables('users');
  ({ app, pool } = await import('../auth-service/index.js'));
});

afterAll(async () => {
  await pool.end();
});

describe('GET /auth/verify', () => {
  it('returns 200 with user payload for valid token', async () => {
    const token = jwt.sign(
      { id: 'google:123', provider: 'google', name: 'Test User' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe('google:123');
    expect(res.body.user.name).toBe('Test User');
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when header has no "Bearer " prefix', async () => {
    const token = jwt.sign({ id: 'test' }, JWT_SECRET);
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Basic ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong secret', async () => {
    const token = jwt.sign({ id: 'test' }, 'wrong-secret', { expiresIn: '7d' });
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired token', async () => {
    const token = jwt.sign({ id: 'test' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed token string', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 for empty Bearer value', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('custom claims are preserved in returned user', async () => {
    const token = jwt.sign(
      {
        id: 'github:456',
        provider: 'github',
        name: 'GitHub User',
        avatar: 'https://example.com/avatar.png',
        customClaim: 'custom-value',
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.customClaim).toBe('custom-value');
    expect(res.body.user.avatar).toBe('https://example.com/avatar.png');
  });
});

describe('POST /auth/logout', () => {
  it('returns 200 with valid token', async () => {
    const token = jwt.sign({ id: 'test' }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 with no token', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 with invalid token', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer invalid.token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
