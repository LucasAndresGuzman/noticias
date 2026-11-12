// Repositorio en memoria: sirve para pruebas y para ejecutar el flujo sin base de datos.
// Misma interfaz que repo-pg.mjs.
const iso = (d) => new Date(d).toISOString();

export function createMemoryRepo() {
  const articles = new Map();
  const facts = new Map();
  const history = []; // { factId, at, level }
  const snapshots = []; // { generatedAt, payload }

  return {
    async upsertArticles(list) {
      let added = 0;
      for (const a of list) {
        if (!articles.has(a.id)) {
          articles.set(a.id, { ...a, publishedAt: iso(a.publishedAt) });
          added++;
        } else if (articles.get(a.id).title !== a.title) {
          articles.get(a.id).title = a.title; // título corregido: se actualiza, no cuenta como nota nueva
        }
      }
      return added;
    },
    async listArticlesSince(sinceIso) {
      return [...articles.values()]
        .filter((a) => Date.parse(a.publishedAt) >= Date.parse(sinceIso))
        .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    },
    async upsertFact(f) {
      facts.set(f.id, {
        articleIds: [], category: '', evidence: [], contradictions: [], flags: {}, alerts: [], note: '',
        ...f
      });
    },
    async listFacts() {
      return [...facts.values()];
    },
    // Último nivel de cada hecho registrado en o antes de cutoffIso.
    async levelsAt(cutoffIso) {
      const out = {};
      const best = {};
      for (const h of history) {
        const t = Date.parse(h.at);
        if (t <= Date.parse(cutoffIso) && (best[h.factId] === undefined || t > best[h.factId])) {
          best[h.factId] = t;
          out[h.factId] = h.level;
        }
      }
      return out;
    },
    async recordLevels(rows) {
      for (const r of rows) {
        if (!history.some((h) => h.factId === r.factId && h.at === iso(r.at))) {
          history.push({ factId: r.factId, at: iso(r.at), level: r.level });
        }
      }
    },
    async saveSnapshot(s) {
      snapshots.push({ generatedAt: iso(s.generatedAt), payload: s.payload });
    },
    async latestSnapshot() {
      return snapshots.length ? snapshots[snapshots.length - 1] : null;
    },
    async prune(beforeIso) {
      const t = Date.parse(beforeIso);
      for (const [id, a] of articles) if (Date.parse(a.publishedAt) < t) articles.delete(id);
    },
    async close() {}
  };
}
