/**
 * AG Pro Quota — Descubrimiento del Language Server de Antigravity (Windows)
 *
 * Utiliza Get-CimInstance Win32_Process + Get-NetTCPConnection
 * con triple filtro para aislar el proceso legítimo de Antigravity IDE.
 *
 * REGLAS DE SEGURIDAD:
 * - El token CSRF reside ÚNICAMENTE en memoria.
 * - Conexiones exclusivamente a 127.0.0.1.
 * - Nunca se registra el token en logs ni se guarda en disco.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import type { ServerConnection } from './types';
import { logger } from './logger';

const execFileAsync = promisify(execFile);

/** Timeout generoso para cold start de PowerShell en Windows */
const PS_TIMEOUT_MS = 15000;

/** Caché en memoria del último descubrimiento exitoso */
let cachedConnection: ServerConnection | null = null;

export interface ProcessCandidate {
  pid: number;
  csrfToken: string;
  extensionPort: number;
}


/**
 * Encuentra el servidor local de Antigravity.
 * Retorna la conexión activa (puerto validado, token y PID).
 */
export async function discoverServer(
  forceRescan: boolean = false,
): Promise<ServerConnection | null> {
  if (!forceRescan && cachedConnection) {
    logger.debug(`Usando conexión en caché (puerto ${cachedConnection.port}, PID ${cachedConnection.pid})`);
    return cachedConnection;
  }

  logger.info('Iniciando descubrimiento del language server de Antigravity...');

  if (process.platform !== 'win32') {
    logger.warn('Plataforma no soportada en esta fase (solo Windows 11).');
    return null;
  }

  // 1. Búsqueda principal por nombre y triple filtro
  try {
    const conn = await probeProcessByName();
    if (conn) {
      cachedConnection = conn;
      logger.info(`✅ Servidor descubierto: PID ${conn.pid}, Puerto ${conn.port}`);
      return conn;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error en búsqueda por nombre: ${msg}`);
  }

  // 2. Fallback: búsqueda por keyword csrf_token + antigravity
  try {
    logger.info('Intentando fallback por keyword csrf_token...');
    const conn = await probeProcessByKeyword();
    if (conn) {
      cachedConnection = conn;
      logger.info(`✅ Servidor descubierto vía fallback: PID ${conn.pid}, Puerto ${conn.port}`);
      return conn;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Error en fallback de descubrimiento: ${msg}`);
  }

  logger.warn('❌ No se encontró el proceso activo del language server de Antigravity.');
  return null;
}

/**
 * Invalida el caché de conexión forzando un nuevo escaneo en la siguiente petición.
 */
export function invalidateCache(): void {
  cachedConnection = null;
  logger.debug('Caché de conexión invalidado.');
}

/**
 * Busca el proceso language_server_windows_x64.exe aplicando el triple filtro:
 * 1) Nombre del binario
 * 2) Argumento --csrf_token
 * 3) Argumentos --extension_server_port y/o --app_data_dir conteniendo antigravity
 */
async function probeProcessByName(): Promise<ServerConnection | null> {
  const processName = 'language_server_windows_x64.exe';
  const utf8Hdr = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
  const psCmd = `${utf8Hdr}Get-CimInstance Win32_Process -Filter "name='${processName}'" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;

  logger.debug(`Ejecutando Get-CimInstance para ${processName}...`);

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psCmd],
    { timeout: PS_TIMEOUT_MS },
  );

  if (!stdout || !stdout.trim()) {
    return null;
  }

  const candidates = parseProcessCandidates(stdout);
  return findWorkingPortForCandidates(candidates);
}

/**
 * Fallback: busca cualquier proceso cuyo CommandLine contenga csrf_token
 */
async function probeProcessByKeyword(): Promise<ServerConnection | null> {
  const utf8Hdr = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
  const psCmd = `${utf8Hdr}Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*csrf_token*" -and $_.CommandLine -like "*antigravity*" } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psCmd],
    { timeout: PS_TIMEOUT_MS },
  );

  if (!stdout || !stdout.trim()) {
    return null;
  }

  const candidates = parseProcessCandidates(stdout);
  return findWorkingPortForCandidates(candidates);
}

/**
 * Parsea el JSON retornado por PowerShell y aplica el triple filtro.
 */
function parseProcessCandidates(stdout: string): ProcessCandidate[] {
  const candidates: ProcessCandidate[] = [];

  try {
    const jsonStart = stdout.indexOf('[');
    const jsonObjStart = stdout.indexOf('{');
    let clean = stdout;
    if (jsonStart >= 0 || jsonObjStart >= 0) {
      const start =
        jsonStart >= 0 && jsonObjStart >= 0
          ? Math.min(jsonStart, jsonObjStart)
          : Math.max(jsonStart, jsonObjStart);
      clean = stdout.substring(start);
    }

    let data: Array<{ ProcessId?: number; CommandLine?: string }> = JSON.parse(clean.trim());
    if (!Array.isArray(data)) {
      data = [data];
    }

    for (const item of data) {
      const cmd = item.CommandLine || '';
      if (!cmd) continue;

      // Triple filtro de seguridad
      const hasCsrf = cmd.includes('--csrf_token');
      const hasPort = cmd.includes('--extension_server_port');
      const hasAppData = cmd.toLowerCase().includes('antigravity');

      if (!hasCsrf) continue;
      if (!hasPort && !hasAppData) continue;

      const tokenMatch = cmd.match(/--csrf_token[\s=]+([a-zA-Z0-9-]+)/);
      if (!tokenMatch?.[1]) continue;

      const portMatch = cmd.match(/--extension_server_port[\s=]+(\d+)/);
      const extensionPort = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0;

      candidates.push({
        pid: item.ProcessId || 0,
        csrfToken: tokenMatch[1],
        extensionPort,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error parseando candidatos de proceso: ${msg}`);
  }

  logger.debug(`Candidatos detectados tras triple filtro: ${candidates.length}`);
  return candidates;
}

/**
 * Obtiene los puertos TCP en LISTEN para un PID dado usando Get-NetTCPConnection
 */
export async function getListeningPorts(pid: number): Promise<number[]> {
  if (pid <= 0) return [];

  try {
    const utf8Hdr = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
    const psCmd = `${utf8Hdr}Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique`;

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 5000 },
    );

    const ports: number[] = [];
    const matches = stdout.match(/\b\d{1,5}\b/g) || [];
    for (const val of matches) {
      const p = parseInt(val, 10);
      if (p > 0 && p <= 65535 && !ports.includes(p)) {
        ports.push(p);
      }
    }

    logger.debug(`PID ${pid}: puertos en LISTEN detectados: [${ports.join(', ')}]`);
    return ports;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error al consultar Get-NetTCPConnection para PID ${pid}: ${msg}`);
    return [];
  }
}

/**
 * Valida un puerto intentando un POST HTTPS rápido al endpoint local.
 */
export async function validateEndpointPort(port: number, csrfToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const postData = JSON.stringify({});
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Codeium-Csrf-Token': csrfToken,
          'Connect-Protocol-Version': '1',
          'Content-Length': Buffer.byteLength(postData),
        },
        rejectUnauthorized: false,
        timeout: 2500,
      },
      (res) => {
        // Si responde 200 o incluso 4xx/5xx con cabeceras HTTP válidas del servidor local
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else {
          resolve(false);
        }
        res.resume();
      },
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Itera los candidatos y sus puertos escuchando para encontrar el puerto que responde.
 * Solo se acepta un puerto que pase la sonda de validación.
 */
export async function findWorkingPortForCandidates(
  candidates: ProcessCandidate[],
  portScanner: (pid: number) => Promise<number[]> = getListeningPorts,
  portValidator: (port: number, token: string) => Promise<boolean> = validateEndpointPort,
): Promise<ServerConnection | null> {
  for (const candidate of candidates) {
    const ports = await portScanner(candidate.pid);

    // Intentar validar cada puerto detectado
    for (const port of ports) {
      const isValid = await portValidator(port, candidate.csrfToken);
      if (isValid) {
        logger.debug(`Puerto ${port} validado exitosamente para PID ${candidate.pid}`);
        return {
          port,
          csrfToken: candidate.csrfToken,
          pid: candidate.pid,
        };
      }
    }
  }

  return null;
}
