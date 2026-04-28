import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

const DB_FILE = join(tmpdir(), `match-history-test-${Date.now()}.json`);

let app;

beforeAll(async () => {
  await writeFile(DB_FILE, '[]', 'utf8');
  process.env.NODE_ENV = 'test';
  process.env.MATCH_DB_PATH = DB_FILE;
  ({ app } = await import('../match-history-service/index.js'));
});

afterAll(async () => {
  await rm(DB_FILE, { force: true });
});

describe('GET /matches', () => {
  it('returns 200 with empty array when store is empty', async () => {
    const res = await request(app).get('/matches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns at most limit results', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/matches').send({
        p0Id: `player0`,
        p0Name: 'ALPHA',
        p1Id: `player1`,
        p1Name: 'BRAVO',
        winner: i % 2,
        gameMode: 'test',
      });
    }
    const res = await request(app).get('/matches?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/matches?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it('returns matches newest-first', async () => {
    await rm(DB_FILE, { force: true });
    await writeFile(DB_FILE, '[]', 'utf8');
    for (let i = 0; i < 3; i++) {
      await request(app).post('/matches').send({
        p0Id: 'player0',
        p0Name: `MATCH${i}`,
        p1Id: 'player1',
        p1Name: 'BRAVO',
        winner: i,
        gameMode: 'test',
      });
    }
    const res = await request(app).get('/matches');
    expect(res.body[0].p0Name).toBe('MATCH2');
    expect(res.body[1].p0Name).toBe('MATCH1');
    expect(res.body[2].p0Name).toBe('MATCH0');
  });
});

describe('GET /matches/player/:playerId', () => {
  beforeAll(async () => {
    await rm(DB_FILE, { force: true });
    await writeFile(DB_FILE, '[]', 'utf8');
    for (let i = 0; i < 5; i++) {
      await request(app).post('/matches').send({
        p0Id: i < 2 ? 'alice' : 'bob',
        p0Name: 'ALPHA',
        p1Id: i >= 2 ? 'alice' : 'charlie',
        p1Name: 'BRAVO',
        winner: i % 2,
        gameMode: 'test',
      });
    }
  });

  it('returns 200 with entries for a known player', async () => {
    const res = await request(app).get('/matches/player/alice');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('all returned entries have that player as p0 or p1', async () => {
    const res = await request(app).get('/matches/player/alice');
    res.body.forEach(match => {
      expect(match.p0Id === 'alice' || match.p1Id === 'alice').toBe(true);
    });
  });

  it('returns 200 with empty array for unknown player', async () => {
    const res = await request(app).get('/matches/player/unknown');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('respects the 20-entry cap', async () => {
    const res = await request(app).get('/matches/player/alice');
    expect(res.body.length).toBeLessThanOrEqual(20);
  });
});

describe('POST /matches', () => {
  beforeAll(async () => {
    await rm(DB_FILE, { force: true });
    await writeFile(DB_FILE, '[]', 'utf8');
  });

  it('returns 201 with id for minimal payload', async () => {
    const res = await request(app).post('/matches').send({
      winner: 0,
      gameMode: 'local',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
  });

  it('returns 201 for full payload with all optional fields', async () => {
    const res = await request(app).post('/matches').send({
      p0Id: 'player1',
      p0Name: 'Alice',
      p1Id: 'player2',
      p1Name: 'Bob',
      winner: 1,
      gameMode: 'remote',
      p0Moves: 25,
      p1Moves: 18,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('defaults p0Name to ALPHA', async () => {
    const postRes = await request(app).post('/matches').send({
      winner: 0,
      gameMode: 'test',
    });
    const getRes = await request(app).get('/matches?limit=1');
    expect(getRes.body[0].p0Name).toBe('ALPHA');
  });

  it('defaults p1Name to BRAVO', async () => {
    const postRes = await request(app).post('/matches').send({
      winner: 0,
      gameMode: 'test',
    });
    const getRes = await request(app).get('/matches?limit=1');
    expect(getRes.body[0].p1Name).toBe('BRAVO');
  });

  it('defaults p0Moves to 0', async () => {
    const postRes = await request(app).post('/matches').send({
      winner: 1,
      gameMode: 'test',
    });
    const getRes = await request(app).get('/matches?limit=1');
    expect(getRes.body[0].p0Moves).toBe(0);
  });

  it('defaults p1Moves to 0', async () => {
    const postRes = await request(app).post('/matches').send({
      winner: 1,
      gameMode: 'test',
    });
    const getRes = await request(app).get('/matches?limit=1');
    expect(getRes.body[0].p1Moves).toBe(0);
  });

  it('returns 400 when winner is string', async () => {
    const res = await request(app).post('/matches').send({
      winner: 'player1',
      gameMode: 'test',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when gameMode is missing', async () => {
    const res = await request(app).post('/matches').send({
      winner: 0,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when gameMode is number', async () => {
    const res = await request(app).post('/matches').send({
      winner: 0,
      gameMode: 123,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app).post('/matches').send({});
    expect(res.status).toBe(400);
  });

  it('persisted entry is readable via GET', async () => {
    const postRes = await request(app).post('/matches').send({
      p0Id: 'testplayer1',
      p0Name: 'TestAlpha',
      p1Id: 'testplayer2',
      p1Name: 'TestBravo',
      winner: 0,
      gameMode: 'testing',
      p0Moves: 30,
      p1Moves: 25,
    });
    const getRes = await request(app).get('/matches?limit=100');
    const found = getRes.body.find(m => m.id === postRes.body.id);
    expect(found).toBeDefined();
    expect(found.p0Id).toBe('testplayer1');
    expect(found.gameMode).toBe('testing');
  });
});
