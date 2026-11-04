import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../src/repo-memory.mjs';
import { idFromUrl, ingestSources, loadSources } from '../src/ingest.mjs';
import { runOnce } from '../src/run.mjs';
import { validateFact } from '../src/validate.mjs';
import { articles, facts, previous, NOW } from './fixtures.mjs';

const NOWD = new Date('2026-11-04T12:00:00Z');
const feed = (items) =>
  `<rss><channel>${items.map(([t, l, d]) => `<item><title>${t}</title><link>${l}</link><pubDate>${d}</pubDate></item>`).join('')}</channel></rss>`;

const okFetch = (map) => async (url) =>
  map[url] === undefined ? { ok: false, status: 500, text: async () => '' } : { ok: true, status: 200, text: async () => map[url] };

test('ingesta: un feed caído no frena a los demás y no duplica al repetir', async () => {
  const repo = createMemoryRepo();
  const sources = [
    { outlet: 'A', owner: 'GA', country: 'AR', feedUrl: 'https://a.invalid/rss' },
    { outlet: 'B', owner: 'GB', country: 'AR', feedUrl: 'https://caido.invalid/rss' }
  ];
  const fetchFn = okFetch({
    'https://a.invalid/rss': feed([
      ['Temporal en el sur', 'https://a.invalid/1', 'Wed, 04 Nov 2026 11:00:00 GMT'],
      ['Nota del futuro', 'https://a.invalid/2', 'Thu, 05 Nov 2026 11:00:00 GMT']
    ])
  });
  const r1 = await ingestSources({ sources, fetchFn, repo, now: NOWD });
  assert.equal(r1.fresh, 1);
  assert.equal(r1.errors.length, 1);
  assert.equal(r1.errors[0].outlet, 'B');
  const r2 = await ingestSources({ sources, fetchFn, repo, now: NOWD });
  assert.equal(r2.fresh, 0);
});

test('config/sources.json: sin URLs cargadas no se lee ninguna fuente', () => {
  assert.equal(loadSources().length, 0);
});

test('flujo completo con datos de ejemplo: 10 hechos y cambio de 3 horas', async () => {
  const repo = createMemoryRepo();
  await repo.upsertArticles(articles);
  for (const f of facts) await repo.upsertFact(f);
  await repo.recordLevels([{ factId: 'denuncia', at: '2026-11-04T08:55:00.000Z', level: 55 }]);
  const r = await runOnce({ repo, sources: [], now: new Date(NOW) });
  assert.equal(r.published, 10);
  assert.equal(r.pendingReview, 1);
  assert.equal(r.noEvidence, 1);
  const snap = await repo.latestSnapshot();
  const d = snap.payload.top.AR.find((x) => x.factId === 'denuncia');
  assert.equal(d.level, 47);
  assert.equal(d.delta, -8);
});

test('de feed a Top 10: tres medios, una evidencia, un hecho publicado', async () => {
  const repo = createMemoryRepo();
  const links = ['https://a.invalid/n', 'https://b.invalid/n', 'https://c.invalid/n'];
  const title = 'Anuncian nuevas medidas económicas del gobierno';
  const sources = ['a', 'b', 'c'].map((x) => ({ outlet: x.toUpperCase(), owner: `G${x}`, country: 'AR', feedUrl: `https://${x}.invalid/rss` }));
  const fetchFn = okFetch(
    Object.fromEntries(sources.map((s, i) => [s.feedUrl, feed([[title, links[i], 'Wed, 04 Nov 2026 11:00:00 GMT']])]))
  );
  const fact = validateFact({
    id: 'medidas',
    articleIds: links.map(idFromUrl),
    category: 'Economía',
    evidence: [{ id: 'e1', type: 'official_statement', origin: 'bcra' }, { id: 'e2', type: 'independent_outlets', origin: 'prensa' }]
  });
  await repo.upsertFact(fact);
  await runOnce({ repo, sources, fetchFn, now: NOWD });
  const top = (await repo.latestSnapshot()).payload.top.AR;
  assert.equal(top.length, 1);
  assert.equal(top[0].outlets, 3);
  assert.equal(top[0].level, 30);
});

test('validateFact rechaza tipos desconocidos, ids repetidos y contradicciones fantasma', () => {
  const base = { id: 'x', articleIds: ['1'], evidence: [{ id: 'e1', type: 'single_source' }] };
  assert.doesNotThrow(() => validateFact(base));
  assert.throws(() => validateFact({ ...base, evidence: [{ id: 'e1', type: 'inventado' }] }), /desconocido/);
  assert.throws(() => validateFact({ ...base, evidence: [...base.evidence, { id: 'e1', type: 'single_source' }] }), /repetido/);
  assert.throws(() => validateFact({ ...base, contradictions: [{ a: 'e1', b: 'zz' }] }), /no existe/);
  assert.throws(() => validateFact({ ...base, articleIds: [] }), /nota/);
});
