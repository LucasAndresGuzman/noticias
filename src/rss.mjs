// Lector mínimo de RSS 2.0 y Atom, sin dependencias.
// Limitación: usa expresiones regulares, no un analizador XML completo. Suficiente para los feeds
// habituales; ante un feed raro, ignora las entradas que no puede leer en lugar de inventar datos.

const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function text(raw) {
  if (raw == null) return '';
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? text(m[1]) : '';
}

function link(block) {
  const rss = tag(block, 'link');
  if (rss) return rss;
  for (const m of block.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const rel = attrs.match(/\brel="([^"]*)"/i)?.[1];
    const href = attrs.match(/\bhref="([^"]*)"/i)?.[1];
    if (href && (!rel || rel === 'alternate')) return text(href);
  }
  return '';
}

/** Devuelve [{ title, link, published (ISO) }]. Omite entradas sin título, enlace o fecha válida. */
export function parseFeed(xml) {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)
  ].map((m) => m[0]);

  const out = [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    const url = link(b);
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = Date.parse(date);
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(t)) continue;
    out.push({ title, link: url, published: new Date(t).toISOString() });
  }
  return out;
}
