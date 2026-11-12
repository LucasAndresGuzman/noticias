// Repositorio sobre PostgreSQL. Misma interfaz que repo-memory.mjs.
// IMPORTANTE: este archivo NO se pudo probar en el entorno de desarrollo (sin acceso a npm ni a una base).
// Antes de confiar en él, ejecutar `npm run smoke-db` contra la base real.
import { readFileSync } from 'node:fs';

const iso = (d) => new Date(d).toISOString();

export function createPgRepo(pool) {
  return {
    async upsertArticles(list) {
      let added = 0;
      for (const a of list) {
        // Nota nueva: se inserta. Nota ya guardada con otro título (p. ej. corregido): se actualiza el título.
        const r = await pool.query(
          `insert into articles (id, outlet, owner, title, published_at, country, url)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update set title = excluded.title
             where articles.title is distinct from excluded.title
           returning (xmax = 0) as inserted`,
          [a.id, a.outlet, a.owner, a.title, iso(a.publishedAt), a.country, a.url]
        );
        if (r.rows[0]?.inserted) added++;
      }
      return added;
    },

    async listArticlesSince(sinceIso) {
      const { rows } = await pool.query(
        `select id, outlet, owner, title, published_at, country, url
         from articles where published_at >= $1 order by published_at asc`,
        [sinceIso]
      );
      return rows.map((r) => ({
        id: r.id, outlet: r.outlet, owner: r.owner, title: r.title,
        publishedAt: iso(r.published_at), country: r.country, url: r.url
      }));
    },

    async upsertVideos(list) {
      let added = 0;
      for (const v of list) {
        const r = await pool.query(
          `insert into videos (id, outlet, title, published_at, url) values ($1, $2, $3, $4, $5)
           on conflict (id) do update set title = excluded.title
             where videos.title is distinct from excluded.title
           returning (xmax = 0) as inserted`,
          [v.id, v.outlet, v.title, iso(v.publishedAt), v.url]
        );
        if (r.rows[0]?.inserted) added++;
      }
      return added;
    },

    async listVideosSince(sinceIso) {
      const { rows } = await pool.query(
        `select id, outlet, title, published_at, url from videos where published_at >= $1 order by published_at desc`,
        [sinceIso]
      );
      return rows.map((r) => ({ id: r.id, outlet: r.outlet, title: r.title, publishedAt: iso(r.published_at), url: r.url }));
    },

    async upsertFact(f) {
      await pool.query(
        `insert into facts (id, article_ids, category, evidence, contradictions, flags, alerts, note, updated_at)
         values ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, now())
         on conflict (id) do update set
           article_ids = excluded.article_ids, category = excluded.category, evidence = excluded.evidence,
           contradictions = excluded.contradictions, flags = excluded.flags, alerts = excluded.alerts,
           note = excluded.note, updated_at = now()`,
        [
          f.id, JSON.stringify(f.articleIds ?? []), f.category ?? '', JSON.stringify(f.evidence ?? []),
          JSON.stringify(f.contradictions ?? []), JSON.stringify(f.flags ?? {}), JSON.stringify(f.alerts ?? []),
          f.note ?? ''
        ]
      );
    },

    async listFacts() {
      const { rows } = await pool.query(
        `select id, article_ids, category, evidence, contradictions, flags, alerts, note from facts`
      );
      return rows.map((r) => ({
        id: r.id, articleIds: r.article_ids, category: r.category, evidence: r.evidence,
        contradictions: r.contradictions, flags: r.flags, alerts: r.alerts, note: r.note
      }));
    },

    async levelsAt(cutoffIso) {
      const { rows } = await pool.query(
        `select distinct on (fact_id) fact_id, level
         from level_history where at <= $1
         order by fact_id, at desc`,
        [cutoffIso]
      );
      return Object.fromEntries(rows.map((r) => [r.fact_id, r.level]));
    },

    // Evolución del nivel de un hecho desde sinceIso, de más viejo a más nuevo.
    async levelHistory(factId, sinceIso) {
      const { rows } = await pool.query(
        `select at, level from level_history where fact_id = $1 and at >= $2 order by at asc limit 600`,
        [factId, sinceIso]
      );
      return rows.map((r) => ({ at: iso(r.at), level: r.level }));
    },

    async recordLevels(list) {
      for (const r of list) {
        await pool.query(
          `insert into level_history (fact_id, at, level) values ($1, $2, $3) on conflict do nothing`,
          [r.factId, iso(r.at), r.level]
        );
      }
    },

    async saveSnapshot(s) {
      await pool.query(`insert into snapshots (generated_at, payload) values ($1, $2::jsonb)`, [
        iso(s.generatedAt), JSON.stringify(s.payload)
      ]);
    },

    async latestSnapshot() {
      const { rows } = await pool.query(
        `select generated_at, payload from snapshots order by generated_at desc limit 1`
      );
      return rows.length ? { generatedAt: iso(rows[0].generated_at), payload: rows[0].payload } : null;
    },

    // Limpia lo viejo para no llenar el plan gratuito de la base.
    async prune(beforeIso, snapshotsBeforeIso = beforeIso) {
      await pool.query(`delete from snapshots where generated_at < $1`, [snapshotsBeforeIso]);
      await pool.query(`delete from level_history where at < $1`, [beforeIso]);
      await pool.query(`delete from articles where published_at < $1`, [beforeIso]);
      await pool.query(`delete from videos where published_at < $1`, [beforeIso]);
    },

    async close() {
      await pool.end();
    }
  };
}

// Crea las tablas si faltan. Un candado de la base evita que la API y el worker lo hagan a la vez.
// Sin probar contra una base real en el entorno de desarrollo.
export async function ensureSchema(pool) {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(727274)');
    await client.query(sql);
  } finally {
    try {
      await client.query('select pg_advisory_unlock(727274)');
    } finally {
      client.release();
    }
  }
}

// Crea el pool a partir de DATABASE_URL. `pg` se importa acá para no exigirlo en las pruebas.
export async function createPoolFromEnv(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL');
  const { default: pg } = await import('pg');
  return new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });
}
