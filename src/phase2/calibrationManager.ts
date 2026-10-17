/**
 * AG Pro Quota — Gestor de Calibración, NNLS y Proyecciones de Cuota (v1.2.0)
 *
 * Responsabilidades:
 * - Acumular snapshots de cuota (CalibrationQuotaSnapshot) y pasos decodificados (StepUsage).
 * - Ejecutar el ajuste NNLS (buildSamples + fitCalibration) para los pools Gemini y Claude.
 * - Proyección de ritmo de consumo (Burn Rate) vs tiempo de reinicio (Reset Time).
 * - Detección de confianza estadística (n >= 30, R² >= 0.6) según isTrustworthy().
 */

import {
  type CalibrationFit,
  type CalibrationQuotaSnapshot,
  type CalibrationSample,
  type PoolId,
  type StepUsage,
  type WindowId,
} from '../types';
import { buildSamples } from './calibrationAligner';
import { fitCalibration, isTrustworthy } from './nnls';
import { toCalibrationSnapshot } from '../quotaParser';
import type { RawQuotaSummaryResponse } from '../types';

export interface BurnRateProjection {
  burnRatePctPerHour: number;
  hoursToDepletion: number | null;
  hoursToReset: number | null;
  willDepleteBeforeReset: boolean;
  statusText: string;
  badgeText: string;
}

export interface CalibrationPoolStatus {
  pool: PoolId;
  window: WindowId;
  sampleCount: number;
  isTrustworthy: boolean;
  fit: CalibrationFit | null;
  progressText: string;
}

export class CalibrationManager {
  private snapshots: CalibrationQuotaSnapshot[] = [];
  private steps: StepUsage[] = [];
  private stepIds = new Set<string>();
  private fits = new Map<string, CalibrationFit | null>();
  private samples = new Map<string, CalibrationSample[]>();

  private maxSnapshots = 2000;
  private maxSteps = 5000;

  /**
   * Registra un snapshot de cuota a partir de la respuesta cruda de RetrieveUserQuotaSummary.
   */
  public recordQuotaRaw(rawQuota: RawQuotaSummaryResponse | null, takenAtMs: number = Date.now()): void {
    const snap = toCalibrationSnapshot(rawQuota, takenAtMs);
    if (!snap) return;

    this.snapshots.push(snap);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Añade nuevos pasos de inferencia decodificados.
   */
  public recordStepUsages(newSteps: StepUsage[]): void {
    for (const s of newSteps) {
      const key = `${s.conversationId}_${s.id}_${s.ts}`;
      if (!this.stepIds.has(key)) {
        this.stepIds.add(key);
        this.steps.push(s);
      }
    }
    if (this.steps.length > this.maxSteps) {
      const removed = this.steps.splice(0, this.steps.length - this.maxSteps);
      for (const r of removed) {
        this.stepIds.delete(`${r.conversationId}_${r.id}_${r.ts}`);
      }
    }
  }

  /**
   * Recalcula los modelos de calibración para todas las combinaciones pool + ventana.
   */
  public recalculate(): void {
    if (this.snapshots.length < 2 || this.steps.length === 0) {
      return;
    }

    const pools: PoolId[] = ['gemini', 'claude'];
    const windows: WindowId[] = ['5h', 'weekly'];

    for (const win of windows) {
      const report = buildSamples(this.snapshots, this.steps, {
        window: win,
        lagMs: 10_000,
        minDeltaPct: 0.5,
        noiseFloorPct: 0.1,
        maxSpanMs: 30 * 60_000,
        minTokens: 1,
        resetShiftMs: 60_000,
      });

      for (const pool of pools) {
        const poolSamples = report.samples.filter((s) => s.pool === pool);
        const key = `${pool}_${win}`;
        this.samples.set(key, poolSamples);

        const fit = fitCalibration(report.samples, pool, win, 8);
        this.fits.set(key, fit);
      }
    }
  }

  /**
   * Obtiene el estado y pesos de calibración para un pool y ventana.
   */
  public getCalibrationStatus(pool: PoolId, window: WindowId = '5h'): CalibrationPoolStatus {
    const key = `${pool}_${window}`;
    const fit = this.fits.get(key) ?? null;
    const sampleList = this.samples.get(key) ?? [];
    const count = sampleList.length;
    const trustworthy = fit !== null && isTrustworthy(fit, 30, 0.6);

    let progressText = '';
    if (trustworthy && fit) {
      progressText = `Calibrado (R²: ${(fit.r2 * 100).toFixed(0)}%, n=${fit.n})`;
    } else {
      progressText = `Calibrando pesos de cuota: ${count}/30 muestras`;
    }

    return {
      pool,
      window,
      sampleCount: count,
      isTrustworthy: trustworthy,
      fit,
      progressText,
    };
  }

  /**
   * Calcula la proyección de agotamiento (Burn Rate) versus tiempo de reinicio.
   */
  public getBurnRateProjection(
    pool: PoolId,
    window: WindowId,
    currentRemainingFraction: number,
    resetTime: Date | null,
  ): BurnRateProjection {
    const now = Date.now();
    const currentPct = currentRemainingFraction * 100;

    // Buscar lecturas de la última hora en los snapshots
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentSnaps = this.snapshots.filter((s) => s.takenAt >= oneHourAgo);

    let burnRatePctPerHour = 0;
    if (recentSnaps.length >= 2) {
      const first = recentSnaps[0]!;
      const last = recentSnaps[recentSnaps.length - 1]!;
      const r0 = first.pools[pool]?.[window]?.remainingFraction;
      const r1 = last.pools[pool]?.[window]?.remainingFraction;

      if (r0 !== undefined && r1 !== undefined && last.takenAt > first.takenAt) {
        const deltaPct = (r0 - r1) * 100;
        const deltaHours = (last.takenAt - first.takenAt) / 3600000;
        if (deltaPct > 0 && deltaHours > 0.05) {
          burnRatePctPerHour = Math.round((deltaPct / deltaHours) * 10) / 10;
        }
      }
    }

    let hoursToDepletion: number | null = null;
    if (burnRatePctPerHour > 0.1) {
      hoursToDepletion = currentPct / burnRatePctPerHour;
    }

    let hoursToReset: number | null = null;
    if (resetTime) {
      const diffMs = resetTime.getTime() - now;
      if (diffMs > 0) {
        hoursToReset = diffMs / 3600000;
      }
    }

    const willDeplete =
      hoursToDepletion !== null &&
      hoursToReset !== null &&
      hoursToDepletion < hoursToReset;

    let statusText = 'Consumo estable (sin agotamiento proyectado)';
    let badgeText = 'Sostenible';

    if (currentPct <= 0) {
      statusText = 'Cuota agotada. Esperando reinicio programado.';
      badgeText = 'Agotada';
    } else if (willDeplete && hoursToDepletion !== null) {
      const depText = this.formatHours(hoursToDepletion);
      statusText = `Agotamiento estimado en ${depText} (antes del reinicio programado)`;
      badgeText = `Agotamiento en ~${depText}`;
    } else if (burnRatePctPerHour > 0) {
      statusText = 'Llega al reset sin agotar (ritmo de consumo sostenible)';
      badgeText = 'Llega al reset';
    }

    return {
      burnRatePctPerHour,
      hoursToDepletion,
      hoursToReset,
      willDepleteBeforeReset: willDeplete,
      statusText,
      badgeText,
    };
  }

  private formatHours(h: number): string {
    const totalMinutes = Math.round(h * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  }
}
