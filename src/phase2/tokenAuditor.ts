/**
 * AG Pro Quota — Auditor de Tokens (v1.1.0)
 *
 * Lee e inspecciona las bases de datos SQLite locales de conversaciones
 * en modo ESTRICTAMENTE SOLO LECTURA ({ readOnly: true }).
 *
 * REGLAS DE SEGURIDAD Y PRIVACIDAD:
 * - NUNCA lee ni selecciona columnas de texto ni mensajes de usuario.
 * - Únicamente consulta columnas numéricas y metadatos: idx, step_type, metadata.
 * - Sin bloqueo de archivos (WAL mode compatible).
 * - Rendimiento optimizado: lectura incremental de pasos nuevos por índice (idx > lastReadIdx).
 * - Degradación elegante si node:sqlite no estuviera presente.
 * - Velocidad real basada exclusivamente en timestamps reales de inicio y fin (sin simulación).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { decodeTokenUsage } from './protoWire';
import type { StepUsage } from '../types';

// @ts-expect-error node:sqlite es provisto por Node 22+
import { DatabaseSync } from 'node:sqlite';

export interface RequestTokenMetric {
  stepIndex: number;
  modelCode: number;
  modelName: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cacheTokens: number | null; // Tokens leídos de caché (campo 9.6)
  cacheRatio: number | null; // Ratio de caché (0..1)
  startTimestamp: Date | null;
  endTimestamp: Date | null;
  durationSeconds: number | null;
  outputSpeedTokensPerSec: number | null;
}

export interface SessionTokenSummary {
  sessionId: string;
  dbPath: string;
  lastModifiedMs: number;
  isActive: boolean;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalThoughtTokens: number;
  totalTokens: number;
  totalCacheTokens: number;
  userTurns: number;
  modelTurns: number;
  requests: RequestTokenMetric[]; // Más recientes primero
  cacheRatioFormatted: string;
  averageTokensPerRequest: number;
  isExpensiveSession?: boolean; // Aviso v1.2.0 de sesión cara
  expensiveReason?: string;
}

export interface SessionListItem {
  sessionId: string;
  totalTokens: number;
  lastModifiedMs: number;
  isActive: boolean;
}

export interface GlobalTokenSummary {
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalThoughtTokens: number;
  totalTokens: number;
  totalSessions: number;
  sessions: SessionListItem[];
}

export interface TokenAuditSnapshot {
  isAvailable: boolean;
  unavailableReason?: string;
  activeSession: SessionTokenSummary | null;
  globalSummary: GlobalTokenSummary | null;
  lastScanTimestamp: Date;
  collectedStepUsages?: StepUsage[];
}

/** Caché en memoria por sesión para lectura incremental */
interface CachedSessionData {
  mtime: number;
  size: number;
  lastReadIdx: number;
  userTurns: number;
  modelTurns: number;
  requests: RequestTokenMetric[];
  totalPrompt: number;
  totalOutput: number;
  totalThought: number;
  totalCache: number;
  stepUsages: StepUsage[];
}

const sessionCache = new Map<string, CachedSessionData>();
let lastGlobalRefreshMs = 0;
let cachedGlobalSummary: GlobalTokenSummary | null = null;

const GLOBAL_REFRESH_INTERVAL_MS = 60000; // Recalcular globales cada 60s

/**
 * Decodifica un varint en un buffer Protobuf.
 */
export function decodeVarint(buf: Buffer, offset: number): [number, number] {
  let res = 0;
  let shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    res |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [res, offset];
}

/**
 * Parsea los campos numéricos de metadata (step_type = 15).
 */
export function parseStepMetadata(rawBuf: Buffer | Uint8Array | null): {
  startTime: { sec: number; ns: number } | null;
  endTime: { sec: number; ns: number } | null;
  modelCode: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
} {
  const result = {
    startTime: null as { sec: number; ns: number } | null,
    endTime: null as { sec: number; ns: number } | null,
    modelCode: 0,
    promptTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
  };

  if (!rawBuf) return result;
  const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);

  let offset = 0;
  while (offset < buf.length) {
    try {
      const [tag, nOff] = decodeVarint(buf, offset);
      offset = nOff;
      const fNum = tag >> 3;
      const wire = tag & 0x07;

      if (wire === 2) {
        // Length-delimited sub-message
        const [len, lOff] = decodeVarint(buf, offset);
        offset = lOff;
        const sub = buf.subarray(offset, offset + len);
        offset += len;

        // Field 1: Start Timestamp (subfield 1=sec, 2=ns)
        if (fNum === 1) {
          result.startTime = parseTimestampSubmessage(sub);
        }
        // Field 7 (o fallback 6/8): End Timestamp
        else if (fNum === 7 || fNum === 6 || fNum === 8) {
          const ts = parseTimestampSubmessage(sub);
          if (ts && (!result.endTime || ts.sec > result.endTime.sec)) {
            result.endTime = ts;
          }
        }
        // Field 9: Métricas de tokens
        else if (fNum === 9) {
          let sOff = 0;
          while (sOff < sub.length) {
            const [sTag, snOff] = decodeVarint(sub, sOff);
            sOff = snOff;
            const sNum = sTag >> 3;
            const sWire = sTag & 0x07;
            if (sWire === 0) {
              const [val, vOff] = decodeVarint(sub, sOff);
              sOff = vOff;
              if (sNum === 1) result.modelCode = val;
              else if (sNum === 2) result.thoughtTokens = val;
              else if (sNum === 3) result.outputTokens = val;
              else if (sNum === 5) result.promptTokens = val;
            } else if (sWire === 2) {
              const [sLen, slOff] = decodeVarint(sub, sOff);
              sOff = slOff + sLen;
            } else {
              break;
            }
          }
        }
      } else if (wire === 0) {
        const [, vOff] = decodeVarint(buf, offset);
        offset = vOff;
      } else if (wire === 1) {
        offset += 8;
      } else if (wire === 5) {
        offset += 4;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return result;
}

function parseTimestampSubmessage(sub: Buffer): { sec: number; ns: number } | null {
  try {
    let sOff = 0;
    let sec = 0;
    let ns = 0;
    while (sOff < sub.length) {
      const [sTag, snOff] = decodeVarint(sub, sOff);
      sOff = snOff;
      const sNum = sTag >> 3;
      const sWire = sTag & 0x07;
      if (sWire === 0) {
        const [val, vOff] = decodeVarint(sub, sOff);
        sOff = vOff;
        if (sNum === 1) sec = val;
        else if (sNum === 2) ns = val;
      } else if (sWire === 2) {
        const [sLen, slOff] = decodeVarint(sub, sOff);
        sOff = slOff + sLen;
      } else {
        break;
      }
    }
    return sec > 0 ? { sec, ns } : null;
  } catch {
    return null;
  }
}

/**
 * Traduce el código numérico de modelo a un nombre legible.
 */
export function resolveModelCodeName(code: number): string {
  switch (code) {
    case 1318:
      return 'Gemini 3.8 Flash (High)';
    case 1319:
      return 'Gemini 3.8 Flash (Medium)';
    case 1320:
      return 'Gemini 3.8 Flash (Low)';
    case 1026:
      return 'Claude Opus 4.6 (Thinking)';
    case 1035:
      return 'Claude Sonnet 4.6';
    default:
      return code > 0 ? `Modelo (${code})` : 'Desconocido';
  }
}

/**
 * Ejecuta una auditoría de tokens segura e incremental.
 */
export async function auditTokens(customConvDir?: string): Promise<TokenAuditSnapshot> {
  const now = new Date();

  // 1. Verificación de soporte nativo de SQLite
  if (typeof DatabaseSync !== 'function') {
    return {
      isAvailable: false,
      unavailableReason: 'node:sqlite no está disponible en este entorno Node.js',
      activeSession: null,
      globalSummary: null,
      lastScanTimestamp: now,
    };
  }

  const convDir =
    customConvDir ||
    path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      '.gemini',
      'antigravity-ide',
      'conversations',
    );

  if (!fs.existsSync(convDir)) {
    return {
      isAvailable: false,
      unavailableReason: `Carpeta de conversaciones no encontrada (${convDir})`,
      activeSession: null,
      globalSummary: null,
      lastScanTimestamp: now,
    };
  }

  try {
    const files = fs.readdirSync(convDir).filter((f) => f.endsWith('.db'));
    if (files.length === 0) {
      return {
        isAvailable: true,
        activeSession: null,
        globalSummary: {
          totalPromptTokens: 0,
          totalOutputTokens: 0,
          totalThoughtTokens: 0,
          totalTokens: 0,
          totalSessions: 0,
          sessions: [],
        },
        lastScanTimestamp: now,
      };
    }

    // Identificar base activa: la modificada más recientemente
    const sessionFiles = files
      .map((f) => {
        const fullPath = path.join(convDir, f);
        const st = fs.statSync(fullPath);
        return {
          id: f.replace('.db', ''),
          path: fullPath,
          size: st.size,
          mtime: st.mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const activeFileInfo = sessionFiles[0];

    // 2. Procesar sesión activa de forma incremental
    const activeSession = scanSessionIncremental(activeFileInfo, true);

    // 3. Procesar resumen global (con caché por mtime/size)
    const shouldRefreshGlobal =
      !cachedGlobalSummary ||
      Date.now() - lastGlobalRefreshMs > GLOBAL_REFRESH_INTERVAL_MS;

    let globalSummary: GlobalTokenSummary;
    if (shouldRefreshGlobal) {
      globalSummary = buildGlobalSummary(sessionFiles, activeFileInfo.id, activeSession);
      cachedGlobalSummary = globalSummary;
      lastGlobalRefreshMs = Date.now();
    } else {
      globalSummary = cachedGlobalSummary!;
    }

    return {
      isAvailable: true,
      activeSession,
      globalSummary,
      lastScanTimestamp: now,
      collectedStepUsages: getAllCollectedStepUsages(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error en auditoría de tokens: ${msg}`);
    return {
      isAvailable: false,
      unavailableReason: `Error leyendo datos de sesión: ${msg}`,
      activeSession: null,
      globalSummary: null,
      lastScanTimestamp: now,
    };
  }
}

/**
 * Lee una base SQLite de forma incremental, aprovechando el caché por archivo.
 */
function scanSessionIncremental(
  fileInfo: { id: string; path: string; size: number; mtime: number },
  isActive: boolean,
): SessionTokenSummary {
  let cached = sessionCache.get(fileInfo.id);

  // Si el archivo no ha cambiado y ya está en caché, devolver cálculo rápido
  if (cached && cached.mtime === fileInfo.mtime && cached.size === fileInfo.size) {
    return buildSummaryFromCached(fileInfo.id, fileInfo.path, fileInfo.mtime, isActive, cached);
  }

  let db: { prepare: (sql: string) => { all: (param?: unknown) => unknown[]; get: () => unknown }; close: () => void; exec: (sql: string) => void } | null = null;
  try {
    const activeDb = new DatabaseSync(fileInfo.path, { readOnly: true });
    db = activeDb;

    // Blindaje PRAGMA
    try {
      activeDb.exec('PRAGMA busy_timeout = 3000;');
      activeDb.exec('PRAGMA query_only = ON;');
    } catch {
      // Ignorar si PRAGMAs fallan en ciertas versiones
    }

    if (!cached) {
      cached = {
        mtime: fileInfo.mtime,
        size: fileInfo.size,
        lastReadIdx: -1,
        userTurns: 0,
        modelTurns: 0,
        requests: [],
        totalPrompt: 0,
        totalOutput: 0,
        totalThought: 0,
        totalCache: 0,
        stepUsages: [],
      };
    }

    // 1. Contar turnos
    const countsStmt = activeDb.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM steps WHERE step_type = 14) as uTurns,
        (SELECT COUNT(*) FROM steps WHERE step_type = 15) as mTurns;
    `);
    const counts = countsStmt.get() as { uTurns?: number; mTurns?: number } | undefined;
    cached.userTurns = counts?.uTurns || 0;
    cached.modelTurns = counts?.mTurns || 0;

    // 2. Leer pasos incrementales (idx > lastReadIdx)
    // Verificar si existe la columna status (en DB real existe, en fixtures antiguos puede omitirse)
    const cols = activeDb.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    const hasStatus = cols.some((c) => c.name === 'status');
    const sql = hasStatus
      ? `SELECT idx, step_type, status, metadata FROM steps WHERE step_type = 15 AND idx > ? ORDER BY idx ASC;`
      : `SELECT idx, step_type, 3 as status, metadata FROM steps WHERE step_type = 15 AND idx > ? ORDER BY idx ASC;`;

    const stepsStmt = activeDb.prepare(sql);
    const newRows = stepsStmt.all(cached.lastReadIdx) as Array<{
      idx: number;
      step_type: number;
      status: number;
      metadata: Buffer | Uint8Array | null;
    }>;

    for (const r of newRows) {
      // Cursor incremental seguro: detener cursor si el paso no ha finalizado
      const isFinal = r.status === 3 || r.status === 2;
      if (!isFinal) {
        break;
      }
      cached.lastReadIdx = r.idx;
      if (!r.metadata) continue;

      const meta = parseStepMetadata(r.metadata);
      const tokenUsageResult = decodeTokenUsage(
        r.metadata instanceof Uint8Array ? r.metadata : new Uint8Array(r.metadata),
      );

      let promptTokens = meta.promptTokens;
      let outputTokens = meta.outputTokens;
      let thoughtTokens = meta.thoughtTokens;
      let cacheTokens: number | null = null;
      let cacheRatio: number | null = null;

      if (tokenUsageResult.ok) {
        const u = tokenUsageResult.usage;
        promptTokens = u.input;
        outputTokens = u.output;
        thoughtTokens = u.thoughts;
        cacheTokens = u.cacheRead;
        cacheRatio = u.input > 0 ? Math.round((u.cacheRead / u.input) * 1000) / 1000 : 0;
      }

      let durationSec: number | null = null;
      let speed: number | null = null;

      let startTs: Date | null = null;
      let endTs: Date | null = null;

      if (meta.startTime) {
        startTs = new Date(meta.startTime.sec * 1000 + Math.round(meta.startTime.ns / 1e6));
      }
      if (meta.endTime) {
        endTs = new Date(meta.endTime.sec * 1000 + Math.round(meta.endTime.ns / 1e6));
      }

      if (meta.startTime && meta.endTime) {
        const startTotal = meta.startTime.sec + meta.startTime.ns / 1e9;
        const endTotal = meta.endTime.sec + meta.endTime.ns / 1e9;
        const diff = endTotal - startTotal;
        if (diff > 0.05) {
          durationSec = Math.round(diff * 100) / 100;
          if (outputTokens > 0) {
            speed = Math.round((outputTokens / diff) * 10) / 10;
          }
        }
      }

      const totalStepTokens = outputTokens + thoughtTokens;

      const req: RequestTokenMetric = {
        stepIndex: r.idx,
        modelCode: meta.modelCode,
        modelName: resolveModelCodeName(meta.modelCode),
        promptTokens,
        outputTokens,
        thoughtTokens,
        totalTokens: totalStepTokens,
        cacheTokens,
        cacheRatio,
        startTimestamp: startTs,
        endTimestamp: endTs,
        durationSeconds: durationSec,
        outputSpeedTokensPerSec: speed,
      };

      cached.requests.push(req);
      cached.totalOutput += outputTokens;
      cached.totalThought += thoughtTokens;
      cached.totalPrompt = promptTokens;
      if (cacheTokens !== null) {
        cached.totalCache += cacheTokens;
      }

      if (tokenUsageResult.ok) {
        const su: StepUsage = {
          id: r.idx,
          conversationId: fileInfo.id,
          ts: endTs ? endTs.getTime() : (startTs ? startTs.getTime() : fileInfo.mtime),
          usage: tokenUsageResult.usage,
        };
        cached.stepUsages.push(su);
      }
    }

    cached.mtime = fileInfo.mtime;
    cached.size = fileInfo.size;
    sessionCache.set(fileInfo.id, cached);

    return buildSummaryFromCached(fileInfo.id, fileInfo.path, fileInfo.mtime, isActive, cached);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // safe close
      }
    }
  }
}

function buildSummaryFromCached(
  id: string,
  dbPath: string,
  lastModifiedMs: number,
  isActive: boolean,
  cached: CachedSessionData,
): SessionTokenSummary {
  const sortedRequests = [...cached.requests].sort((a, b) => b.stepIndex - a.stepIndex);
  const totalTokens = cached.totalPrompt + cached.totalOutput + cached.totalThought;
  const avg =
    cached.requests.length > 0 ? Math.round(totalTokens / cached.requests.length) : 0;

  const cacheRatioFormatted =
    cached.totalPrompt > 0 && cached.totalCache > 0
      ? `${Math.round((cached.totalCache / cached.totalPrompt) * 100)}%`
      : cached.totalCache > 0
        ? '0%'
        : 'N/A';

  // Detector de sesiones caras
  let isExpensiveSession = false;
  let expensiveReason: string | undefined;

  if (isActive && cached.requests.length > 0) {
    const latestReq = cached.requests[cached.requests.length - 1];
    if (
      latestReq &&
      latestReq.promptTokens > 35000 &&
      (latestReq.cacheRatio === null || latestReq.cacheRatio < 0.2)
    ) {
      isExpensiveSession = true;
      expensiveReason = `Contexto alto (${latestReq.promptTokens.toLocaleString()} tokens con ratio de caché <20%). Te sugerimos abrir un nuevo chat para optimizar tu cuota.`;
    }
  }

  return {
    sessionId: id,
    dbPath,
    lastModifiedMs,
    isActive,
    totalPromptTokens: cached.totalPrompt,
    totalOutputTokens: cached.totalOutput,
    totalThoughtTokens: cached.totalThought,
    totalTokens,
    totalCacheTokens: cached.totalCache,
    userTurns: cached.userTurns,
    modelTurns: cached.modelTurns,
    requests: sortedRequests,
    cacheRatioFormatted,
    averageTokensPerRequest: avg,
    isExpensiveSession,
    expensiveReason,
  };
}

/**
 * Calcula el resumen global a partir de todas las sesiones registradas.
 */
function buildGlobalSummary(
  sessionFiles: Array<{ id: string; path: string; size: number; mtime: number }>,
  activeId: string,
  activeSession: SessionTokenSummary,
): GlobalTokenSummary {
  let gPrompt = 0;
  let gOutput = 0;
  let gThought = 0;
  let gTotal = 0;

  const sessionList: SessionListItem[] = [];

  for (const f of sessionFiles) {
    const isAct = f.id === activeId;
    let sTokens = 0;

    if (isAct) {
      sTokens = activeSession.totalTokens;
      gPrompt += activeSession.totalPromptTokens;
      gOutput += activeSession.totalOutputTokens;
      gThought += activeSession.totalThoughtTokens;
      gTotal += activeSession.totalTokens;
    } else {
      // Usar caché si existe o calcular de forma ligera
      const cached = sessionCache.get(f.id);
      if (!cached || cached.mtime !== f.mtime) {
        try {
          const s = scanSessionIncremental(f, false);
          sTokens = s.totalTokens;
          gPrompt += s.totalPromptTokens;
          gOutput += s.totalOutputTokens;
          gThought += s.totalThoughtTokens;
          gTotal += s.totalTokens;
        } catch {
          // fallback silencioso
        }
      } else {
        sTokens = cached.totalPrompt + cached.totalOutput + cached.totalThought;
        gPrompt += cached.totalPrompt;
        gOutput += cached.totalOutput;
        gThought += cached.totalThought;
        gTotal += sTokens;
      }
    }

    sessionList.push({
      sessionId: f.id,
      totalTokens: sTokens,
      lastModifiedMs: f.mtime,
      isActive: isAct,
    });
  }

  return {
    totalPromptTokens: gPrompt,
    totalOutputTokens: gOutput,
    totalThoughtTokens: gThought,
    totalTokens: gTotal,
    totalSessions: sessionFiles.length,
    sessions: sessionList,
  };
}

/**
 * Retorna todos los StepUsage acumulados de todas las sesiones leídas.
 */
export function getAllCollectedStepUsages(): StepUsage[] {
  const all: StepUsage[] = [];
  for (const c of sessionCache.values()) {
    all.push(...c.stepUsages);
  }
  return all.sort((a, b) => a.ts - b.ts);
}

let convWatcher: fs.FSWatcher | null = null;
let watcherDebounceTimer: NodeJS.Timeout | null = null;

/**
 * Watcher ligero con debounce de 1.5s sobre el directorio de conversaciones.
 * Se pausa automáticamente cuando la ventana de VS Code no tiene foco.
 */
export function startConversationWatcher(
  convDir: string,
  onChanged: () => void,
): { dispose: () => void } {
  if (convWatcher) {
    try {
      convWatcher.close();
    } catch {
      // Ignorar
    }
    convWatcher = null;
  }

  if (!fs.existsSync(convDir)) {
    return { dispose: () => {} };
  }

  try {
    convWatcher = fs.watch(convDir, (_eventType, filename) => {
      // Pausar si vscode window no tiene foco
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode');
        if (vscode?.window && !vscode.window.state.focused) {
          return;
        }
      } catch {
        // En tests unitarios sin vscode, continuar normalmente
      }

      const strName = typeof filename === 'string' ? filename : '';
      if (!strName || (!strName.endsWith('.db') && !strName.endsWith('.db-wal'))) {
        return;
      }

      if (watcherDebounceTimer) {
        clearTimeout(watcherDebounceTimer);
      }
      watcherDebounceTimer = setTimeout(() => {
        onChanged();
      }, 1500);
    });
  } catch (err) {
    logger.warn(`No se pudo iniciar fs.watch en ${convDir}: ${err}`);
  }

  return {
    dispose: () => {
      if (watcherDebounceTimer) {
        clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = null;
      }
      if (convWatcher) {
        try {
          convWatcher.close();
        } catch {
          // Ignorar
        }
        convWatcher = null;
      }
    },
  };
}

