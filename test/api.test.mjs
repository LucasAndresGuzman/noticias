import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../src/repo-memory.mjs';
import { checkAuth, handleRequest } from '../src/api.mjs';
import { makeServer } from '../src/server.mjs';
import { startLoop } from '../src/worker.mjs';
import { runOnce } from '../src/run.mjs';
import { articles, facts, NOW } from './fixtures.mjs';

const ENV = { BASIC_AUTH_USER: 'luc', BASIC_AUTH_PASS: 'clave-de-prueba' };
const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
const get = (url, authorization) => ({ method: 'GET', url, headers: authorization ? { authorization } : {} });

async function seededRepo() {
  const repo = createMemoryRepo();
  await repo.upsertArticles(articles);
  for (const f of facts) await repo.upsertFact(f);
  await runOnce({ repo, sources: [], now: new Date(NOW) });
  return repo;
}

test('sin credenciales configuradas, la API rechaza todo (falla cerrado)', async () => {
  const repo = await seededRepo();
  const r = await handleRequest(get('/api/top', basic('luc', 'clave-de-prueba')), { repo, env: {} });
  assert.equal(r.status, 503);
});

test('sin credenciales o con contraseña incorrecta devuelve 401', async () => {
  const repo = await seededRepo();
  const sin = await handleRequest(get('/api/top'), { repo, env: ENV });
  assert.equal(sin.status, 401);
  assert.match(sin.headers['www-authenticate'], /Basic/);
  const mala = await handleRequest(get('/api/top', basic('luc', 'otra')), { repo, env: ENV });
  assert.equal(mala.status, 401);
  assert.equal(checkAuth('Basic !!!', ENV).ok, false);
  assert.equal(checkAuth(basic('luc', 'clave-de-prueba '), ENV).ok, false);
  assert.equal(checkAuth(basic('luc2', 'clave-de-prueba'), ENV).ok, false);
  assert.equal(checkAuth(basic('luc', 'clave-de-prueba'), ENV).ok, true);
});

test('con credenciales correctas entrega el Top 10 y no deja que se guarde en caché', async () => {
  const repo = await seededRepo();
  const r = await handleRequest(get('/api/top?country=ar', basic('luc', 'clave-de-prueba')), { repo, env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['x-robots-tag'], /noindex/);
  const body = JSON.parse(r.body);
  assert.equal(body.country, 'AR');
  assert.equal(body.items.length, 10);
  assert.equal(body.items[0].position, 1);
});

test('/api/pending muestra lo que espera revisión y lo que no tiene evidencia', async () => {
  const repo = await seededRepo();
  const body = JSON.parse((await handleRequest(get('/api/pending', basic('luc', 'clave-de-prueba')), { repo, env: ENV })).body);
  assert.equal(body.pendingReview.length, 1);
  assert.equal(body.noEvidence.length, 1);
});

test('país inválido, ruta inexistente, método no permitido y base vacía', async () => {
  const repo = createMemoryRepo();
  const auth = basic('luc', 'clave-de-prueba');
  assert.equal((await handleRequest(get('/api/top?country=ARG', auth), { repo, env: ENV })).status, 400);
  assert.equal((await handleRequest(get('/api/nada', auth), { repo, env: ENV })).status, 404);
  assert.equal((await handleRequest({ method: 'POST', url: '/api/top', headers: { authorization: auth } }, { repo, env: ENV })).status, 405);
  const vacio = JSON.parse((await handleRequest(get('/api/top', auth), { repo, env: ENV })).body);
  assert.deepEqual(vacio, { country: 'AR', generatedAt: null, items: [] });
});

test('/api/health no pide contraseña y no expone datos', async () => {
  const r = await handleRequest(get('/api/health'), { repo: createMemoryRepo(), env: ENV });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true });
});

test('servidor HTTP real: 401 sin clave, 200 con clave', async () => {
  const repo = await seededRepo();
  const server = makeServer(repo, ENV);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/top`)).status, 401);
    const res = await fetch(`${base}/api/top`, { headers: { authorization: basic('luc', 'clave-de-prueba') } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).items.length, 10);
  } finally {
    server.close();
  }
});

test('el worker no superpone corridas y sigue vivo ante un error', async () => {
  let calls = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const errors = [];
  const timer = startLoop({
    intervalMs: 5,
    log: { error: (...a) => errors.push(a.join(' ')) },
    run: async () => {
      calls++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      if (calls === 1) throw new Error('falló la primera');
    }
  });
  await new Promise((r) => setTimeout(r, 120));
  clearInterval(timer);
  assert.equal(maxConcurrent, 1);
  assert.ok(calls >= 2, 'siguió corriendo después del error');
  assert.match(errors[0], /falló la primera/);
});
