/**
 * AG Pro Quota — Gestor de Historial de Cuota y Tendencias
 *
 * Guarda muestras periódicas en globalState (máximo 7 días)
 * y genera gráficos de tendencia SVG nativos sin dependencias externas.
 */

import type * as vscode from 'vscode';
import type { QuotaSnapshot } from './types';

export interface StorageMemento {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void> | void;
}

const HISTORY_KEY = 'agPro.quotaHistory';
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface QuotaHistoryPoint {
  t: number; // timestamp ms
  p: string; // pool name
  w: string; // window ('5h' | 'weekly')
  pct: number; // percent
}

export class QuotaHistoryManager {
  private lastSampleTime = 0;

  constructor(private readonly globalState: vscode.Memento | StorageMemento) {}

  /**
   * Registra una muestra de cuota si han pasado al menos 5 minutos desde la última.
   */
  recordSnapshot(snapshot: QuotaSnapshot): void {
    if (!snapshot.isConnected || snapshot.groups.length === 0) return;

    const now = Date.now();
    if (now - this.lastSampleTime < SAMPLE_INTERVAL_MS) {
      return;
    }

    const history = this.getHistory();
    const cutoff = now - RETENTION_MS;
    const cleanHistory = history.filter((pt) => pt.t >= cutoff);

    for (const group of snapshot.groups) {
      for (const bucket of group.buckets) {
        cleanHistory.push({
          t: now,
          p: group.displayName,
          w: bucket.window,
          pct: bucket.remainingPercent,
        });
      }
    }

    this.globalState.update(HISTORY_KEY, cleanHistory);
    this.lastSampleTime = now;
  }

  /**
   * Obtiene todos los puntos históricos válidos.
   */
  getHistory(): QuotaHistoryPoint[] {
    return this.globalState.get<QuotaHistoryPoint[]>(HISTORY_KEY, []);
  }

  /**
   * Genera un fragmento SVG puro de línea de tendencia (sparkline) para un pool y ventana.
   */
  generateSparklineSvg(poolName: string, windowName: string, width = 140, height = 32): string {
    const all = this.getHistory();
    const points = all.filter(
      (pt) =>
        pt.p.toLowerCase().includes(poolName.toLowerCase()) &&
        (pt.w === windowName || (windowName === '5h' && pt.w.includes('5h'))),
    );

    if (points.length < 2) {
      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="opacity: 0.3;">
        <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="currentColor" stroke-dasharray="2" stroke-width="1"/>
      </svg>`;
    }

    // Tomar los últimos 30 puntos
    const recent = points.slice(-30);
    const minT = recent[0].t;
    const maxT = recent[recent.length - 1].t;
    const timeSpan = maxT - minT || 1;

    const coords = recent.map((pt) => {
      const x = Math.round(((pt.t - minT) / timeSpan) * (width - 4)) + 2;
      const y = Math.round((1 - Math.max(0, Math.min(100, pt.pct)) / 100) * (height - 6)) + 3;
      return `${x},${y}`;
    });

    const lastPct = recent[recent.length - 1].pct;
    const strokeColor = lastPct > 50 ? '#3fb950' : lastPct > 20 ? '#f59e0b' : '#ef4444';

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="vertical-align: middle;">
      <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}"/>
    </svg>`;
  }
}
