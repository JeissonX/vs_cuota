// Origen: src/phase2/nnls.ts (commit fbcf77c223a5477d9c6e5e8e82efea12bb649842)
/**
 * Context Auditor — Vendor NNLS (Lawson-Hanson Non-Negative Least Squares)
 *
 * Resuelve: min ||A·x - b||² sujeto a x >= 0.
 * Cero dependencias externas.
 */

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
  if (n === 0 || b.length === 0) return [];
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
