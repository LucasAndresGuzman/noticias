// Evidencia curada a mano: vive en config/facts.json (versionada en git) y se copia a la base en cada corrida.
// Cada prueba cita su fuente (label y url) para que cualquiera pueda revisarla.
import { readFileSync } from 'node:fs';
import { validateFact } from './validate.mjs';

export function loadFacts(path = new URL('../config/facts.json', import.meta.url)) {
  const all = JSON.parse(readFileSync(path, 'utf8'));
  const seen = new Set();
  for (const f of all) {
    validateFact(f);
    if (seen.has(f.id)) throw new Error(`Hecho inválido: id repetido ${f.id}`);
    seen.add(f.id);
  }
  return all;
}

/** Guarda en el repositorio los hechos del archivo. Devuelve cuántos sincronizó. */
export async function syncFacts(repo, facts = loadFacts()) {
  for (const f of facts) await repo.upsertFact(f);
  return facts.length;
}
