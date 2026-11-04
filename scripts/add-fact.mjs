// Carga o actualiza la evidencia de un hecho. Uso: DATABASE_URL=... npm run add-fact -- archivo.json
// El JSON puede indicar las notas con "articleUrls" (se convierten a ids) o con "articleIds".
import { readFileSync } from 'node:fs';
import { createPgRepo, createPoolFromEnv } from '../src/repo-pg.mjs';
import { idFromUrl } from '../src/ingest.mjs';
import { validateFact } from '../src/validate.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run add-fact -- archivo.json');
  process.exit(1);
}
const fact = JSON.parse(readFileSync(file, 'utf8'));
if (fact.articleUrls) {
  fact.articleIds = [...(fact.articleIds ?? []), ...fact.articleUrls.map(idFromUrl)];
  delete fact.articleUrls;
}
validateFact(fact);

const repo = createPgRepo(await createPoolFromEnv());
try {
  await repo.upsertFact(fact);
  console.log(`Hecho "${fact.id}" guardado con ${fact.evidence.length} pruebas.`);
} finally {
  await repo.close();
}
