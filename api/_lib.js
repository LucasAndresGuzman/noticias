// Adaptador para Vercel (funciones). NO se pudo probar en el entorno de desarrollo.
// Usa la cadena de conexión "pooled" de Neon: en funciones sin estado abre una conexión por invocación.
import { handleRequest } from '../src/api.mjs';
import { createPgRepo, createPoolFromEnv } from '../src/repo-pg.mjs';

let repoPromise;
const getRepo = () => (repoPromise ??= createPoolFromEnv().then(createPgRepo));
const lazyRepo = { latestSnapshot: async () => (await getRepo()).latestSnapshot() };

export default async function handler(req, res) {
  try {
    const r = await handleRequest({ method: req.method, url: req.url, headers: req.headers }, { repo: lazyRepo });
    res.statusCode = r.status;
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
    res.end(r.body);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Error interno' }));
  }
}
