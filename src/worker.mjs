// Proceso que corre todo el día: lee noticias, calcula y guarda el resultado. Se despliega en Render.
import { pathToFileURL } from 'node:url';
import { createPgRepo, createPoolFromEnv, ensureSchema } from './repo-pg.mjs';
import { loadSources } from './ingest.mjs';
import { runOnce } from './run.mjs';

/** Ejecuta `run` cada `intervalMs`, sin superponer corridas y sin caerse ante un error. */
export function startLoop({ run, intervalMs, log = console }) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await run();
    } catch (e) {
      log.error('Corrida fallida:', e?.message ?? e);
    } finally {
      busy = false;
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

async function main() {
  const minutes = Number(process.env.WORKER_INTERVAL_MIN ?? 5);
  if (!(minutes >= 1)) throw new Error('WORKER_INTERVAL_MIN debe ser un número mayor o igual a 1');
  const pool = await createPoolFromEnv();
  await ensureSchema(pool);
  const repo = createPgRepo(pool);
  const sources = loadSources();
  if (sources.length === 0) console.warn('Ninguna fuente tiene feedUrl en config/sources.json: no se leerán noticias.');
  console.log(`Worker iniciado: ${sources.length} fuentes, cada ${minutes} min.`);
  startLoop({
    intervalMs: minutes * 60e3,
    run: async () => {
      const r = await runOnce({ repo, sources });
      console.log(JSON.stringify({ at: r.generatedAt, nuevas: r.ingest.fresh, publicadas: r.published, errores: r.ingest.errors }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
