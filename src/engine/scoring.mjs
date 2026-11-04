// Motor del nivel de respaldo de evidencia. Implementa las reglas de la especificación.
// Los pesos son valores iniciales a calibrar con casos reales.

export const WEIGHTS = {
  judicial_resolution: 25, // resolución judicial, o comunicado oficial + prueba independiente
  verified_video: 20, // fecha y lugar confirmados por al menos dos métodos
  independent_outlets: 16, // varios medios independientes con fuentes propias
  official_statement: 14, // comunicado de una parte interesada
  court_filing: 10, // denuncia o expediente sin resolución
  single_source: 6, // un solo medio o fuente anónima
  unverified_social: 1 // redes sociales sin verificar
};

export const CAP = 95;
export const CONFIRMED_MIN = 85;
export const DENIED_MAX = 9;
export const COORDINATION_PENALTY_MAX = 5;

export const LABELS = [
  { name: 'Confirmado', min: 85, max: 95 },
  { name: 'Respaldo alto', min: 70, max: 84 },
  { name: 'Respaldo medio', min: 50, max: 69 },
  { name: 'Respaldo parcial', min: 30, max: 49 },
  { name: 'Sin confirmar', min: 0, max: 29 }
];

const labelFor = (level) => LABELS.find((l) => level >= l.min && level <= l.max).name;

// Regla 1: las pruebas con el mismo origen se agrupan y cuentan una sola vez
// (la de mayor peso del grupo).
function groupByOrigin(items) {
  const best = new Map();
  for (const it of items) {
    const key = it.origin ?? `__own_${best.size}`;
    const prev = best.get(key);
    if (!prev || WEIGHTS[it.type] > WEIGHTS[prev.type]) best.set(key, it);
  }
  return [...best.values()];
}

/**
 * items: [{ id, type, origin?, reusedVideo?, coordinated? }]
 * contradictions: [{ a: id, b: id }]  (dos pruebas de peso medio o alto que se contradicen)
 * flags: { primaryOrJudicial: bool, independentEvidence: bool, deniedByPrimary: bool,
 *          humanReviewed: bool, sensitive: bool }
 */
export function score(items, contradictions = [], flags = {}) {
  const lines = [];
  let total = 0;

  const valid = [];
  for (const it of items) {
    if (it.type === 'verified_video' && it.reusedVideo) {
      // Regla 4: video reutilizado no suma y genera alerta.
      lines.push({ id: it.id, label: 'Video reutilizado: no suma, genera alerta', value: 0 });
      continue;
    }
    if (it.coordinated) continue; // se penaliza aparte (regla 3)
    valid.push(it);
  }

  for (const it of groupByOrigin(valid)) {
    const w = WEIGHTS[it.type];
    if (w === undefined) throw new Error(`Tipo de prueba desconocido: ${it.type}`);
    lines.push({ id: it.id, label: it.type, value: w });
    total += w;
  }

  // Regla 3: actividad coordinada resta hasta 5 puntos.
  const coordinated = items.filter((i) => i.coordinated).length;
  if (coordinated > 0) {
    const pen = Math.min(COORDINATION_PENALTY_MAX, coordinated);
    lines.push({ label: 'Actividad coordinada en redes', value: -pen });
    total -= pen;
  }

  // Regla 2: contradicciones entre pruebas de peso medio o alto restan.
  const weightOf = Object.fromEntries(items.map((i) => [i.id, WEIGHTS[i.type]]));
  let disputed = false;
  for (const c of contradictions) {
    const wa = weightOf[c.a] ?? 0;
    const wb = weightOf[c.b] ?? 0;
    if (wa >= WEIGHTS.court_filing && wb >= WEIGHTS.court_filing) {
      const pen = Math.round(Math.min(wa, wb) * 0.65);
      lines.push({ label: 'Contradicción entre pruebas', value: -pen });
      total -= pen;
      disputed = true;
    }
  }

  total = Math.max(0, total);

  // Regla 5: tope de 95 y umbral de Confirmado.
  let level = Math.min(total, CAP);
  if (level >= CONFIRMED_MIN && !(flags.primaryOrJudicial && flags.independentEvidence)) {
    level = CONFIRMED_MIN - 1;
  }

  // Regla 6: desmentido por fuente primaria con evidencia.
  const denied = !!flags.deniedByPrimary;
  if (denied) level = Math.min(level, DENIED_MAX);

  // Regla 7: Confirmado o Desmentido, o tema sensible, exigen revisión humana para publicarse.
  const needsReview = level >= CONFIRMED_MIN || denied || !!flags.sensitive;
  const publishable = !needsReview || !!flags.humanReviewed;

  const label = denied ? 'Desmentido' : disputed ? 'En disputa' : labelFor(level);
  return { level, label, lines, needsReview, publishable };
}
