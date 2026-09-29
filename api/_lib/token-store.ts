/**
 * Almacén del token de Instagram.
 *
 * El token se renueva solo cada tanto (ver api/instagram/refresh-token.ts) y hay
 * que guardarlo en algún lado que persista entre invocaciones (serverless no
 * guarda estado). Usamos Upstash Redis vía su API REST (plan gratis alcanza).
 *
 * Variables de entorno necesarias (se configuran en Vercel):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Si Upstash no está configurado, se usa IG_ACCESS_TOKEN de las env vars como
 * respaldo (el bot igual funciona, pero sin auto-renovación).
 */

const KV_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KEY = 'ig_access_token';

/** Lee el token guardado en Upstash. Devuelve null si no hay o no está configurado. */
export async function getStoredToken(): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown };
    return typeof data.result === 'string' && data.result ? data.result : null;
  } catch (err) {
    console.error('[token-store] error leyendo token:', err);
    return null;
  }
}

/** Guarda el token nuevo en Upstash. */
export async function setStoredToken(token: string): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: token,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`No se pudo guardar el token (${res.status}): ${body}`);
  }
}

/**
 * El token que el bot debe usar ahora: primero el guardado (renovado), y si no
 * hay, el semilla de las env vars (IG_ACCESS_TOKEN).
 */
export async function getActiveToken(): Promise<string> {
  const stored = await getStoredToken();
  return stored || process.env.IG_ACCESS_TOKEN || '';
}
