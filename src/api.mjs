// Lógica de la API, independiente del servidor (sirve en Render o como función en Vercel).
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha = (s) => createHash('sha256').update(s).digest();

/** Acceso con usuario y contraseña. Si no están configurados, se rechaza todo (falla cerrado). */
export function checkAuth(authorization, env) {
  const user = env.BASIC_AUTH_USER;
  const pass = env.BASIC_AUTH_PASS;
  if (!user || !pass) return { ok: false, status: 503, error: 'Acceso no configurado' };
  const m = /^Basic\s+(.+)$/i.exec(authorization ?? '');
  if (!m) return { ok: false, status: 401, error: 'Se requiere autenticación' };
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return { ok: false, status: 401, error: 'Credenciales inválidas' };
  const okUser = timingSafeEqual(sha(decoded.slice(0, i)), sha(user));
  const okPass = timingSafeEqual(sha(decoded.slice(i + 1)), sha(pass));
  return okUser && okPass ? { ok: true } : { ok: false, status: 401, error: 'Credenciales inválidas' };
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow'
};
const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

/** Medios y cómo se leen, para mostrar en pantalla. No expone las direcciones de los feeds. */
export function describeSources(path = new URL('../config/sources.json', import.meta.url)) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).map((s) => ({
      outlet: s.outlet,
      owner: s.owner,
      country: s.country,
      method: !s.feedUrl ? 'none' : /news\.google\.com/.test(s.feedUrl) ? 'google-news' : 'rss',
      note: s.notaPublica ?? ''
    }));
  } catch {
    return [];
  }
}

const readPage = () => readFileSync(new URL('./web/index.html', import.meta.url), 'utf8');
const json = (status, body, extra = {}) => ({ status, headers: { ...HEADERS, ...extra }, body: JSON.stringify(body) });

/** req: { method, url, headers }. Devuelve { status, headers, body }. */
export async function handleRequest(req, { repo, env = process.env }) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health') return json(200, { ok: true });
  if (req.method !== 'GET') return json(405, { error: 'Método no permitido' }, { allow: 'GET' });

  const auth = checkAuth(req.headers?.authorization, env);
  if (!auth.ok) {
    return json(auth.status, { error: auth.error }, auth.status === 401 ? { 'www-authenticate': 'Basic realm="Privado"' } : {});
  }

  if (path === '/' || path === '/index.html') return { status: 200, headers: HTML_HEADERS, body: readPage() };

  const snap = await repo.latestSnapshot();

  if (path === '/api/top') {
    const country = (url.searchParams.get('country') ?? 'AR').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return json(400, { error: 'country debe tener 2 letras' });
    return json(200, {
      country,
      generatedAt: snap?.generatedAt ?? null,
      items: snap?.payload.top?.[country] ?? [],
      withoutEvidence: (snap?.payload.noEvidence ?? []).filter((x) => x.country === country).length
    });
  }

  if (path === '/api/sources') return json(200, { sources: describeSources() });

  if (path === '/api/pending') {
    return json(200, {
      generatedAt: snap?.generatedAt ?? null,
      pendingReview: snap?.payload.pendingReview ?? [],
      noEvidence: snap?.payload.noEvidence ?? [],
      ingest: snap?.payload.ingest ?? null
    });
  }

  return json(404, { error: 'No encontrado' });
}
