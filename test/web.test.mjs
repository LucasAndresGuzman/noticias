import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../src/repo-memory.mjs';
import { handleRequest, describeSources } from '../src/api.mjs';
import { runOnce } from '../src/run.mjs';
import { loadFacts, syncFacts } from '../src/facts.mjs';

const ENV = { BASIC_AUTH_USER: 'luc', BASIC_AUTH_PASS: 'clave-de-prueba' };
const auth = 'Basic ' + Buffer.from('luc:clave-de-prueba').toString('base64');
const get = (url, a) => ({ method: 'GET', url, headers: a ? { authorization: a } : {} });

async function repoConHecho() {
  const repo = createMemoryRepo();
  const f = loadFacts().find((x) => x.id === 'papa-leon-xiv-mision-lujan');
  const mk = (id, outlet, owner, t) => ({ id, outlet, owner, title: 'León XIV cierra su visita a la Argentina con una misa multitudinaria en Luján', publishedAt: t, country: 'AR', url: `https://news.google.com/rss/articles/${id}` });
  await repo.upsertArticles([
    mk(f.articleIds[0], 'Telefe', 'Grupo Scaglione', '2026-11-11T10:00:00Z'),
    mk(f.articleIds[2], 'C5N', 'Grupo Indalo', '2026-11-11T10:30:00Z'),
    mk(f.articleIds[3], 'CNN en Español', 'Warner Bros. Discovery', '2026-11-11T11:00:00Z')
  ]);
  await repo.upsertArticles([{ id: 'zz', outlet: 'A24', owner: 'G', title: 'Un tema sin evidencia cargada todavía', publishedAt: '2026-11-11T11:00:00Z', country: 'AR', url: 'https://x.invalid/zz' }]);
  await syncFacts(repo);
  await runOnce({ repo, sources: [], now: new Date('2026-11-11T12:00:00Z') });
  return repo;
}

test('la página exige contraseña, no se guarda en caché y no permite recursos externos', async () => {
  const repo = await repoConHecho();
  const sin = await handleRequest(get('/'), { repo, env: ENV });
  assert.equal(sin.status, 401);
  assert.ok(!sin.body.includes('<script'));
  const ok = await handleRequest(get('/', auth), { repo, env: ENV });
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /text\/html/);
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.match(ok.headers['x-robots-tag'], /noindex/);
  assert.match(ok.headers['content-security-policy'], /default-src 'none'/);
  assert.match(ok.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(ok.body, /Verificador de noticias/);
  assert.ok(!/<script[^>]+src=/.test(ok.body), 'no debe cargar scripts externos');
  assert.ok(!/<link[^>]+href=/.test(ok.body), 'no debe cargar hojas externas');
});

test('/api/top entrega las pruebas con su fuente, las notas por medio y cuántos temas esperan evidencia', async () => {
  const repo = await repoConHecho();
  const body = JSON.parse((await handleRequest(get('/api/top?country=AR', auth), { repo, env: ENV })).body);
  assert.equal(body.items.length, 1);
  assert.equal(body.withoutEvidence, 1);
  assert.equal(body.candidates[0].title, 'Un tema sin evidencia cargada todavía');
  assert.deepEqual(body.candidates[0].medios, ['A24']);
  const it = body.items[0];
  assert.ok(it.evidence.length >= 3 && it.evidence.every((e) => e.label && e.url));
  const e1 = it.evidence.find((e) => e.id === 'e1');
  const e2 = it.evidence.find((e) => e.id === 'e2');
  assert.equal(e1.counted, true);
  assert.equal(e2.counted, false, 'la segunda prueba de la Santa Sede no suma: mismo origen');
  assert.deepEqual([...new Set(it.articles.map((a) => a.outlet))].sort(), ['C5N', 'CNN en Español', 'Telefe']);
});

test('/api/sources lista los 6 medios con su aclaración y sin exponer las direcciones de los feeds', async () => {
  const repo = createMemoryRepo();
  const r = await handleRequest(get('/api/sources', auth), { repo, env: ENV });
  const { sources } = JSON.parse(r.body);
  assert.equal(sources.length, 6);
  assert.ok(sources.every((s) => s.note && s.owner && s.ownership && s.ownershipAsOf));
  assert.ok(sources.every((s) => s.ownershipSources.length >= 1 && s.ownershipSources.every((f) => /^https:\/\//.test(f.url) && f.label)));
  assert.ok(!r.body.includes('feedUrl') && !r.body.includes('news.google.com'));
  assert.equal(describeSources().find((s) => s.outlet === 'LN+').method, 'rss');
});

test('las notas son texto: la página arma el contenido sin innerHTML ni eval', async () => {
  const repo = createMemoryRepo();
  const { body } = await handleRequest(get('/', auth), { repo, env: ENV });
  assert.ok(!/innerHTML|outerHTML|document\.write|eval\(/.test(body));
});
