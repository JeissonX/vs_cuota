/**
 * AG Pro Quota — Parser de Respuestas del Language Server
 *
 * Escrito y probado contra las muestras reales de docs/samples/:
 * - RetrieveUserQuotaSummary.json
 * - GetUserStatus.json
 */

import type {
  RawQuotaSummaryResponse,
  RawUserStatusResponse,
  QuotaSnapshot,
  QuotaGroup,
  QuotaBucket,
  ModelInfo,
} from './types';
import { QuotaLevel } from './types';

/**
 * Construye un QuotaSnapshot unificado a partir de las respuestas crudas del servidor.
 */
export function buildSnapshot(
  quotaRaw: RawQuotaSummaryResponse | null,
  userStatusRaw: RawUserStatusResponse | null,
  latencyMs: number,
): QuotaSnapshot {
  const now = new Date();

  if (!quotaRaw?.response?.groups || quotaRaw.response.groups.length === 0) {
    return {
      timestamp: now,
      isConnected: false,
      groups: [],
      models: [],
      errorMessage: 'Sin datos de cuota del servidor',
      latencyMs,
    };
  }

  // 1. Procesar grupos y buckets desde RetrieveUserQuotaSummary
  const groups: QuotaGroup[] = [];
  for (const rawGroup of quotaRaw.response.groups) {
    const displayName = rawGroup.displayName || 'Unknown Pool';
    const buckets: QuotaBucket[] = [];

    for (const rawBucket of rawGroup.buckets || []) {
      const fraction = clampFraction(rawBucket.remainingFraction);
      const percent = Math.round(fraction * 100);
      const resetTime = parseResetTime(rawBucket.resetTime);
      const countdown = formatCountdown(rawBucket.description, resetTime);

      buckets.push({
        window: rawBucket.window || 'unknown',
        remainingFraction: fraction,
        remainingPercent: percent,
        description: rawBucket.description || '',
        resetTime,
        resetCountdown: countdown,
      });
    }

    const lowestPercent =
      buckets.length > 0 ? Math.min(...buckets.map((b) => b.remainingPercent)) : 0;

    groups.push({
      groupId: slugify(displayName),
      displayName,
      buckets,
      lowestPercent,
    });
  }

  // 2. Procesar modelos individuales desde GetUserStatus
  const models: ModelInfo[] = [];
  const configs = userStatusRaw?.userStatus?.cascadeModelConfigData?.clientModelConfigs;

  if (configs && Array.isArray(configs)) {
    for (const cfg of configs) {
      const label = cfg.label || '';
      if (!label) continue;

      const modelId = cfg.modelOrAlias?.model || label;
      const poolName = inferPoolName(label);
      const matchingGroup = groups.find((g) =>
        g.displayName.toLowerCase().includes(poolName.toLowerCase()) ||
        poolName.toLowerCase().includes(g.displayName.toLowerCase()),
      );

      // Si el modelo no trae remainingFraction directo (p.ej. cuota agotada o delegada al pool),
      // hereda la fracción más restrictiva de su pool.
      let fraction: number | null = null;
      if (cfg.quotaInfo?.remainingFraction !== undefined && cfg.quotaInfo.remainingFraction !== null) {
        fraction = clampFraction(cfg.quotaInfo.remainingFraction);
      } else if (matchingGroup) {
        fraction = clampFraction(matchingGroup.lowestPercent / 100);
      }

      const resetTime = parseResetTime(cfg.quotaInfo?.resetTime) || matchingGroup?.buckets[0]?.resetTime || null;
      const remainingPercent = fraction !== null ? Math.round(fraction * 100) : null;
      const countdown = formatCountdown(undefined, resetTime);

      models.push({
        label,
        modelId,
        remainingFraction: fraction,
        remainingPercent,
        resetTime,
        resetCountdown: countdown,
        isExhausted: remainingPercent !== null && remainingPercent <= 0,
        poolName: matchingGroup ? matchingGroup.displayName : poolName,
      });
    }
  }

  // 3. Fallback: si no hay clientModelConfigs en GetUserStatus, generar a partir de los grupos
  if (models.length === 0 && groups.length > 0) {
    for (const group of groups) {
      const bucket = group.buckets.find((b) => b.window === '5h') || group.buckets[0];
      if (bucket) {
        models.push({
          label: group.displayName,
          modelId: group.groupId,
          remainingFraction: bucket.remainingFraction,
          remainingPercent: bucket.remainingPercent,
          resetTime: bucket.resetTime,
          resetCountdown: bucket.resetCountdown,
          isExhausted: bucket.remainingPercent <= 0,
          poolName: group.displayName,
        });
      }
    }
  }

  return {
    timestamp: now,
    isConnected: true,
    groups,
    models,
    latencyMs,
  };
}

/**
 * Acota una fracción al rango [0, 1].
 */
export function clampFraction(val: number | undefined | null): number {
  if (val === undefined || val === null || !Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1, val));
}

/**
 * Parsea una cadena ISO de tiempo; retorna null si es inválida.
 */
export function parseResetTime(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula un texto de tiempo restante legible.
 */
export function formatCountdown(description?: string, resetTime?: Date | null): string {
  if (description) {
    const match = description.match(/refresh in\s+([^.]+)/i);
    if (match) {
      return match[1].trim();
    }
  }

  if (resetTime) {
    const diffMs = resetTime.getTime() - Date.now();
    if (diffMs <= 0) return '0m';

    const totalMins = Math.round(diffMs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 && days === 0) parts.push(`${mins}m`);
    return parts.length > 0 ? parts.join(' ') : '<1m';
  }

  return '';
}

/**
 * Infiere el pool principal al que pertenece un modelo.
 */
export function inferPoolName(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('gemini') || lower.includes('argon')) {
    return 'Gemini Models';
  }
  if (
    lower.includes('claude') ||
    lower.includes('gpt') ||
    lower.includes('sonnet') ||
    lower.includes('opus')
  ) {
    return 'Claude and GPT models';
  }
  return 'General Models';
}

/**
 * Genera un slug identificador a partir de un nombre.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Evalúa el nivel de estado de cuota según los umbrales configurados.
 */
export function getQuotaLevel(
  percent: number | null,
  warningThreshold: number,
  criticalThreshold: number,
): QuotaLevel {
  if (percent === null || percent <= 0) {
    return QuotaLevel.Depleted;
  }
  if (percent <= criticalThreshold) {
    return QuotaLevel.Critical;
  }
  if (percent <= warningThreshold) {
    return QuotaLevel.Warning;
  }
  return QuotaLevel.Normal;
}
