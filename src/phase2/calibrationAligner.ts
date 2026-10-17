/**
 * AG Pro Quota — Alineador de Calibración de Cuota (v1.2.0)
 *
 * Alinea snapshots de cuota con pasos de inferencia y produce muestras de calibración.
 * La atribución a un pool usa la propia caída de cuota como etiqueta (los pasos no traen modelo).
 */

import { decodeTokenUsage } from './protoWire';
import {
  POOLS,
  type CalibrationSample,
  type PoolId,
  type CalibrationQuotaSnapshot,
  type StepRowMeta,
  type StepUsage,
  type WindowId,
  type WindowReading,
} from '../types';

export interface AlignOptions {
  readonly window: WindowId;
  /** Latencia empírica backend-cuota: la ventana de pasos es (t0-lag, t1-lag]. */
  readonly lagMs: number;
  /** Caída mínima (puntos %) para aceptar una muestra. */
  readonly minDeltaPct: number;
  /** Por debajo de esto, un cambio en el OTRO pool se considera ruido. */
  readonly noiseFloorPct: number;
  /** Máxima duración de una muestra acumulada. */
  readonly maxSpanMs: number;
  readonly minTokens: number;
  /** Si resetAt se mueve más que esto (con cuota ya usada), hubo reset. */
  readonly resetShiftMs: number;
}

export const DEFAULT_ALIGN_OPTIONS: AlignOptions = {
  window: '5h',
  lagMs: 10_000,
  minDeltaPct: 0.5,
  noiseFloorPct: 0.1,
  maxSpanMs: 30 * 60_000,
  minTokens: 1,
  resetShiftMs: 60_000,
};

export type RejectReason = 'noReading' | 'reset' | 'noise' | 'concurrent' | 'noLocalTokens';
export type AlignResult =
  | { readonly ok: true; readonly sample: CalibrationSample }
  | { readonly ok: false; readonly reason: RejectReason };

const dropPct = (a: WindowReading, b: WindowReading): number =>
  (a.remainingFraction - b.remainingFraction) * 100;

/** Primer índice con ts > t (steps ordenados por ts). */
function upperBound(steps: readonly StepUsage[], t: number): number {
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (steps[mid]!.ts <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function alignInterval(
  s0: CalibrationQuotaSnapshot,
  s1: CalibrationQuotaSnapshot,
  steps: readonly StepUsage[], // ordenados por ts
  opts: AlignOptions = DEFAULT_ALIGN_OPTIONS,
): AlignResult {
  const drops = {} as Record<PoolId, number>;
  for (const pool of POOLS) {
    const r0 = s0.pools[pool][opts.window];
    const r1 = s1.pools[pool][opts.window];
    if (!r0 || !r1) return { ok: false, reason: 'noReading' };
    const d = dropPct(r0, r1);
    const resetMoved =
      r0.remainingFraction < 1 && Math.abs(r1.resetAtMs - r0.resetAtMs) > opts.resetShiftMs;
    if (d < -opts.noiseFloorPct || resetMoved) return { ok: false, reason: 'reset' };
    drops[pool] = d;
  }

  const active = POOLS.filter((p) => drops[p] >= opts.minDeltaPct);
  if (active.length === 0) return { ok: false, reason: 'noise' };
  const target = active[0]!;
  if (active.length > 1 || POOLS.some((p) => p !== target && drops[p] > opts.noiseFloorPct)) {
    return { ok: false, reason: 'concurrent' };
  }

  const from = s0.takenAt - opts.lagMs;
  const to = s1.takenAt - opts.lagMs;
  let inputNoCache = 0;
  let cacheRead = 0;
  let output = 0;
  let thoughts = 0;
  let stepCount = 0;
  for (let i = upperBound(steps, from); i < steps.length && steps[i]!.ts <= to; i++) {
    const u = steps[i]!.usage;
    inputNoCache += u.inputNoCache;
    cacheRead += u.cacheRead;
    output += u.output;
    thoughts += u.thoughts;
    stepCount++;
  }
  if (inputNoCache + cacheRead + output + thoughts < opts.minTokens) {
    // La cuota es de la cuenta: pudo consumirse desde otra máquina o proceso
    return { ok: false, reason: 'noLocalTokens' };
  }

  return {
    ok: true,
    sample: {
      pool: target,
      window: opts.window,
      t0: s0.takenAt,
      t1: s1.takenAt,
      deltaPct: drops[target],
      x: { inputNoCache, cacheRead, output, thoughts },
      stepCount,
    },
  };
}

export interface BuildReport {
  readonly samples: CalibrationSample[];
  readonly rejected: Record<RejectReason | 'tooLong', number>;
}

/**
 * Recorre los snapshots acumulando intervalos hasta alcanzar minDeltaPct.
 * Con polls cada 5–30 s, casi ninguno pasa 0.5% por sí solo; el ancla se mantiene
 * mientras el resultado sea 'noise' y se reinicia ante cualquier otro rechazo.
 */
export function buildSamples(
  snapshots: readonly CalibrationQuotaSnapshot[],
  steps: readonly StepUsage[],
  opts: AlignOptions = DEFAULT_ALIGN_OPTIONS,
): BuildReport {
  const snaps = [...snapshots].sort((a, b) => a.takenAt - b.takenAt);
  const sorted = [...steps].sort((a, b) => a.ts - b.ts);
  const rejected: BuildReport['rejected'] = {
    noReading: 0,
    reset: 0,
    noise: 0,
    concurrent: 0,
    noLocalTokens: 0,
    tooLong: 0,
  };
  const samples: CalibrationSample[] = [];

  let anchor = 0;
  for (let j = 1; j < snaps.length; j++) {
    const a = snaps[anchor]!;
    const b = snaps[j]!;
    if (b.takenAt - a.takenAt > opts.maxSpanMs) {
      rejected.tooLong++;
      anchor = j;
      continue;
    }
    const res = alignInterval(a, b, sorted, opts);
    if (res.ok) {
      samples.push(res.sample);
      anchor = j;
    } else if (res.reason !== 'noise') {
      rejected[res.reason]++;
      anchor = j;
    }
  }
  return { samples, rejected };
}

export type TimeField = 'createdAt' | 'updatedAt';

/**
 * Filtra pasos de inferencia completados (status = 3 o 2), decodifica y cuenta descartes.
 */
export function toStepUsages(
  rows: readonly StepRowMeta[],
  timeField: TimeField = 'updatedAt',
): { steps: StepUsage[]; skipped: Record<string, number> } {
  const steps: StepUsage[] = [];
  const skipped: Record<string, number> = {};
  const bump = (k: string): void => void (skipped[k] = (skipped[k] ?? 0) + 1);

  for (const r of rows) {
    if (r.stepType !== 15) continue;
    // Empíricamente validado: en Antigravity IDE los pasos completados tienen status = 3 (o 2)
    if (r.status !== 3 && r.status !== 2) {
      bump('notFinal');
      continue;
    }
    if (!r.metadata) {
      bump('noMetadata');
      continue;
    }
    const d = decodeTokenUsage(r.metadata);
    if (!d.ok) {
      bump(d.reason);
      continue;
    }
    steps.push({ id: r.id, conversationId: r.conversationId, ts: r[timeField], usage: d.usage });
  }
  steps.sort((a, b) => a.ts - b.ts);
  return { steps, skipped };
}
