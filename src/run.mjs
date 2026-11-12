import { buildTop } from './engine/pipeline.mjs';
import { cleanTitle, ingestSources, isHeadline } from './ingest.mjs';

export const WINDOW_MS = 24 * 3600e3;
export const PREVIOUS_MS = 3 * 3600e3;
export const KEEP_MS = 7 * 24 * 3600e3;
export const SNAPSHOT_KEEP_MS = 24 * 3600e3; // cada foto incluye notas y enlaces: se guardan solo las de un día

/** Una corrida completa: ingesta, cálculo, historial y foto del resultado. */
export async function runOnce({ repo, sources, fetchFn = fetch, now = new Date() }) {
  const nowIso = now.toISOString();
  const ingest = await ingestSources({ sources, fetchFn, repo, now });

  // Se limpian los títulos también al leerlos: las notas viejas guardadas con sufijo no se corrigen solas.
  const byOutlet = Object.fromEntries(sources.map((s) => [s.outlet, s]));
  const articles = (await repo.listArticlesSince(new Date(now - WINDOW_MS).toISOString()))
    .map((a) => ({ ...a, title: cleanTitle(byOutlet[a.outlet] ?? {}, a.title) }))
    .filter((a) => isHeadline(a.title));
  const facts = await repo.listFacts();
  const previous = await repo.levelsAt(new Date(now - PREVIOUS_MS).toISOString());

  const { top, pendingReview, noEvidence } = buildTop(articles, facts, previous, nowIso);

  const levels = Object.values(top).flat().map((r) => ({ factId: r.factId, at: nowIso, level: r.level }));
  await repo.recordLevels(levels);
  await repo.saveSnapshot({
    generatedAt: nowIso,
    payload: { generatedAt: nowIso, top, pendingReview, noEvidence, ingest }
  });
  await repo.prune(new Date(now - KEEP_MS).toISOString(), new Date(now - SNAPSHOT_KEEP_MS).toISOString());

  return {
    generatedAt: nowIso,
    articles: articles.length,
    published: levels.length,
    pendingReview: pendingReview.length,
    noEvidence: noEvidence.length,
    ingest
  };
}
