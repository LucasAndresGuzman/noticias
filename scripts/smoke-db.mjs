// Prueba de humo de la capa PostgreSQL contra la base REAL. Uso: DATABASE_URL=... npm run smoke-db
// Crea datos con prefijo "smoke-", los verifica y los borra. No toca otros datos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPgRepo, createPoolFromEnv } from '../src/repo-pg.mjs';

const pool = await createPoolFromEnv();
const repo = createPgRepo(pool);
const now = new Date();
const at = (min) => new Date(now - min * 60000).toISOString();

try {
  await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));

  // Notas
  const art = { id: 'smoke-a1', outlet: 'Medio X', owner: 'Grupo X', title: 'Prueba', publishedAt: at(10), country: 'AR', url: 'https://ejemplo.invalid/smoke' };
  assert.equal(await repo.upsertArticles([art]), 1);
  assert.equal(await repo.upsertArticles([art]), 0, 'una nota repetida no debe duplicarse');
  const listed = (await repo.listArticlesSince(at(60))).find((a) => a.id === 'smoke-a1');
  assert.ok(listed && listed.publishedAt === art.publishedAt, 'la fecha debe volver igual');

  // Hechos (JSON ida y vuelta)
  const fact = { id: 'smoke-f1', articleIds: ['smoke-a1'], category: 'Prueba', evidence: [{ id: 'e1', type: 'single_source' }], contradictions: [], flags: { sensitive: false }, alerts: ['x'], note: 'n' };
  await repo.upsertFact(fact);
  const back = (await repo.listFacts()).find((f) => f.id === 'smoke-f1');
  assert.deepEqual(back, fact);

  // Historial
  await repo.recordLevels([{ factId: 'smoke-f1', at: at(200), level: 40 }, { factId: 'smoke-f1', at: at(10), level: 50 }]);
  assert.equal((await repo.levelsAt(at(180)))['smoke-f1'], 40, 'debe devolver el último nivel anterior al corte');

  // Foto
  await repo.saveSnapshot({ generatedAt: at(0), payload: { top: { AR: [] }, marca: 'smoke' } });
  const snap = await repo.latestSnapshot();
  assert.ok(snap && snap.payload && typeof snap.generatedAt === 'string');

  console.log('Capa PostgreSQL: OK');
} finally {
  await pool.query(`delete from articles where id like 'smoke-%'`);
  await pool.query(`delete from facts where id like 'smoke-%'`);
  await pool.query(`delete from level_history where fact_id like 'smoke-%'`);
  await pool.query(`delete from snapshots where payload->>'marca' = 'smoke'`);
  await pool.end();
}
