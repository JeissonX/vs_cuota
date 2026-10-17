/**
 * AG Pro Quota — NNLS (Lawson-Hanson) y Ajuste de Calibración (v1.2.0)
 *
 * Resuelve: min ||A·x - b||² sujeto a x >= 0 (pesos de cuota no-negativos).
 * Calcula coeficientes de cuota % por millón de tokens para cada componente.
 */

import {
  FEATURES,
  type CalibrationFit,
  type CalibrationSample,
  type Feature,
  type FeatureVector,
  type PoolId,
  type WindowId,
} from '../types';

/** Resuelve las ecuaciones normales restringidas a las columnas pasivas (con ridge mínimo). */
function solvePassive(A: number[][], b: number[], passive: boolean[]): number[] {
  const n = passive.length;
  const idx = passive.flatMap((p, j) => (p ? [j] : []));
  const k = idx.length;
  const G = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const r = new Array<number>(k).fill(0);
  for (let i = 0; i < A.length; i++) {
    const row = A[i]!;
    for (let p = 0; p < k; p++) {
      const ap = row[idx[p]!]!;
      r[p]! += ap * b[i]!;
      for (let q = 0; q < k; q++) G[p]![q]! += ap * row[idx[q]!]!;
    }
  }
  for (let p = 0; p < k; p++) G[p]![p]! += 1e-10 * (G[p]![p]! || 1);

  // Eliminación gaussiana con pivoteo parcial.
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let i = c + 1; i < k; i++) if (Math.abs(G[i]![c]!) > Math.abs(G[piv]![c]!)) piv = i;
    [G[c], G[piv]] = [G[piv]!, G[c]!];
    [r[c], r[piv]] = [r[piv]!, r[c]!];
    const d = G[c]![c]! || 1e-300;
    for (let i = c + 1; i < k; i++) {
      const f = G[i]![c]! / d;
      for (let j = c; j < k; j++) G[i]![j]! -= f * G[c]![j]!;
      r[i]! -= f * r[c]!;
    }
  }
  const sol = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = r[i]!;
    for (let j = i + 1; j < k; j++) s -= G[i]![j]! * sol[j]!;
    sol[i] = s / (G[i]![i]! || 1e-300);
  }
  const s = new Array<number>(n).fill(0);
  idx.forEach((j, p) => (s[j] = sol[p]!));
  return s;
}

export function nnls(A: number[][], b: number[], tol = 1e-10, maxIter = 200): number[] {
  const n = A[0]?.length ?? 0;
  const x = new Array<number>(n).fill(0);
  const passive = new Array<boolean>(n).fill(false);
  const gradient = (): number[] => {
    const res = b.map((bi, i) => bi - A[i]!.reduce((s, a, j) => s + a * x[j]!, 0));
    return x.map((_, j) => A.reduce((s, row, i) => s + row[j]! * res[i]!, 0));
  };

  let w = gradient();
  for (let outer = 0; outer < maxIter; outer++) {
    let jMax = -1;
    let wMax = tol;
    for (let j = 0; j < n; j++) if (!passive[j] && w[j]! > wMax) ((wMax = w[j]!), (jMax = j));
    if (jMax < 0) break;
    passive[jMax] = true;

    for (let inner = 0; inner < maxIter; inner++) {
      const s = solvePassive(A, b, passive);
      const bad = s.flatMap((sj, j) => (passive[j] && sj <= tol ? [j] : []));
      if (bad.length === 0) {
        for (let j = 0; j < n; j++) x[j] = passive[j] ? s[j]! : 0;
        break;
      }
      let alpha = Infinity;
      for (const j of bad) {
        const den = x[j]! - s[j]!;
        alpha = Math.min(alpha, den > 0 ? x[j]! / den : 0);
      }
      for (let j = 0; j < n; j++) x[j]! += alpha * (s[j]! - x[j]!);
      for (let j = 0; j < n; j++) if (passive[j] && x[j]! <= tol) ((passive[j] = false), (x[j] = 0));
    }
    w = gradient();
  }
  return x;
}

const zeroVec = (): Record<Feature, number> => ({ inputNoCache: 0, cacheRead: 0, output: 0, thoughts: 0 });

/** Ajusta Δ% ≈ Σ coef[f]·tokens[f] (sin intercepto) para un pool/ventana. */
export function fitCalibration(
  all: readonly CalibrationSample[],
  pool: PoolId,
  window: WindowId,
  minSamples = 8,
): CalibrationFit | null {
  const samples = all.filter((s) => s.pool === pool && s.window === window);
  if (samples.length < minSamples) return null;

  // Normaliza columnas para condicionar bien (los tokens llegan a 1e5–1e6).
  const scale = FEATURES.map((f) => Math.max(1, ...samples.map((s) => s.x[f])));
  const A = samples.map((s) => FEATURES.map((f, j) => s.x[f] / scale[j]!));
  const y = samples.map((s) => s.deltaPct);
  const xs = nnls(A, y);

  const coef = zeroVec();
  FEATURES.forEach((f, j) => (coef[f] = xs[j]! / scale[j]!));

  const pred = samples.map((s) => FEATURES.reduce((sum, f) => sum + coef[f] * s.x[f], 0));
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  const ssRes = y.reduce((a, yi, i) => a + (yi - pred[i]!) ** 2, 0);
  const ssTot = y.reduce((a, yi) => a + (yi - mean) ** 2, 0);

  const per1M = zeroVec();
  FEATURES.forEach((f) => (per1M[f] = coef[f] * 1e6));
  return {
    pool,
    window,
    n: samples.length,
    coefPctPerToken: coef,
    pctPer1MTokens: per1M,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    rmsePct: Math.sqrt(ssRes / samples.length),
  };
}

/** Umbral de confianza para mostrar la estimación en la UI (n >= 30 y R² >= 0.6). */
export const isTrustworthy = (fit: CalibrationFit, minN = 30, minR2 = 0.6): boolean =>
  fit.n >= minN && fit.r2 >= minR2;

export const predictPct = (fit: CalibrationFit, tokens: FeatureVector): number =>
  FEATURES.reduce((sum, f) => sum + fit.coefPctPerToken[f] * tokens[f], 0);
