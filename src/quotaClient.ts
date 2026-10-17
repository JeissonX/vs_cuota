/**
 * AG Pro Quota — Cliente HTTP para el Language Server local
 *
 * Características:
 * - Conexión exclusiva a 127.0.0.1 con HTTPS (rejectUnauthorized: false).
 * - Timeout configurable por petición.
 * - Reintentos automáticos con backoff exponencial.
 * - Re-descubrimiento e invalidación de caché si la conexión falla o el puerto cambia.
 * - El token CSRF reside únicamente en memoria volátil.
 */

import * as https from 'https';
import type {
  ServerConnection,
  RawQuotaSummaryResponse,
  RawUserStatusResponse,
} from './types';
import { discoverServer, invalidateCache } from './discovery';
import { logger } from './logger';

const ENDPOINTS = {
  QUOTA_SUMMARY: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
  USER_STATUS: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
} as const;

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 400;
const BACKOFF_MAX_MS = 3000;

/** Conexión activa en memoria */
let activeConnection: ServerConnection | null = null;

/**
 * Consulta RetrieveUserQuotaSummary con reintentos, backoff y re-descubrimiento automático.
 */
export async function fetchQuotaSummary(): Promise<{
  data: RawQuotaSummaryResponse | null;
  latencyMs: number;
}> {
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await ensureConnection(attempt > 1);
      if (!conn) {
        return { data: null, latencyMs: Date.now() - startTime };
      }

      const body = JSON.stringify({ forceRefresh: true });
      const raw = await httpsPost<RawQuotaSummaryResponse>(
        conn.port,
        conn.csrfToken,
        ENDPOINTS.QUOTA_SUMMARY,
        body,
      );

      if (raw?.response?.groups) {
        return { data: raw, latencyMs: Date.now() - startTime };
      }

      logger.warn(`Respuesta de RetrieveUserQuotaSummary sin estructura de grupos (intento ${attempt})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`fetchQuotaSummary fallo (intento ${attempt}/${MAX_RETRIES}): ${msg}`);

      // Invalidar conexión para forzar nuevo descubrimiento
      invalidateCache();
      activeConnection = null;

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
        await sleep(delay);
      }
    }
  }

  return { data: null, latencyMs: Date.now() - startTime };
}

/**
 * Consulta GetUserStatus para enriquecer nombres y metadatos de modelos.
 */
export async function fetchUserStatus(): Promise<RawUserStatusResponse | null> {
  try {
    const conn = await ensureConnection(false);
    if (!conn) return null;

    const body = JSON.stringify({});
    const raw = await httpsPost<RawUserStatusResponse>(
      conn.port,
      conn.csrfToken,
      ENDPOINTS.USER_STATUS,
      body,
    );

    return raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug(`fetchUserStatus no critico fallo: ${msg}`);
    return null;
  }
}

/**
 * Asegura una conexión válida, escaneando o re-escaneando si se solicita.
 */
async function ensureConnection(forceRescan: boolean): Promise<ServerConnection | null> {
  if (!forceRescan && activeConnection) {
    return activeConnection;
  }

  const conn = await discoverServer(forceRescan);
  activeConnection = conn;
  return conn;
}

/**
 * Ejecuta una petición HTTPS POST contra 127.0.0.1
 */
function httpsPost<T>(
  port: number,
  csrfToken: string,
  path: string,
  body: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Codeium-Csrf-Token': csrfToken,
          'Connect-Protocol-Version': '1',
          'Content-Length': Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
        timeout: DEFAULT_TIMEOUT_MS,
        agent: false,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 150)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data) as T;
            resolve(parsed);
          } catch {
            reject(new Error(`JSON invalido en ${path}: ${data.substring(0, 150)}`));
          }
        });
      },
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout (${DEFAULT_TIMEOUT_MS}ms) en ${path}`));
    });

    try {
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
