import { WEIGHTS } from './engine/scoring.mjs';

/** Rechaza un hecho mal formado antes de guardarlo, para no publicar niveles sin sentido. */
export function validateFact(f) {
  const fail = (m) => {
    throw new Error(`Hecho inválido: ${m}`);
  };
  if (!f || typeof f !== 'object') fail('no es un objeto');
  if (typeof f.id !== 'string' || !f.id.trim()) fail('falta "id"');
  if (!Array.isArray(f.articleIds) || f.articleIds.length === 0) fail('falta al menos una nota (articleIds o articleUrls)');
  if (!Array.isArray(f.evidence) || f.evidence.length === 0) fail('falta evidencia');
  const ids = new Set();
  for (const e of f.evidence) {
    if (typeof e.id !== 'string' || !e.id) fail('toda prueba necesita "id"');
    if (ids.has(e.id)) fail(`id de prueba repetido: ${e.id}`);
    ids.add(e.id);
    if (!(e.type in WEIGHTS)) fail(`tipo de prueba desconocido: ${e.type}. Válidos: ${Object.keys(WEIGHTS).join(', ')}`);
  }
  for (const c of f.contradictions ?? []) {
    if (!ids.has(c.a) || !ids.has(c.b)) fail(`la contradicción ${c.a} / ${c.b} nombra una prueba que no existe`);
  }
  return f;
}
