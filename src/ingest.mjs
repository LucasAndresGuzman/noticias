import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseFeed } from './rss.mjs';

export const idFromUrl = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16);

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Si la fuente define `mustMatch` (lista de palabras), solo pasan las notas cuyo título o resumen
 * contiene alguna, sin distinguir mayúsculas ni tildes. Sirve para medios que cubren varios países.
 */
export function matchesSource(source, item) {
  const words = source.mustMatch;
  if (!Array.isArray(words) || words.length === 0) return true;
  const hay = fold(`${item.title} ${item.summary ?? ''}`);
  return words.some((w) => hay.includes(fold(w)));
}

/** Quita el sufijo que algunos agregadores suman al título (p. ej. " - CNN en Español"). Acepta uno o varios. */
export function cleanTitle(source, title) {
  const list = [].concat(source.stripTitleSuffix ?? []);
  for (const suf of list) {
    if (suf && title.endsWith(suf) && title.length > suf.length) return title.slice(0, -suf.length).trim();
  }
  return title;
}

/** Lee config/sources.json y deja solo las fuentes con URL de feed cargada. */
export function loadSources(path = new URL('../config/sources.json', import.meta.url)) {
  const all = JSON.parse(readFileSync(path, 'utf8'));
  return all.filter((s) => typeof s.feedUrl === 'string' && /^https?:\/\//.test(s.feedUrl));
}

/**
 * Descarga cada feed, lo interpreta y guarda las notas nuevas.
 * Un feed que falla no frena a los demás: el error queda en el resultado.
 */
export async function ingestSources({ sources, fetchFn = fetch, repo, now = new Date(), timeoutMs = 10000 }) {
  const errors = [];
  let seen = 0;
  let fresh = 0;
  for (const s of sources) {
    try {
      const res = await fetchFn(s.feedUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'verificador-noticias/0.1 (prueba privada)' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(await res.text()).filter(
        (i) => Date.parse(i.published) <= now.getTime() + 10 * 60e3 && matchesSource(s, i) // descarta fechas futuras y notas ajenas al país
      );
      const arts = items.map((i) => ({
        id: idFromUrl(i.link),
        outlet: s.outlet,
        owner: s.owner,
        title: cleanTitle(s, i.title),
        publishedAt: i.published,
        country: s.country,
        url: i.link
      }));
      seen += arts.length;
      fresh += await repo.upsertArticles(arts);
    } catch (e) {
      errors.push({ outlet: s.outlet, error: String(e?.message ?? e) });
    }
  }
  return { sources: sources.length, seen, fresh, errors };
}
