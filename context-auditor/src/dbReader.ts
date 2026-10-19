/**
 * Context Auditor — Núcleo de Lectura SQLite
 *
 * Cumple estrictamente con las Reglas de Seguridad S1, S3 y S4:
 * - DatabaseSync con { readOnly: true }
 * - PRAGMA busy_timeout = 3000
 * - PRAGMA query_only = ON
 * - Solo consulta columnas numéricas y metadatos necesarios
 * - Límite configurable de últimos N pasos (por defecto 200)
 * - Todo fallo degrada graciosamente sin lanzar excepciones no controladas
 */

// @ts-expect-error node:sqlite es provisto por Node 22+
import { DatabaseSync } from 'node:sqlite';
import type { InferenceStep, SchemaGuardResult, TokenUsage } from './types';
import { decodeTokenUsage, readFields } from './vendor/protoWire';

const CRITICAL_COLUMNS = ['idx', 'step_type', 'metadata'] as const;

export function validateSchema(db: { prepare: (sql: string) => { all: (param?: unknown) => unknown[] } }): SchemaGuardResult {
  try {
    const columns = db.prepare('PRAGMA table_info(steps);').all() as { name: string }[];
    const columnNames = new Set(columns.map(c => c.name.toLowerCase()));
    const missing = CRITICAL_COLUMNS.filter(col => !columnNames.has(col));

    if (missing.length > 0) {
      return {
        ok: false,
        statusMessage: 'Auditor inactivo: versión de base de datos no compatible',
        missingColumns: missing,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      statusMessage: 'Auditor inactivo: versión de base de datos no compatible',
      missingColumns: [...CRITICAL_COLUMNS],
    };
  }
}

export function parseTimestamp(buf: Uint8Array): { sec: number; ns: number } | null {
  try {
    let sec = 0;
    let ns = 0;
    for (const f of readFields(buf)) {
      if (f.wire === 0 && f.num !== undefined) {
        if (f.field === 1) sec = f.num;
        else if (f.field === 2) ns = f.num;
      }
    }
    return sec > 0 ? { sec, ns } : null;
  } catch {
    return null;
  }
}

export function extractStepMetadata(metadataBuf: Uint8Array): {
  usage: TokenUsage | null;
  modelCode?: number;
  start?: { sec: number; ns: number } | null;
  end?: { sec: number; ns: number } | null;
  latencyMs?: number | null;
} {
  let usage: TokenUsage | null = null;
  let modelCode: number | undefined;
  let start: { sec: number; ns: number } | null = null;
  let end: { sec: number; ns: number } | null = null;

  try {
    // 1. Decodificar uso de tokens (campo 9)
    const tokenRes = decodeTokenUsage(metadataBuf);
    if (tokenRes.ok) {
      usage = tokenRes.usage;
      modelCode = tokenRes.modelCode;
    }

    // 2. Extraer timestamps de inicio (campo 1) y fin (campo 7 u 8)
    for (const f of readFields(metadataBuf)) {
      if (f.wire === 2 && f.bytes) {
        if (f.field === 1) {
          start = parseTimestamp(f.bytes);
        } else if (f.field === 7 || f.field === 8) {
          end = parseTimestamp(f.bytes);
        }
      } else if (f.wire === 0 && f.num !== undefined) {
        if (f.field === 11 && modelCode === undefined) {
          modelCode = f.num;
        }
      }
    }

    let latencyMs: number | null = null;
    if (start && end) {
      const diffSec = end.sec - start.sec;
      const diffNs = end.ns - start.ns;
      latencyMs = Math.round(diffSec * 1000 + diffNs / 1e6);
      if (latencyMs < 0) latencyMs = null;
    }

    return { usage, modelCode, start, end, latencyMs };
  } catch {
    return { usage: null, modelCode: undefined, start: null, end: null, latencyMs: null };
  }
}

export interface ReadSessionResult {
  readonly guard: SchemaGuardResult;
  readonly lastInference: InferenceStep | null;
  readonly recentInferences: InferenceStep[];
  readonly totalStepsRead: number;
}

export function readSessionContext(
  dbPath: string,
  stepsLimit = 200
): ReadSessionResult {
  const fallbackResult: ReadSessionResult = {
    guard: {
      ok: false,
      statusMessage: 'Auditor inactivo: archivo no disponible',
      missingColumns: [],
    },
    lastInference: null,
    recentInferences: [],
    totalStepsRead: 0,
  };

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 3000;');
      db.exec('PRAGMA query_only = ON;');
    } catch {
      // Ignorar si PRAGMAs fallan
    }

    const guard = validateSchema(db);
    if (!guard.ok) {
      db.close();
      return { ...fallbackResult, guard };
    }

    // Consulta de gen_metadata para obtener nombre legible del modelo si existe
    const modelNames = new Map<number, { slug: string; name: string }>();
    try {
      const genRows = db.prepare('SELECT data FROM gen_metadata').all() as { data?: Uint8Array }[];
      for (const row of genRows) {
        if (row.data) {
          const parsed = extractGenMetadata(row.data);
          if (parsed && parsed.id) {
            modelNames.set(parsed.id, { slug: parsed.slug, name: parsed.name });
          }
        }
      }
    } catch {
      // gen_metadata es opcional
    }

    const rows = db.prepare(`
      SELECT idx, step_type, metadata 
      FROM steps 
      WHERE step_type = 15 AND metadata IS NOT NULL 
      ORDER BY idx DESC 
      LIMIT ?
    `).all(stepsLimit) as { idx: number; step_type: number; metadata: Uint8Array }[];

    const recentInferences: InferenceStep[] = [];
    for (const r of rows) {
      if (!r.metadata) continue;
      const meta = extractStepMetadata(r.metadata);
      if (!meta.usage) continue;

      const modelInfo = meta.modelCode ? modelNames.get(meta.modelCode) : undefined;

      recentInferences.push({
        idx: r.idx,
        stepType: r.step_type,
        modelId: meta.modelCode,
        modelSlug: modelInfo?.slug,
        modelName: modelInfo?.name,
        usage: meta.usage,
        startTimestamp: meta.start,
        endTimestamp: meta.end,
        latencyMs: meta.latencyMs,
      });
    }

    db.close();

    return {
      guard: { ok: true },
      lastInference: recentInferences[0] ?? null,
      recentInferences,
      totalStepsRead: rows.length,
    };
  } catch {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
    return fallbackResult;
  }
}

/**
 * Decodifica slug y display name desde protobuf de gen_metadata.data
 */
function extractGenMetadata(data: Uint8Array): { id?: number; slug: string; name: string } | null {
  try {
    for (const f of readFields(data)) {
      if (f.field === 1 && f.wire === 2 && f.bytes) {
        let id: number | undefined;
        let slug = '';
        let name = '';
        for (const sf of readFields(f.bytes)) {
          if (sf.field === 3 && sf.wire === 0 && sf.num !== undefined) id = sf.num;
          else if (sf.field === 19 && sf.wire === 2 && sf.bytes) {
            slug = new TextDecoder().decode(sf.bytes);
          } else if (sf.field === 21 && sf.wire === 2 && sf.bytes) {
            name = new TextDecoder().decode(sf.bytes);
          }
        }
        if (id !== undefined || slug || name) {
          return { id, slug, name };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

import { extractUserPrompt, extractAssistantReply, extractCommandInfo } from './stepExtractor';
import type { ConversationTurnInputs } from './snapshotGenerator';

export function readConversationForSnapshot(
  dbPath: string,
  limitSteps = 200
): ConversationTurnInputs {
  const fallback: ConversationTurnInputs = {
    userPrompts: [],
    lastAssistantReply: null,
    commands: [],
    touchedFiles: [],
  };

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 3000;');
      db.exec('PRAGMA query_only = ON;');
    } catch {
      // Ignorar
    }

    const guard = validateSchema(db);
    if (!guard.ok) {
      db.close();
      return fallback;
    }

    const rows = db.prepare(`
      SELECT idx, step_type, step_payload 
      FROM steps 
      WHERE step_type IN (14, 15, 21, 5) AND step_payload IS NOT NULL 
      ORDER BY idx DESC 
      LIMIT ?
    `).all(limitSteps) as { idx: number; step_type: number; step_payload: Uint8Array }[];

    // Invertir para procesar en orden cronológico
    rows.reverse();

    const userPrompts: string[] = [];
    let lastAssistantReply: string | null = null;
    const commands: { command: string; exitCode: number | null }[] = [];
    const touchedFiles: string[] = [];

    for (const r of rows) {
      if (!r.step_payload) continue;

      if (r.step_type === 14) {
        const p = extractUserPrompt(r.step_payload);
        if (p && p.trim()) userPrompts.push(p.trim());
      } else if (r.step_type === 15) {
        const a = extractAssistantReply(r.step_payload);
        if (a && a.trim()) lastAssistantReply = a.trim();
      } else if (r.step_type === 21) {
        const cmd = extractCommandInfo(r.step_payload);
        if (cmd) commands.push(cmd);
      }
    }

    db.close();

    return {
      userPrompts,
      lastAssistantReply,
      commands,
      touchedFiles,
    };
  } catch {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
    return fallback;
  }
}
