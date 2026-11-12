import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../src/repo-memory.mjs';
import { attachVideos, ingestVideos, resolveChannel, videoIdFromUrl } from '../src/videos.mjs';
import { handleRequest } from '../src/api.mjs';
import { runOnce } from '../src/run.mjs';
import { syncFacts, loadFacts } from '../src/facts.mjs';

const CH = 'UC_lEiu6917IJz03TnntWUaQ';
const atom = (entries) =>
  `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">${entries
    .map((e) => `<entry><id>yt:video:${e.id}</id><title>${e.title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${e.id}"/><published>${e.at}</published></entry>`)
    .join('')}</feed>`;
const ok = (body) => ({ ok: true, status: 200, text: async () => body });

test('videoIdFromUrl solo acepta IDs de 11 caracteres', () => {
  assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=abcDEF12345'), 'abcDEF12345');
  assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=corto'), null);
  assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v="><script>'), null);
  assert.equal(videoIdFromUrl('no es una url'), null);
});

test('resolveChannel acepta el ID, resuelve un @usuario y rechaza referencias raras', async () => {
  assert.deepEqual(await resolveChannel(CH), { id: CH, title: '' });
  const html = `<html><head><meta property="og:title" content="CNN en Español"><link rel="canonical" href="https://www.youtube.com/channel/${CH}"></head></html>`;
  let url;
  const r = await resolveChannel('@canal-de-prueba', { fetchFn: async (u) => ((url = u), ok(html)) });
  assert.equal(r.id, CH);
  assert.equal(r.title, 'CNN en Español');
  assert.equal(url, 'https://www.youtube.com/@canal-de-prueba');
  await assert.rejects(() => resolveChannel('https://evil.example/x'), /inválida/);
  await assert.rejects(() => resolveChannel('@sin-id-en-la-pagina', { fetchFn: async () => ok('<html></html>') }), /ID del canal/);
});

test('ingestVideos guarda los videos del canal, ignora fechas futuras y reporta errores sin frenar', async () => {
  const repo = createMemoryRepo();
  const feed = atom([
    { id: 'AAAAAAAAAAA', title: 'Misa multitudinaria del papa León XIV en Luján', at: '2026-11-11T10:00:00+00:00' },
    { id: 'BBBBBBBBBBB', title: 'Video del futuro que no existe todavía', at: '2027-01-01T00:00:00+00:00' }
  ]);
  const fetchFn = async (u) => (u.includes('feeds/videos.xml') ? ok(feed) : { ok: false, status: 500, text: async () => '' });
  const sources = [
    { outlet: 'CNN en Español', youtube: CH },
    { outlet: 'Otro', youtube: '@roto-por-completo' },
    { outlet: 'Sin canal' }
  ];
  const r = await ingestVideos({ sources, fetchFn, repo, now: new Date('2026-11-11T12:00:00Z') });
  assert.equal(r.channels, 2);
  assert.equal(r.fresh, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].outlet, 'Otro');
  const v = await repo.listVideosSince('2026-11-01T00:00:00Z');
  assert.equal(v.length, 1);
  assert.equal(v[0].url, 'https://www.youtube.com/watch?v=AAAAAAAAAAA');
});

test('attachVideos asocia por similitud de titular, no mezcla temas y limita a 2 por medio', () => {
  const top = {
    AR: [{ title: 'León XIV cierra su visita a la Argentina con una misa multitudinaria en Luján', articles: [{ title: 'Misa multitudinaria de León XIV en Luján cierra la visita' }] }]
  };
  const mk = (id, outlet, title, at) => ({ id, outlet, title, url: `https://www.youtube.com/watch?v=${id}`, publishedAt: at });
  const videos = [
    mk('AAAAAAAAAAA', 'CNN en Español', 'Misa multitudinaria de León XIV en Luján', '2026-11-11T10:00:00Z'),
    mk('BBBBBBBBBBB', 'CNN en Español', 'León XIV cierra su visita a la Argentina con una misa en Luján', '2026-11-11T11:00:00Z'),
    mk('CCCCCCCCCCC', 'CNN en Español', 'Misa multitudinaria de León XIV en Luján: resumen', '2026-11-11T12:00:00Z'),
    mk('DDDDDDDDDDD', 'C5N', 'Receta de empanadas tucumanas para el fin de semana', '2026-11-11T11:00:00Z'),
    mk('EEEEEEEEEEE', 'C5N', 'León XIV', '2026-11-11T11:00:00Z')
  ];
  attachVideos(top, videos);
  const got = top.AR[0].videos;
  assert.equal(got.filter((v) => v.outlet === 'CNN en Español').length, 2, 'máximo 2 por medio');
  assert.ok(!got.some((v) => v.outlet === 'C5N'), 'ni un tema distinto ni un titular de una sola palabra');
  assert.ok(got.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.videoId) && v.url.startsWith('https://www.youtube.com/watch?v=')));
});

test('runOnce lee los videos de los canales y los pone en el hecho que corresponde', async () => {
  const repo = createMemoryRepo();
  const f = loadFacts().find((x) => x.id === 'papa-leon-xiv-mision-lujan');
  const title = 'León XIV cierra su visita a la Argentina con una misa multitudinaria en Luján';
  await repo.upsertArticles([{ id: f.articleIds[0], outlet: 'Telefe', owner: 'G', title, publishedAt: '2026-11-11T10:00:00Z', country: 'AR', url: 'https://x.invalid/1' }]);
  await syncFacts(repo);
  const feed = atom([{ id: 'AAAAAAAAAAA', title: 'Misa multitudinaria de León XIV en Luján: así cerró su visita a la Argentina', at: '2026-11-11T11:00:00+00:00' }]);
  const fetchFn = async (u) => ok(u.includes('feeds/videos.xml') ? feed : '<rss><channel></channel></rss>');
  await runOnce({ repo, sources: [{ outlet: 'CNN en Español', owner: 'Skydance', country: 'AR', feedUrl: 'https://a.invalid/rss', youtube: CH }], fetchFn, now: new Date('2026-11-11T12:00:00Z') });
  const snap = await repo.latestSnapshot();
  assert.equal(snap.payload.top.AR[0].videos.length, 1);
  assert.equal(snap.payload.top.AR[0].videos[0].outlet, 'CNN en Español');
  assert.equal(snap.payload.ingest.videos.fresh, 1);
});

test('la API avisa qué medios tienen lector de videos y la página solo permite el reproductor de YouTube sin cookies', async () => {
  const repo = createMemoryRepo();
  const env = { BASIC_AUTH_USER: 'u', BASIC_AUTH_PASS: 'p' };
  const headers = { authorization: 'Basic ' + Buffer.from('u:p').toString('base64') };
  const src = JSON.parse((await handleRequest({ method: 'GET', url: '/api/sources', headers }, { repo, env })).body).sources;
  assert.equal(src.find((s) => s.outlet === 'CNN en Español').video, true);
  assert.equal(src.find((s) => s.outlet === 'LN+').video, true);
  assert.match(src.find((s) => s.outlet === 'LN+').videoCanal, /La Nación/);
  assert.ok(!JSON.stringify(src).includes('UC_') && !JSON.stringify(src).includes('@cnnee'), 'no expone la referencia del canal');
  const page = await handleRequest({ method: 'GET', url: '/', headers }, { repo, env });
  assert.match(page.headers['content-security-policy'], /frame-src https:\/\/www\.youtube-nocookie\.com;/);
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
});
