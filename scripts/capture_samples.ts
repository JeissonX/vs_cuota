/**
 * Script para capturar muestras reales de Antigravity IDE (Fase 1 - Hito 3)
 * Sanitiza cualquier dato sensible (email, nombre, tokens) reemplazándolo por "REDACTED".
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { discoverServer } from '../src/discovery';

async function postJson(
  port: number,
  token: string,
  endpoint: string,
  body: object,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Codeium-Csrf-Token': token,
          'Connect-Protocol-Version': '1',
          'Content-Length': Buffer.byteLength(postData),
        },
        rejectUnauthorized: false,
        timeout: 10000,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(raw);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function sanitizeData(obj: any): any {
  if (typeof obj === 'string') {
    // Redactar emails
    let s = obj.replace(/[\w.-]+@[\w.-]+\.\w+/g, 'REDACTED');
    return s;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  }
  if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const lower = k.toLowerCase();
      if (
        lower === 'email' ||
        lower === 'name' ||
        lower === 'username' ||
        lower === 'apikey' ||
        lower === 'token' ||
        lower.includes('csrf') ||
        lower === 'orgname' ||
        lower === 'userid'
      ) {
        res[k] = 'REDACTED';
      } else {
        res[k] = sanitizeData(v);
      }
    }
    return res;
  }
  return obj;
}

async function run() {
  console.log('Descubriendo servidor local...');
  const conn = await discoverServer(true);
  if (!conn) {
    console.error('No se pudo descubrir el language server.');
    process.exit(1);
  }

  console.log(`Conectado al servidor en PID ${conn.pid}, Puerto ${conn.port}`);

  const samplesDir = path.join(__dirname, '..', 'docs', 'samples');
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  // 1. RetrieveUserQuotaSummary
  console.log('Consultando RetrieveUserQuotaSummary...');
  try {
    const rawQuota = await postJson(
      conn.port,
      conn.csrfToken,
      '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      { forceRefresh: true },
    );
    const parsedQuota = JSON.parse(rawQuota);
    const sanitizedQuota = sanitizeData(parsedQuota);
    const quotaPath = path.join(samplesDir, 'RetrieveUserQuotaSummary.json');
    fs.writeFileSync(quotaPath, JSON.stringify(sanitizedQuota, null, 2), 'utf8');
    console.log(`Guardado en: ${quotaPath}`);
  } catch (err: any) {
    console.warn(`Error al consultar RetrieveUserQuotaSummary: ${err.message}`);
  }

  // 2. GetUserStatus
  console.log('Consultando GetUserStatus...');
  try {
    const rawStatus = await postJson(
      conn.port,
      conn.csrfToken,
      '/exa.language_server_pb.LanguageServerService/GetUserStatus',
      {},
    );
    const parsedStatus = JSON.parse(rawStatus);
    const sanitizedStatus = sanitizeData(parsedStatus);
    const statusPath = path.join(samplesDir, 'GetUserStatus.json');
    fs.writeFileSync(statusPath, JSON.stringify(sanitizedStatus, null, 2), 'utf8');
    console.log(`Guardado en: ${statusPath}`);
  } catch (err: any) {
    console.warn(`Error al consultar GetUserStatus: ${err.message}`);
  }

  console.log('Muestras capturadas y sanitizadas con éxito.');
}

run().catch((err) => {
  console.error('Error en captura de muestras:', err);
  process.exit(1);
});
