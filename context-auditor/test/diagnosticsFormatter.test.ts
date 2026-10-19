/**
 * Tests unitarios para el formateador de diagnóstico (Hito 8)
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatDiagnostics, type DiagnosticsData } from '../src/diagnosticsFormatter';
import { DEFAULT_HEALTH_CONFIG } from '../src/healthEvaluator';

test('formatDiagnostics: formatea correctamente un diagnóstico completo con sesión activa', () => {
  const sampleData: DiagnosticsData = {
    nodeVersion: 'v22.13.0',
    electronVersion: '32.1.0',
    schemaGuard: { ok: true },
    activeSession: {
      id: '6142bf39-6e83-4af7-af31-5fb392aadac6',
      dbPath: 'C:\\Users\\MockUser\\.gemini\\antigravity-ide\\conversations\\6142bf39.db',
      lastModifiedMs: 1792282399000,
      walSize: 0,
      isPinned: true,
    },
    selectionMethod: 'pinned',
    stepsRead: 45,
    stepsLimit: 200,
    lastInference: {
      idx: 42,
      stepType: 15,
      usage: {
        input: 105436,
        cacheRead: 24,
        thoughts: 2788,
        output: 146,
        inputNoCache: 105412,
      },
      modelId: 1318,
      modelSlug: 'gemini-3.8-flash-n',
      modelName: 'Gemini 3.8 Flash (High)',
      latencyMs: 4830,
    },
    health: {
      freshTokens: 105414,
      trafficLight: 'YELLOW',
      badge: 'NORMAL',
      occupancyPercent: 10.5,
      windowLimit: 1000000,
      latencyInputMs: null,
    },
    detectedFamily: 'gemini',
    detectionMethod: 'Campo protobuf steps.metadata.9.1 (ID: 1318) conciliado con gen_metadata',
    config: {
      ...DEFAULT_HEALTH_CONFIG,
      stepsLimit: 200,
    },
  };

  const output = formatDiagnostics(sampleData);

  // Verificaciones requeridas
  assert.match(output, /Node\.js:\s+v22\.13\.0/);
  assert.match(output, /Electron:\s+32\.1\.0/);
  assert.match(output, /ACTIVO \(Esquema SQLite compatible\)/);
  // Truncado de sesión a 6 caracteres
  assert.match(output, /6142bf\.\.\./);
  assert.doesNotMatch(output, /6142bf39-6e83-4af7-af31-5fb392aadac6/);
  assert.match(output, /pinned en workspaceState/);
  assert.match(output, /Pasos analizados:\s+45/);
  assert.match(output, /105[.,]436 tokens/);
  assert.match(output, /24 tokens/);
  assert.match(output, /2[.,]?788 tokens/);
  assert.match(output, /146 tokens/);
  assert.match(output, /105[.,]414 tokens/);
  assert.match(output, /Estado Semáforo:\s+YELLOW/);
  assert.match(output, /Insignia Ventana:\s+NORMAL/);
  assert.match(output, /GEMINI/);
  assert.match(output, /steps\.metadata\.9\.1/);
  // Valores provisionales marcados
  assert.match(output, /thresholdGeminiYellow:\s+50\.000 tokens \[PROVISIONAL — a calibrar\]/);
  assert.match(output, /thresholdGeminiRed:\s+120\.000 tokens \[PROVISIONAL — a calibrar\]/);
  assert.match(output, /thresholdClaudeYellow:\s+20\.000 tokens \[PROVISIONAL — a calibrar\]/);
  assert.match(output, /thresholdClaudeRed:\s+45\.000 tokens \[PROVISIONAL — a calibrar\]/);
  assert.match(output, /criterioLatencia:\s+DESACTIVADO/);

  // Privacidad S3: sin rutas de usuario ni contenido privado
  assert.doesNotMatch(output, /C:\\Users\\MockUser/);
  assert.doesNotMatch(output, /userPrompt|rawPrompt|User prompt/i);
});

test('formatDiagnostics: degrada graciosamente cuando no hay sesión activa ni inferencia', () => {
  const emptyData: DiagnosticsData = {
    nodeVersion: 'v22.13.0',
    electronVersion: undefined,
    schemaGuard: {
      ok: false,
      statusMessage: 'Auditor inactivo: versión de base de datos no compatible',
      missingColumns: ['metadata'],
    },
    activeSession: null,
    selectionMethod: 'none',
    stepsRead: 0,
    stepsLimit: 200,
    lastInference: null,
    health: null,
    detectedFamily: 'unknown',
    detectionMethod: 'Sin sesión activa (fallback por defecto)',
    config: {
      ...DEFAULT_HEALTH_CONFIG,
      stepsLimit: 200,
    },
  };

  const output = formatDiagnostics(emptyData);

  assert.match(output, /Electron:\s+N\/A/);
  assert.match(output, /INACTIVO/);
  assert.match(output, /\[Ninguna sesión activa\]/);
  assert.match(output, /No se han registrado pasos de inferencia/);
  assert.match(output, /DESCONOCIDO/);
});
