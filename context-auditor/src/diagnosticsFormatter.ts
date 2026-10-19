/**
 * Context Auditor — Formateador de Diagnóstico (Hito 8)
 *
 * Función pura que estructura el informe de diagnóstico para el OutputChannel
 * de VS Code/Antigravity, asegurando sanitización de rutas y ausencia total de prompts.
 */

import type { HealthEvaluatorConfig } from './healthEvaluator';
import type { SessionInfo } from './sessionWatcher';
import type { HealthAssessment, InferenceStep, SchemaGuardResult } from './types';

export interface DiagnosticsData {
  readonly nodeVersion: string;
  readonly electronVersion?: string;
  readonly schemaGuard: SchemaGuardResult;
  readonly activeSession: SessionInfo | null;
  readonly selectionMethod: 'pinned' | 'mtime_auto' | 'none';
  readonly stepsRead: number;
  readonly stepsLimit: number;
  readonly lastInference: InferenceStep | null;
  readonly health: HealthAssessment | null;
  readonly detectedFamily: 'gemini' | 'claude' | 'unknown';
  readonly detectionMethod: string;
  readonly config: HealthEvaluatorConfig & { stepsLimit: number };
}

export function formatDiagnostics(data: DiagnosticsData): string {
  const lines: string[] = [];

  lines.push('======================================================================');
  lines.push(' CONTEXT AUDITOR — INFORME DE DIAGNÓSTICO DEL SISTEMA');
  lines.push('======================================================================');
  lines.push('');

  // 1. Entorno del Extension Host
  lines.push('--- 1. ENTORNO DEL EXTENSION HOST ---');
  lines.push(`Node.js:   ${data.nodeVersion}`);
  lines.push(`Electron:  ${data.electronVersion || 'N/A (Proceso Node puro)'}`);
  lines.push('');

  // 2. Schema Guard
  lines.push('--- 2. ESTADO DEL SCHEMA GUARD ---');
  if (data.schemaGuard.ok) {
    lines.push('Estado:    ACTIVO (Esquema SQLite compatible)');
    lines.push('Columnas:  idx, step_type, metadata verificadas');
  } else {
    lines.push('Estado:    INACTIVO (Versión de base de datos no compatible)');
    lines.push(`Detalle:   ${data.schemaGuard.statusMessage}`);
  }
  lines.push('');

  // 3. Sesión Activa
  lines.push('--- 3. SESIÓN ACTIVA ---');
  if (data.activeSession) {
    const rawId = data.activeSession.id;
    const truncatedId = rawId.length > 6 ? `${rawId.slice(0, 6)}...` : rawId;
    let methodDesc = 'Desconocido';
    if (data.selectionMethod === 'pinned') {
      methodDesc = 'Fijada manualmente por el usuario (pinned en workspaceState)';
    } else if (data.selectionMethod === 'mtime_auto') {
      methodDesc = 'Selección automática por fecha de modificación más reciente (.db / .db-wal)';
    }

    lines.push(`ID de sesión:       ${truncatedId}`);
    lines.push(`Método de elección: ${methodDesc}`);
    lines.push(`Pasos analizados:   ${data.stepsRead} (Límite configurado: ${data.stepsLimit})`);
  } else {
    lines.push('ID de sesión:       [Ninguna sesión activa]');
    lines.push('Método de elección: Sin bases de datos disponibles');
  }
  lines.push('');

  // 4. Último Paso de Inferencia
  lines.push('--- 4. RADIOGRAFÍA DEL ÚLTIMO PASO DE INFERENCIA ---');
  if (data.lastInference) {
    const u = data.lastInference.usage;
    lines.push(`Índice de paso:     #${data.lastInference.idx}`);
    lines.push(`Tokens de entrada:  ${u.input.toLocaleString()} tokens`);
    lines.push(`Tokens de caché:    ${u.cacheRead.toLocaleString()} tokens`);
    lines.push(`Tokens pensamiento: ${u.thoughts.toLocaleString()} tokens`);
    lines.push(`Tokens de salida:   ${u.output.toLocaleString()} tokens`);
    if (data.health) {
      lines.push(`Tokens frescos:     ${data.health.freshTokens.toLocaleString()} tokens (T_frescos con k_cache=${data.config.kCache.toFixed(2)})`);
      lines.push(`Estado Semáforo:    ${data.health.trafficLight}${data.health.trafficLightBasis ? ` [${data.health.trafficLightBasis}]` : ''}`);
      lines.push(`Insignia Ventana:   ${data.health.badge} (${data.health.occupancyPercent}% de ${data.health.windowLimit.toLocaleString()} tokens)${data.health.badgeBasis ? ` [${data.health.badgeBasis}]` : ''}`);
    }
    if (data.lastInference.latencyMs !== null && data.lastInference.latencyMs !== undefined) {
      lines.push(`Latencia observada: ${(data.lastInference.latencyMs / 1000).toFixed(2)} s`);
    }
  } else {
    lines.push('No se han registrado pasos de inferencia en la ventana de consulta.');
  }
  lines.push('');

  // 5. Modelo y Familia
  lines.push('--- 5. MODELO Y FAMILIA DETECTADA ---');
  let familyLabel: string;
  if (data.detectedFamily === 'unknown') {
    const idStr = data.lastInference?.modelId ? ` (ID: ${data.lastInference.modelId})` : '';
    familyLabel = `MODELO DESCONOCIDO${idStr} [Ventana de seguridad: ${data.config.windowClaude.toLocaleString()} tokens]`;
  } else {
    familyLabel = data.detectedFamily.toUpperCase();
  }
  lines.push(`Familia detectada:  ${familyLabel}`);
  lines.push(`Método detección:   ${data.detectionMethod}`);
  const modelDisplayName = data.health?.modelDisplayName
    ?? (data.lastInference?.modelId ? `modelo desconocido (ID: ${data.lastInference.modelId})` : (data.lastInference?.modelName ?? data.lastInference?.modelSlug));
  if (modelDisplayName) {
    lines.push(`Identificador LLM:  ${modelDisplayName}`);
  }
  lines.push('');

  // 6. Configuración Vigente
  lines.push('--- 6. VALORES DE CONFIGURACIÓN VIGENTES ---');
  lines.push(`thresholdProfile:       ${data.config.thresholdProfile ?? 'observed'}`);
  lines.push(`kCache:                 ${data.config.kCache} (Ponderación de caché)`);
  lines.push(`modelFamily:            ${data.config.modelFamily}`);
  lines.push(`windowGemini:           ${data.config.windowGemini.toLocaleString()} tokens`);
  lines.push(`windowClaude:           ${data.config.windowClaude.toLocaleString()} tokens`);
  lines.push(`thresholdGeminiYellow:  ${data.config.thresholdGeminiYellow.toLocaleString()} tokens [PROVISIONAL — a calibrar]`);
  lines.push(`thresholdGeminiRed:     ${data.config.thresholdGeminiRed.toLocaleString()} tokens [PROVISIONAL — a calibrar]`);
  lines.push(`thresholdClaudeYellow:  ${data.config.thresholdClaudeYellow.toLocaleString()} tokens [PROVISIONAL — a calibrar]`);
  lines.push(`thresholdClaudeRed:     ${data.config.thresholdClaudeRed.toLocaleString()} tokens [PROVISIONAL — a calibrar]`);
  lines.push(`stepsLimit:             ${data.config.stepsLimit} pasos`);
  lines.push(`criterioLatencia:       DESACTIVADO (No confiable empíricamente)`);
  lines.push('');

  lines.push('======================================================================');
  lines.push(' Fin del diagnóstico. Sin contenido privado ni rutas personales.');
  lines.push('======================================================================');

  return lines.join('\n');
}
