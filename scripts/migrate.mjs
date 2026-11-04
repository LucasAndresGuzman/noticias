// Crea las tablas. Uso: DATABASE_URL=... npm run migrate
import { readFileSync } from 'node:fs';
import { createPoolFromEnv } from '../src/repo-pg.mjs';

const pool = await createPoolFromEnv();
try {
  await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('Tablas listas.');
} finally {
  await pool.end();
}
