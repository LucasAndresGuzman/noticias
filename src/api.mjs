// Lógica de la API, independiente del servidor (sirve en Render o como función en Vercel).
import { createHash, timingSafeEqual } from 'node:crypto';

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

  const snap = await repo.latestSnapshot();

  if (path === '/api/top') {
    const country = (url.searchParams.get('country') ?? 'AR').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return json(400, { error: 'country debe tener 2 letras' });
    return json(200, {
      country,
      generatedAt: snap?.generatedAt ?? null,
      items: snap?.payload.top?.[country] ?? []
    });
  }

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
