// Servidor web mínimo (Render o cualquier host con Node). Sin dependencias.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { handleRequest } from './api.mjs';
import { createPgRepo, createPoolFromEnv, ensureSchema } from './repo-pg.mjs';

export function makeServer(repo, env = process.env) {
  return createServer(async (req, res) => {
    try {
      const r = await handleRequest({ method: req.method, url: req.url ?? '/', headers: req.headers }, { repo, env });
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error interno' }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = await createPoolFromEnv();
  await ensureSchema(pool);
  const repo = createPgRepo(pool);
  const port = Number(process.env.PORT ?? 3000);
  makeServer(repo).listen(port, () => console.log(`API privada escuchando en el puerto ${port}`));
}
