// Flujo completo: notas -> grupos por hecho -> ranking -> nivel de respaldo -> Top 10 con etiqueta.
import { cluster, rank } from './ranking.mjs';
import { score } from './scoring.mjs';

const OFFICIAL_TYPES = new Set(['official_statement', 'judicial_resolution']);
const INDEPENDENT_TYPES = new Set(['independent_outlets', 'verified_video', 'judicial_resolution']);

/**
 * Si las notas de un mismo hecho quedaron en grupos distintos (titulares con palabras muy diferentes),
 * se unen en uno solo por país: un hecho, una fila. Así la cobertura suma todos sus medios.
 */
export function mergeByFact(clusters, facts) {
  let out = clusters;
  for (const f of facts) {
    const ids = new Set(f.articleIds);
    const hit = out.filter((c) => c.members.some((m) => ids.has(m.id)));
    for (const country of new Set(hit.map((c) => c.country))) {
      const same = hit.filter((c) => c.country === country);
      if (same.length < 2) continue;
      const merged = { country, members: same.flatMap((c) => c.members) };
      out = [...out.filter((c) => !same.includes(c)), merged];
    }
  }
  return out;
}

/**
 * articles: notas ingeridas.
 * facts: registros de evidencia por hecho:
 *   { id, articleIds, category, evidence: [...], contradictions: [...], flags: {...}, alerts: [...], note }
 * previous: { [factId]: nivel de hace 3 horas } para calcular el cambio.
 * now: ISO. Devuelve { top: { [país]: [...] }, pendingReview: [...], noEvidence: [...] }
 */
export function buildTop(articles, facts, previous, now) {
  const clusters = mergeByFact(cluster(articles), facts);
  const ranked = rank(clusters, now, { top: 1000 }); // se recorta después de filtrar
  const t = Date.parse(now);

  const top = {};
  const pendingReview = [];
  const noEvidence = [];

  for (const [country, rows] of Object.entries(ranked)) {
    const out = [];
    for (const row of rows) {
      const fact = facts.find((f) => f.articleIds.some((id) => row.members.includes(id)));
      if (!fact) {
        // Hay cobertura pero nadie cargó evidencia: no se publica un nivel inventado.
        noEvidence.push({ country, title: row.title, outlets: row.outlets });
        continue;
      }

      const items = fact.evidence;
      const flags = {
        ...fact.flags,
        primaryOrJudicial: items.some((e) => OFFICIAL_TYPES.has(e.type) && !e.coordinated),
        independentEvidence: items.some((e) => INDEPENDENT_TYPES.has(e.type) && !e.reusedVideo && !e.coordinated)
      };
      const result = score(items, fact.contradictions ?? [], flags);

      if (!result.publishable) {
        pendingReview.push({ factId: fact.id, title: row.title, level: result.level, label: result.label });
        continue;
      }

      const reused = items.find((e) => e.reusedVideo);
      const alerts = [...(fact.alerts ?? [])];
      if (reused) alerts.unshift(reused.alertText ?? 'video reutilizado');

      const prev = previous?.[fact.id];
      const newestMin = Math.max(
        0,
        Math.round(
          Math.min(...row.members.map((id) => t - Date.parse(articles.find((a) => a.id === id).publishedAt))) / 60000
        )
      );

      const byId = new Map(articles.map((a) => [a.id, a]));
      const perOutlet = {};
      const shown = row.members
        .map((id) => byId.get(id))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .filter((a) => (perOutlet[a.outlet] = (perOutlet[a.outlet] ?? 0) + 1) <= 4) // hasta 4 notas por medio
        .map((a) => ({ outlet: a.outlet, title: a.title, url: a.url, publishedAt: a.publishedAt }));
      const counted = new Set(result.lines.filter((l) => l.id && l.value > 0).map((l) => l.id));

      out.push({
        factId: fact.id,
        title: row.title,
        category: fact.category,
        relevance: row.score,
        level: result.level,
        label: result.label,
        delta: prev === undefined ? null : result.level - prev,
        outlets: row.outlets,
        owners: row.owners,
        officialSources: items.filter((e) => OFFICIAL_TYPES.has(e.type)).length,
        minutesSinceLast: newestMin,
        videoAlert: alerts.length > 0,
        alertText: alerts[0] ?? '',
        note: fact.note ?? '',
        breakdown: result.lines,
        evidence: items.map((e) => ({
          id: e.id, type: e.type, origin: e.origin ?? null, label: e.label ?? '', url: e.url ?? '', counted: counted.has(e.id)
        })),
        articles: shown
      });
    }
    top[country] = out.slice(0, 10).map((r, i) => ({ position: i + 1, ...r }));
  }
  return { top, pendingReview, noEvidence };
}
