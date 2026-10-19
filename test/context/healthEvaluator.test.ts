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
  formatModelDisplayName,
  DEFAULT_HEALTH_CONFIG,
  OBSERVED_THRESHOLDS,
  PROVISIONAL_THRESHOLDS,
} from '../../src/context/healthEvaluator';

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
  // Desconocido retorna 'unknown' (no se clasifica en silencio como Claude)
  assert.equal(resolveModelFamily('auto', 'custom-local-model'), 'unknown');
  assert.equal(resolveModelFamily('auto', undefined), 'unknown');
});

test('Formateo de modelo desconocido con ID', () => {
  assert.equal(formatModelDisplayName(undefined, 9999), 'modelo desconocido (ID: 9999)');
  assert.equal(formatModelDisplayName('custom-llm', 5555), 'modelo desconocido (ID: 5555)');
  assert.equal(formatModelDisplayName('gemini-2.5-pro', 1318), 'gemini-2.5-pro');
  assert.equal(formatModelDisplayName('claude-3-5-sonnet', 1026), 'claude-3-5-sonnet');
  assert.equal(formatModelDisplayName(undefined, undefined), 'modelo desconocido');
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

test('Barrido sin huecos para ambos perfiles (observed y provisional)', () => {
  const validStates = new Set(['GREEN', 'YELLOW', 'RED']);
  const severity = { GREEN: 1, YELLOW: 2, RED: 3 };

  const testCases = [
    { profile: 'observed' as const, family: 'gemini' as const, yellow: OBSERVED_THRESHOLDS.gemini.yellow, red: OBSERVED_THRESHOLDS.gemini.red },
    { profile: 'observed' as const, family: 'claude' as const, yellow: OBSERVED_THRESHOLDS.claude.yellow, red: OBSERVED_THRESHOLDS.claude.red },
    { profile: 'provisional' as const, family: 'gemini' as const, yellow: PROVISIONAL_THRESHOLDS.gemini.yellow, red: PROVISIONAL_THRESHOLDS.gemini.red },
    { profile: 'provisional' as const, family: 'claude' as const, yellow: PROVISIONAL_THRESHOLDS.claude.yellow, red: PROVISIONAL_THRESHOLDS.claude.red },
  ];

  for (const tc of testCases) {
    let lastSev = 1;
    // Barrido continuo de 0 a 250.000 tokens en pasos de 1.000
    for (let t = 0; t <= 250000; t += 1000) {
      const state = evaluateTrafficLight(t, tc.yellow, tc.red);
      assert.ok(validStates.has(state), `Estado ${state} inválido en t=${t}`);
      const currentSev = severity[state];
      assert.ok(currentSev >= lastSev, `Violación de monotonicidad en t=${t}: paso de ${lastSev} a ${currentSev}`);
      lastSev = currentSev;
    }

    // Puntos de borde exactos
    assert.equal(evaluateTrafficLight(0, tc.yellow, tc.red), 'GREEN');
    assert.equal(evaluateTrafficLight(tc.yellow - 1, tc.yellow, tc.red), 'GREEN');
    assert.equal(evaluateTrafficLight(tc.yellow, tc.yellow, tc.red), 'YELLOW');
    assert.equal(evaluateTrafficLight(tc.yellow + 1, tc.yellow, tc.red), 'YELLOW');
    assert.equal(evaluateTrafficLight(tc.red - 1, tc.yellow, tc.red), 'YELLOW');
    assert.equal(evaluateTrafficLight(tc.red, tc.yellow, tc.red), 'RED');
    assert.equal(evaluateTrafficLight(tc.red + 1, tc.yellow, tc.red), 'RED');
  }
});

test('Evaluación de perfiles observed vs provisional y rotulado de bases', () => {
  const usageGeminiYellow = { input: 110000, inputNoCache: 110000, cacheRead: 0, output: 100, thoughts: 100 };

  // En perfil observed: Gemini 110k está entre 100k y 180k -> YELLOW
  const observedHealth = assessContextHealth(
    usageGeminiYellow,
    'gemini-3.8-flash',
    null,
    { ...DEFAULT_HEALTH_CONFIG, thresholdProfile: 'observed' }
  );
  assert.equal(observedHealth.trafficLight, 'YELLOW');
  assert.equal(observedHealth.trafficLightBasis, 'carga relativa a tu historial (p50/p80, 6 conversaciones, 2026-10-18)');
  assert.equal(observedHealth.badgeBasis, 'ocupación de la ventana del modelo');

  // En perfil provisional: Gemini 110k está entre 50k y 120k -> YELLOW; pero con 130k es RED
  const provisionalHealth = assessContextHealth(
    { input: 130000, inputNoCache: 130000, cacheRead: 0, output: 100, thoughts: 100 },
    'gemini-3.8-flash',
    null,
    { ...DEFAULT_HEALTH_CONFIG, thresholdProfile: 'provisional' }
  );
  assert.equal(provisionalHealth.trafficLight, 'RED'); // 130k > 120k en provisional
  assert.equal(provisionalHealth.trafficLightBasis, 'umbrales teóricos iniciales (provisional)');

  // En perfil observed, 130k para Gemini sigue siendo YELLOW (130k < 180k)
  const observed130k = assessContextHealth(
    { input: 130000, inputNoCache: 130000, cacheRead: 0, output: 100, thoughts: 100 },
    'gemini-3.8-flash',
    null,
    { ...DEFAULT_HEALTH_CONFIG, thresholdProfile: 'observed' }
  );
  assert.equal(observed130k.trafficLight, 'YELLOW');
});
