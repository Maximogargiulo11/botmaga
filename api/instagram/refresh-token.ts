import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getActiveToken, setStoredToken } from '../_lib/token-store.js';

/**
 * Renueva el token de larga duración de Instagram y lo guarda en Upstash.
 *
 * Lo dispara automáticamente el cron de Vercel (ver vercel.json). También se
 * puede llamar a mano: /api/instagram/refresh-token?key=TU_CRON_SECRET
 *
 * El endpoint de Instagram devuelve un token nuevo con 60 días más de validez.
 * Requiere que el token actual sea de larga duración y tenga al menos 24 hs.
 */

const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.instagram.com';
const CRON_SECRET = process.env.CRON_SECRET || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Seguridad: Vercel Cron manda "Authorization: Bearer <CRON_SECRET>".
  // También aceptamos ?key=<CRON_SECRET> para probarlo a mano.
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    const key = req.query['key'];
    const ok = auth === `Bearer ${CRON_SECRET}` || key === CRON_SECRET;
    if (!ok) return res.status(401).send('Unauthorized');
  }

  const current = await getActiveToken();
  if (!current) {
    return res.status(500).json({ ok: false, error: 'No hay token para renovar' });
  }

  try {
    const url =
      `${GRAPH_BASE}/refresh_access_token` +
      `?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`;

    const r = await fetch(url);
    const data = (await r.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: unknown;
    };

    if (!r.ok || !data.access_token) {
      console.error('[refresh] Instagram rechazó la renovación:', data);
      return res
        .status(500)
        .json({ ok: false, step: 'instagram', error: data.error ?? data });
    }

    const days = data.expires_in ? Math.round(data.expires_in / 86400) : '?';

    // Guardar en Upstash por separado para poder reportar si falla el guardado.
    try {
      await setStoredToken(data.access_token);
    } catch (storeErr) {
      console.error('[refresh] token renovado pero falló guardarlo:', storeErr);
      return res.status(500).json({
        ok: false,
        step: 'store',
        error: String(storeErr),
        note: 'El token se renovó en Instagram pero no se pudo guardar en Upstash. Revisá UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.',
      });
    }

    console.log(`[refresh] token renovado OK, vence en ~${days} días`);
    return res.status(200).json({ ok: true, expires_in_days: days });
  } catch (err) {
    console.error('[refresh] error renovando token:', err);
    return res.status(500).json({ ok: false, step: 'unknown', error: String(err) });
  }
}
