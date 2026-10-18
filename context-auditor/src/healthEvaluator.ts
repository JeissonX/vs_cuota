/**
 * Context Auditor — Evaluador de Salud del Contexto (Semáforo e Insignia)
 *
 * Funciones 100% puras y deterministas para evaluar la salud de la sesión
 * según tokens frescos, ocupación de ventana y criterios configurables.
 */

import type { ContextBadgeState, HealthAssessment, TokenUsage, TrafficLightState } from './types';

export interface HealthEvaluatorConfig {
  readonly kCache: number;
  readonly modelFamily: 'auto' | 'gemini' | 'claude';
  readonly windowGemini: number;
  readonly windowClaude: number;
  readonly thresholdGeminiYellow: number;
  readonly thresholdGeminiRed: number;
  readonly thresholdClaudeYellow: number;
  readonly thresholdClaudeRed: number;
  readonly enableLatencyCriterion?: boolean;
  readonly alphaLatency?: number; // ms por token de salida
  readonly betaLatency?: number; // ms por token de pensamiento
}

export const DEFAULT_HEALTH_CONFIG: HealthEvaluatorConfig = {
  kCache: 0.10,
  modelFamily: 'auto',
  windowGemini: 1000000,
  windowClaude: 200000,
  thresholdGeminiYellow: 50000,
  thresholdGeminiRed: 120000,
  thresholdClaudeYellow: 20000,
  thresholdClaudeRed: 45000,
  enableLatencyCriterion: false,
  alphaLatency: undefined,
  betaLatency: undefined,
};

/**
 * T_frescos = Input - CacheRead + (k_cache * CacheRead)
 */
export function calculateFreshTokens(input: number, cacheRead: number, kCache = 0.10): number {
  const safeK = Math.min(1, Math.max(0, kCache));
  const safeInput = Math.max(0, input);
  const safeCache = Math.min(safeInput, Math.max(0, cacheRead));
  const fresh = (safeInput - safeCache) + (safeK * safeCache);
  return Math.round(fresh);
}

/**
 * Calibración de k = b / a con guardas matemáticas:
 * - si a <= 1e-9 -> usa 0.10
 * - recorta resultado a [0, 1]
 * - solo sustituye si es confiable (n >= 30, R2 >= 0.6, a > 0)
 */
export function calibrateKCache(
  a: number,
  b: number,
  n: number,
  r2: number,
  fallback = 0.10
): { k: number; isReliable: boolean } {
  if (a <= 1e-9 || a <= 0) {
    return { k: fallback, isReliable: false };
  }

  const rawK = b / a;
  const clampedK = Math.min(1, Math.max(0, rawK));
  const isReliable = n >= 30 && r2 >= 0.6 && a > 0;

  return {
    k: isReliable ? clampedK : fallback,
    isReliable,
  };
}

/**
 * Resuelve la familia de modelo efectiva para umbrales y tamaño de ventana
 */
export function resolveModelFamily(
  familyConfig: 'auto' | 'gemini' | 'claude',
  modelIdentifier?: string
): 'gemini' | 'claude' {
  if (familyConfig === 'gemini') return 'gemini';
  if (familyConfig === 'claude') return 'claude';

  if (!modelIdentifier) return 'claude'; // Modelo desconocido usa Claude por especificación

  const lower = modelIdentifier.toLowerCase();
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('claude')) return 'claude';

  return 'claude';
}

/**
 * Evalúa el semáforo en este orden estricto, sin huecos:
 * 1. ROJO si T_frescos >= Θrojo
 * 2. AMARILLO si T_frescos >= Θamarillo
 * 3. VERDE en otro caso
 */
export function evaluateTrafficLight(
  freshTokens: number,
  thetaYellow: number,
  thetaRed: number
): TrafficLightState {
  if (freshTokens >= thetaRed) return 'RED';
  if (freshTokens >= thetaYellow) return 'YELLOW';
  return 'GREEN';
}

/**
 * Evalúa la insignia de ocupación de ventana (independiente del caché):
 * - CRITICO si ratio > 0.50 (50%)
 * - DENSO si ratio > 0.25 (25%)
 * - NORMAL en otro caso
 */
export function evaluateContextBadge(input: number, windowLimit: number): ContextBadgeState {
  if (windowLimit <= 0) return 'NORMAL';
  const ratio = input / windowLimit;
  if (ratio > 0.50) return 'CRITICO';
  if (ratio > 0.25) return 'DENSO';
  return 'NORMAL';
}

/**
 * Criterio por latencia: Δt_input = latencia total - (α * output + β * thoughts)
 * Desactivado por defecto mientras α y β no estén medidos.
 */
export function calculateInputLatency(
  totalLatencyMs: number | null | undefined,
  outputTokens: number,
  thoughtTokens: number,
  alpha?: number,
  beta?: number
): number | null {
  if (totalLatencyMs === null || totalLatencyMs === undefined || totalLatencyMs < 0) return null;
  if (alpha === undefined || beta === undefined) return null;

  const estimatedOutputTime = (alpha * outputTokens) + (beta * thoughtTokens);
  const deltaTInput = totalLatencyMs - estimatedOutputTime;
  return Math.max(0, Math.round(deltaTInput));
}

/**
 * Evaluación completa e integrada de salud de contexto
 */
export function assessContextHealth(
  usage: TokenUsage,
  modelIdentifier?: string,
  totalLatencyMs?: number | null,
  config: HealthEvaluatorConfig = DEFAULT_HEALTH_CONFIG
): HealthAssessment {
  const family = resolveModelFamily(config.modelFamily, modelIdentifier);
  const windowLimit = family === 'gemini' ? config.windowGemini : config.windowClaude;
  const thetaYellow = family === 'gemini' ? config.thresholdGeminiYellow : config.thresholdClaudeYellow;
  const thetaRed = family === 'gemini' ? config.thresholdGeminiRed : config.thresholdClaudeRed;

  const freshTokens = calculateFreshTokens(usage.input, usage.cacheRead, config.kCache);
  const trafficLight = evaluateTrafficLight(freshTokens, thetaYellow, thetaRed);
  const badge = evaluateContextBadge(usage.input, windowLimit);
  const occupancyPercent = windowLimit > 0 ? Number(((usage.input / windowLimit) * 100).toFixed(1)) : 0;

  let latencyInputMs: number | null = null;
  if (config.enableLatencyCriterion && config.alphaLatency !== undefined && config.betaLatency !== undefined) {
    latencyInputMs = calculateInputLatency(
      totalLatencyMs,
      usage.output,
      usage.thoughts,
      config.alphaLatency,
      config.betaLatency
    );
  }

  return {
    freshTokens,
    trafficLight,
    badge,
    occupancyPercent,
    windowLimit,
    latencyInputMs,
  };
}
