// Crea las tablas. Uso: DATABASE_URL=... npm run migrate
import { createPoolFromEnv, ensureSchema } from '../src/repo-pg.mjs';

const pool = await createPoolFromEnv();
try {
  await ensureSchema(pool);
  console.log('Tablas listas.');
} finally {
  await pool.end();
}
