// Flujo completo: notas -> grupos por hecho -> ranking -> nivel de respaldo -> Top 10 con etiqueta.
import { cluster, rank } from './ranking.mjs';
import { score } from './scoring.mjs';

const OFFICIAL_TYPES = new Set(['official_statement', 'judicial_resolution']);
const INDEPENDENT_TYPES = new Set(['independent_outlets', 'verified_video', 'judicial_resolution']);

/**
 * articles: notas ingeridas.
 * facts: registros de evidencia por hecho:
 *   { id, articleIds, category, evidence: [...], contradictions: [...], flags: {...}, alerts: [...], note }
 * previous: { [factId]: nivel de hace 3 horas } para calcular el cambio.
 * now: ISO. Devuelve { top: { [país]: [...] }, pendingReview: [...], noEvidence: [...] }
 */
export function buildTop(articles, facts, previous, now) {
  const clusters = cluster(articles);
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
        breakdown: result.lines
      });
    }
    top[country] = out.slice(0, 10).map((r, i) => ({ position: i + 1, ...r }));
  }
  return { top, pendingReview, noEvidence };
}
