// Agrupación de notas por hecho y ranking del Top 10 de las últimas 24 horas.
// Criterios públicos: cobertura cruzada, diversidad de fuentes y velocidad de crecimiento.
// Los umbrales y pesos son valores iniciales a calibrar.

export const WINDOW_HOURS = 24;
export const RECENT_HOURS = 3;
export const SIMILARITY_MIN = 0.4;
export const RANK_WEIGHTS = { coverage: 0.5, diversity: 0.3, velocity: 0.2 };
export const COVERAGE_FULL = 10; // medios distintos para el máximo de cobertura
export const DIVERSITY_FULL = 6; // grupos propietarios distintos para el máximo de diversidad

const STOP = new Set(
  'a al algo ante con contra de del desde el en entre es la las lo los para por que se sin sobre su sus un una uno y o u e ha han fue son segun tras como mas muy este esta estos estas'.split(' ')
);

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

export function tokens(title) {
  return new Set(
    normalize(title)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * articles: [{ id, outlet, owner, title, publishedAt (ISO), country, url }]
 * Agrupa por país y por similitud de titular con la nota más parecida del grupo.
 */
export function cluster(articles, minSim = SIMILARITY_MIN) {
  const sorted = [...articles].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const clusters = [];
  for (const art of sorted) {
    const tk = tokens(art.title);
    let best = null;
    let bestSim = 0;
    for (const c of clusters) {
      if (c.country !== art.country) continue;
      for (const m of c.members) {
        const sim = jaccard(tk, m.tokens);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
    }
    const member = { ...art, tokens: tk };
    if (best && bestSim >= minSim) best.members.push(member);
    else clusters.push({ country: art.country, members: [member] });
  }
  return clusters;
}

/**
 * Cobertura: medios distintos. Diversidad: grupos propietarios distintos.
 * Un mismo medio repitiendo la nota no suma; tampoco dos medios del mismo grupo en diversidad.
 */
export function rank(clusters, now, { top = 10 } = {}) {
  const t = Date.parse(now);
  const windowMs = WINDOW_HOURS * 3600e3;
  const recentMs = RECENT_HOURS * 3600e3;

  const rows = [];
  for (const c of clusters) {
    const members = c.members.filter((m) => t - Date.parse(m.publishedAt) <= windowMs && Date.parse(m.publishedAt) <= t);
    if (members.length === 0) continue;
    const outlets = new Set(members.map((m) => m.outlet));
    const owners = new Set(members.map((m) => m.owner ?? m.outlet));
    const recent = members.filter((m) => t - Date.parse(m.publishedAt) <= recentMs).length;
    const coverage = Math.min(outlets.size, COVERAGE_FULL) / COVERAGE_FULL;
    const diversity = Math.min(owners.size, DIVERSITY_FULL) / DIVERSITY_FULL;
    const velocity = recent / members.length;
    const score =
      RANK_WEIGHTS.coverage * coverage + RANK_WEIGHTS.diversity * diversity + RANK_WEIGHTS.velocity * velocity;
    const lead = [...members].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))[0];
    rows.push({
      country: c.country,
      title: lead.title,
      score: Math.round(score * 1000) / 1000,
      outlets: outlets.size,
      owners: owners.size,
      articles: members.length,
      firstSeen: lead.publishedAt,
      members: members.map((m) => m.id)
    });
  }

  const byCountry = {};
  for (const r of rows) (byCountry[r.country] ??= []).push(r);
  for (const k of Object.keys(byCountry)) {
    byCountry[k] = byCountry[k]
      .sort((a, b) => b.score - a.score || Date.parse(a.firstSeen) - Date.parse(b.firstSeen))
      .slice(0, top)
      .map((r, i) => ({ position: i + 1, ...r }));
  }
  return byCountry;
}
