// Carga DATOS FICTICIOS con fechas relativas a ahora y corre el cálculo una vez.
// Sirve para probar la API y la web sin feeds reales. Uso: DATABASE_URL=... npm run seed-demo
import { articles, facts, previous, NOW } from '../test/fixtures.mjs';
import { createPgRepo, createPoolFromEnv } from '../src/repo-pg.mjs';
import { runOnce } from '../src/run.mjs';

const now = new Date();
const shift = now - Date.parse(NOW);
const repo = createPgRepo(await createPoolFromEnv());
try {
  await repo.upsertArticles(articles.map((a) => ({ ...a, id: `demo-${a.id}`, publishedAt: new Date(Date.parse(a.publishedAt) + shift).toISOString() })));
  for (const f of facts) await repo.upsertFact({ ...f, id: `demo-${f.id}`, articleIds: f.articleIds.map((i) => `demo-${i}`) });
  const threeHoursAgo = new Date(now - 3 * 3600e3 - 60e3).toISOString();
  await repo.recordLevels(Object.entries(previous).map(([k, level]) => ({ factId: `demo-${k}`, at: threeHoursAgo, level })));
  const r = await runOnce({ repo, sources: [], now });
  console.log(`Demo cargada: ${r.published} hechos publicados, ${r.pendingReview} en revisión, ${r.noEvidence} sin evidencia.`);
} finally {
  await repo.close();
}
