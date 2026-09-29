import crypto from 'node:crypto';
import { getActiveToken } from './token-store.js';

/**
 * Utilidades para hablar con la API de Instagram/Meta:
 * verificar la firma del webhook y enviar mensajes directos.
 */

// Base de la Graph API. Por defecto usa "Instagram API con Instagram Login".
// Si conectaste la cuenta vía una Página de Facebook, cambialo a
// https://graph.facebook.com
const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.instagram.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

const APP_SECRET = process.env.META_APP_SECRET || '';

/**
 * Verifica la firma X-Hub-Signature-256 que manda Meta contra el cuerpo crudo
 * del request. Si no configuraste META_APP_SECRET, devuelve true (no recomendado
 * en producción).
 */
export function verifySignature(rawBody: string, signatureHeader?: string): boolean {
  if (!APP_SECRET) return true; // sin secreto configurado: no verificamos
  if (!signatureHeader) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex');

  const a = new Uint8Array(Buffer.from(signatureHeader));
  const b = new Uint8Array(Buffer.from(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Envía un mensaje de texto por DM al usuario `recipientId`.
 * Usa el endpoint /me/messages con el access token de la cuenta.
 */
export async function sendTextMessage(recipientId: string, text: string): Promise<void> {
  const accessToken = await getActiveToken();
  if (!accessToken) {
    throw new Error('No hay token de Instagram disponible (IG_ACCESS_TOKEN / Upstash)');
  }

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/me/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Error enviando DM (${res.status}): ${body}`);
  }
}
