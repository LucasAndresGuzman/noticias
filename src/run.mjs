import { buildTop } from './engine/pipeline.mjs';
import { ingestSources } from './ingest.mjs';

export const WINDOW_MS = 24 * 3600e3;
export const PREVIOUS_MS = 3 * 3600e3;
export const KEEP_MS = 7 * 24 * 3600e3;

/** Una corrida completa: ingesta, cálculo, historial y foto del resultado. */
export async function runOnce({ repo, sources, fetchFn = fetch, now = new Date() }) {
  const nowIso = now.toISOString();
  const ingest = await ingestSources({ sources, fetchFn, repo, now });

  const articles = await repo.listArticlesSince(new Date(now - WINDOW_MS).toISOString());
  const facts = await repo.listFacts();
  const previous = await repo.levelsAt(new Date(now - PREVIOUS_MS).toISOString());

  const { top, pendingReview, noEvidence } = buildTop(articles, facts, previous, nowIso);

  const levels = Object.values(top).flat().map((r) => ({ factId: r.factId, at: nowIso, level: r.level }));
  await repo.recordLevels(levels);
  await repo.saveSnapshot({
    generatedAt: nowIso,
    payload: { generatedAt: nowIso, top, pendingReview, noEvidence, ingest }
  });
  await repo.prune(new Date(now - KEEP_MS).toISOString());

  return {
    generatedAt: nowIso,
    articles: articles.length,
    published: levels.length,
    pendingReview: pendingReview.length,
    noEvidence: noEvidence.length,
    ingest
  };
}
