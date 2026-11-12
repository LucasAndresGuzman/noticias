// Videos que cada medio publica en su canal de YouTube (por el feed público del canal, sin clave).
// Un video se asocia a un hecho por similitud de titular: es una asociación automática y se muestra como tal.
// No se verifica la fecha, el lugar ni el origen del video.
import { parseFeed } from './rss.mjs';
import { SIMILARITY_MIN, jaccard, tokens } from './engine/ranking.mjs';

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
export const MIN_SHARED_WORDS = 3; // palabras en común mínimas entre el titular del video y el de la nota
export const VIDEOS_PER_OUTLET = 2;

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export function videoIdFromUrl(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('v');
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const channelCache = new Map();

/**
 * `ref` puede ser el ID del canal (UC...) o su @usuario. Con @usuario se lee la página del canal y se toma su ID.
 * Devuelve { id, title }. `title` es el nombre del canal, para poder comprobar que es el medio correcto.
 */
export async function resolveChannel(ref, { fetchFn = fetch, timeoutMs = 10000 } = {}) {
  if (CHANNEL_ID.test(ref)) return { id: ref, title: '' };
  if (!/^@[A-Za-z0-9._-]{3,60}$/.test(ref)) throw new Error(`Referencia de canal inválida: ${ref}`);
  if (channelCache.has(ref)) return channelCache.get(ref);
  const res = await fetchFn(`https://www.youtube.com/${ref}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; verificador-noticias/0.1)', cookie: 'CONSENT=YES+1; SOCS=CAI', 'accept-language': 'es' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer el canal ${ref}`);
  const html = await res.text();
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1];
  if (!id) throw new Error(`No se pudo obtener el ID del canal ${ref}`);
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
  const out = { id, title };
  channelCache.set(ref, out);
  return out;
}

/** Lee el feed de cada canal configurado (`youtube` en config/sources.json) y guarda los videos nuevos. */
export async function ingestVideos({ sources, fetchFn = fetch, repo, now = new Date(), timeoutMs = 10000 }) {
  const out = { channels: 0, seen: 0, fresh: 0, errors: [], resolved: [] };
  for (const s of sources) {
    if (!s.youtube) continue;
    out.channels++;
    try {
      const ch = await resolveChannel(s.youtube, { fetchFn, timeoutMs });
      out.resolved.push({ outlet: s.outlet, channel: ch.title || ch.id });
      const res = await fetchFn(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'verificador-noticias/0.1 (prueba privada)' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} al leer el feed del canal`);
      const videos = parseFeed(await res.text())
        .filter((i) => Date.parse(i.published) <= now.getTime() + 10 * 60e3)
        .map((i) => ({ id: videoIdFromUrl(i.link), outlet: s.outlet, title: i.title, publishedAt: i.published }))
        .filter((v) => v.id)
        .map((v) => ({ ...v, url: watchUrl(v.id) }));
      out.seen += videos.length;
      out.fresh += await repo.upsertVideos(videos);
    } catch (e) {
      out.errors.push({ outlet: s.outlet, error: String(e?.message ?? e) });
    }
  }
  return out;
}

/**
 * Agrega a cada hecho del Top los videos de los medios cuyo titular se parece al del hecho o al de sus notas.
 * item.videos = [{ outlet, title, url, videoId, publishedAt }], hasta VIDEOS_PER_OUTLET por medio.
 */
export function attachVideos(top, videos, { minSim = SIMILARITY_MIN } = {}) {
  const prepared = videos.map((v) => ({ v, tk: tokens(v.title) }));
  for (const item of Object.values(top).flat()) {
    const refs = [item.title, ...(item.articles ?? []).map((a) => a.title)].map(tokens);
    const scored = [];
    for (const { v, tk } of prepared) {
      let best = 0;
      for (const r of refs) {
        let shared = 0;
        for (const t of tk) if (r.has(t)) shared++;
        if (shared >= MIN_SHARED_WORDS) best = Math.max(best, jaccard(tk, r));
      }
      if (best >= minSim) scored.push({ v, best });
    }
    scored.sort((a, b) => b.best - a.best || Date.parse(b.v.publishedAt) - Date.parse(a.v.publishedAt));
    const perOutlet = {};
    item.videos = scored
      .filter(({ v }) => (perOutlet[v.outlet] = (perOutlet[v.outlet] ?? 0) + 1) <= VIDEOS_PER_OUTLET)
      .map(({ v }) => ({ outlet: v.outlet, title: v.title, url: v.url, videoId: v.id, publishedAt: v.publishedAt }));
  }
  return top;
}
