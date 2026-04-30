import pg from 'pg';

const { Pool } = pg;

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://magnet_vis:magnet_vis_password@127.0.0.1:55432/magnet_vis';

export async function prepareDatabase() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { migrate } = await import('../migrations/migrate.js');
  await migrate();
}

export async function truncateTables(...tables) {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    if (tables.length) {
      await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}
