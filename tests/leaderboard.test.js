import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { prepareDatabase, truncateTables } from './db.js';

let app;
let pool;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await prepareDatabase();
  await truncateTables('leaderboard_scores');
  ({ app, pool } = await import('../leaderboard-api/index.js'));
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/scores', () => {
  it('returns 200 with empty array when store is empty', async () => {
    const res = await request(app).get('/api/scores');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns at most limit results', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/scores').send({
        winner: i % 2,
        gameMode: 'test',
        p0Moves: 10,
        p1Moves: 8,
      });
    }
    const res = await request(app).get('/api/scores?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/api/scores?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it('defaults to 20 when limit is NaN', async () => {
    const res = await request(app).get('/api/scores?limit=abc');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(20);
  });

  it('defaults to 20 when limit is negative', async () => {
    const res = await request(app).get('/api/scores?limit=-5');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(20);
  });

  it('returns scores newest-first', async () => {
    await truncateTables('leaderboard_scores');
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/scores').send({
        winner: i,
        gameMode: `mode${i}`,
        p0Moves: i,
        p1Moves: i + 1,
      });
    }
    const res = await request(app).get('/api/scores');
    expect(res.body[0].game_mode).toBe('mode2');
    expect(res.body[1].game_mode).toBe('mode1');
    expect(res.body[2].game_mode).toBe('mode0');
  });
});

describe('POST /api/scores', () => {
  beforeAll(async () => {
    await truncateTables('leaderboard_scores');
  });

  it('returns 201 with id for valid payload', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 0,
      gameMode: 'local',
      p0Moves: 15,
      p1Moves: 12,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
  });

  it('persisted entry is readable via GET', async () => {
    const postRes = await request(app).post('/api/scores').send({
      winner: 1,
      gameMode: 'remote',
      p0Moves: 8,
      p1Moves: 20,
    });
    const getRes = await request(app).get('/api/scores');
    const found = getRes.body.find(s => s.id === postRes.body.id);
    expect(found).toBeDefined();
    expect(found.winner).toBe(1);
    expect(found.game_mode).toBe('remote');
  });

  it('returns 400 when winner is string', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 'player1',
      gameMode: 'test',
      p0Moves: 5,
      p1Moves: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when gameMode is missing', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 0,
      p0Moves: 5,
      p1Moves: 5,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when p0Moves is string', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 0,
      gameMode: 'test',
      p0Moves: 'five',
      p1Moves: 5,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when p1Moves is missing', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 0,
      gameMode: 'test',
      p0Moves: 5,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app).post('/api/scores').send({});
    expect(res.status).toBe(400);
  });

  it('returns 201 for winner=1 and gameMode=remote', async () => {
    const res = await request(app).post('/api/scores').send({
      winner: 1,
      gameMode: 'remote',
      p0Moves: 3,
      p1Moves: 7,
    });
    expect(res.status).toBe(201);
  });

  it('each POST returns a unique id', async () => {
    const res1 = await request(app).post('/api/scores').send({
      winner: 0,
      gameMode: 'test1',
      p0Moves: 1,
      p1Moves: 1,
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const res2 = await request(app).post('/api/scores').send({
      winner: 1,
      gameMode: 'test2',
      p0Moves: 2,
      p1Moves: 2,
    });
    expect(res1.body.id).not.toBe(res2.body.id);
  });
});
