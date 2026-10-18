import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFreshTokens,
  calibrateKCache,
  evaluateTrafficLight,
  evaluateContextBadge,
  calculateInputLatency,
  assessContextHealth,
  resolveModelFamily,
  DEFAULT_HEALTH_CONFIG,
} from '../src/healthEvaluator';

test('calculateFreshTokens: cálculo exacto con kCache', () => {
  // Input 100k, Cache 80k, k = 0.10 -> 20k + (0.10 * 80k) = 28k
  const fresh = calculateFreshTokens(100000, 80000, 0.10);
  assert.equal(fresh, 28000);

  // Sin caché -> fresh == input
  assert.equal(calculateFreshTokens(50000, 0, 0.10), 50000);

  // Todo caché -> fresh == 0.10 * input
  assert.equal(calculateFreshTokens(50000, 50000, 0.10), 5000);
});

test('calibrateKCache: guardas matemáticas inviolables', () => {
  // Guarda 1: si a <= 1e-9 -> fallback 0.10
  const g1 = calibrateKCache(1e-10, 0.05, 50, 0.9);
  assert.equal(g1.k, 0.10);
  assert.equal(g1.isReliable, false);

  // Guarda 2: recorte a [0, 1] si b/a excede 1
  const g2 = calibrateKCache(10, 25, 40, 0.85); // 25/10 = 2.5 -> recorta a 1.0
  assert.equal(g2.k, 1.0);
  assert.equal(g2.isReliable, true);

  // Guarda 3: solo sustituye si n >= 30 y R2 >= 0.6
  const g3 = calibrateKCache(10, 2, 25, 0.95); // n=25 (< 30) -> no confiable
  assert.equal(g3.k, 0.10);
  assert.equal(g3.isReliable, false);

  const g4 = calibrateKCache(10, 2, 40, 0.55); // R2=0.55 (< 0.6) -> no confiable
  assert.equal(g4.k, 0.10);
  assert.equal(g4.isReliable, false);

  // Ajuste confiable
  const g5 = calibrateKCache(10, 2, 50, 0.85); // 2/10 = 0.20
  assert.equal(g5.k, 0.20);
  assert.equal(g5.isReliable, true);
});

test('Barrido de Semáforo: existencia de exactamente un estado sin huecos', () => {
  const thetaYellow = 50000;
  const thetaRed = 120000;
  const validStates = new Set(['GREEN', 'YELLOW', 'RED']);

  // Barrido de 0 a 150.000 tokens en pasos de 2.500
  for (let t = 0; t <= 150000; t += 2500) {
    const state = evaluateTrafficLight(t, thetaYellow, thetaRed);
    assert.ok(validStates.has(state), `Estado ${state} no es válido para ${t}`);
  }

  // Pruebas de borde exactas
  assert.equal(evaluateTrafficLight(thetaYellow - 1, thetaYellow, thetaRed), 'GREEN');
  assert.equal(evaluateTrafficLight(thetaYellow, thetaYellow, thetaRed), 'YELLOW');
  assert.equal(evaluateTrafficLight(thetaYellow + 1, thetaYellow, thetaRed), 'YELLOW');

  assert.equal(evaluateTrafficLight(thetaRed - 1, thetaYellow, thetaRed), 'YELLOW');
  assert.equal(evaluateTrafficLight(thetaRed, thetaYellow, thetaRed), 'RED');
  assert.equal(evaluateTrafficLight(thetaRed + 1, thetaYellow, thetaRed), 'RED');
});

test('Insignia de Contexto: evaluación por ocupación de ventana', () => {
  const windowLimit = 1000000;

  // Normal: <= 25%
  assert.equal(evaluateContextBadge(200000, windowLimit), 'NORMAL');
  assert.equal(evaluateContextBadge(250000, windowLimit), 'NORMAL'); // 25% exacto

  // Denso: > 25% y <= 50%
  assert.equal(evaluateContextBadge(250001, windowLimit), 'DENSO');
  assert.equal(evaluateContextBadge(500000, windowLimit), 'DENSO'); // 50% exacto

  // Crítico: > 50%
  assert.equal(evaluateContextBadge(500001, windowLimit), 'CRITICO');
  assert.equal(evaluateContextBadge(900000, windowLimit), 'CRITICO');
});

test('Resolución de familia de modelo y umbrales correspondientes', () => {
  assert.equal(resolveModelFamily('auto', 'gemini-3.8-flash'), 'gemini');
  assert.equal(resolveModelFamily('auto', 'claude-3-5-sonnet'), 'claude');
  // Desconocido usa Claude por especificación
  assert.equal(resolveModelFamily('auto', 'custom-local-model'), 'claude');
  assert.equal(resolveModelFamily('auto', undefined), 'claude');
});

test('Criterio de latencia: desactivado por defecto', () => {
  const usage = { input: 30000, inputNoCache: 25000, cacheRead: 5000, output: 500, thoughts: 1000 };
  const assessment = assessContextHealth(usage, 'gemini-3.8-flash', 4500, DEFAULT_HEALTH_CONFIG);

  assert.equal(assessment.latencyInputMs, null);
  assert.equal(assessment.trafficLight, 'GREEN'); // 25000 + (0.10 * 5000) = 25500 < 50000
});

test('Criterio de latencia: cálculo cuando se activa con coeficientes', () => {
  const config = {
    ...DEFAULT_HEALTH_CONFIG,
    enableLatencyCriterion: true,
    alphaLatency: 2.0, // 2 ms por token de salida
    betaLatency: 1.0,  // 1 ms por token de pensamiento
  };

  const usage = { input: 30000, inputNoCache: 25000, cacheRead: 5000, output: 500, thoughts: 1000 };
  // Latencia total 3000 ms. Salida: 500*2 = 1000ms. Pensamientos: 1000*1 = 1000ms.
  // delta_t = 3000 - 2000 = 1000 ms
  const assessment = assessContextHealth(usage, 'gemini-3.8-flash', 3000, config);
  assert.equal(assessment.latencyInputMs, 1000);
});
