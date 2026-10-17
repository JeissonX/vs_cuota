import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CalibrationManager } from '../src/phase2/calibrationManager';
import type { RawQuotaSummaryResponse, StepUsage } from '../src/types';

describe('HITO F: CalibrationManager y Proyecciones de Agotamiento (v1.2.0)', () => {
  const mockQuotaRaw1: RawQuotaSummaryResponse = {
    response: {
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            {
              window: '5h',
              remainingFraction: 0.95,
              resetTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
            },
          ],
        },
        {
          displayName: 'Claude and GPT models',
          buckets: [
            {
              window: '5h',
              remainingFraction: 0.8,
              resetTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
            },
          ],
        },
      ],
    },
  };

  const mockQuotaRaw2: RawQuotaSummaryResponse = {
    response: {
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            {
              window: '5h',
              remainingFraction: 0.90, // Cayó 5% en 30 minutos (10% por hora)
              resetTime: new Date(Date.now() + 3.5 * 3600 * 1000).toISOString(),
            },
          ],
        },
      ],
    },
  };

  test('proyección de Burn Rate calcula agotamiento sostenible o anticipado', () => {
    const cm = new CalibrationManager();
    const t0 = Date.now() - 30 * 60 * 1000;
    const t1 = Date.now();

    cm.recordQuotaRaw(mockQuotaRaw1, t0);
    cm.recordQuotaRaw(mockQuotaRaw2, t1);

    // Quedan 90%. Ritmo de caída: 5% en 0.5h = 10% por hora.
    // Horas para agotar: 90 / 10 = 9 horas.
    // Reset en 3.5 horas.
    // Como 9h > 3.5h, llega al reset sin agotar.
    const proj = cm.getBurnRateProjection(
      'gemini',
      '5h',
      0.90,
      new Date(Date.now() + 3.5 * 3600 * 1000),
    );

    assert.ok(proj.burnRatePctPerHour > 0);
    assert.strictEqual(proj.willDepleteBeforeReset, false);
    assert.ok(proj.statusText.includes('Llega al reset'));

    // Si queda solo 10% con el mismo ritmo (10% por hora):
    // Agotaría en 1 hora, y el reset es en 3.5 horas -> agota antes del reset
    const projFast = cm.getBurnRateProjection(
      'gemini',
      '5h',
      0.10,
      new Date(Date.now() + 3.5 * 3600 * 1000),
    );
    assert.strictEqual(projFast.willDepleteBeforeReset, true);
    assert.ok(projFast.badgeText.includes('Agotamiento'));
  });

  test('getCalibrationStatus reporta progreso discreto mientras n < 30', () => {
    const cm = new CalibrationManager();
    const status = cm.getCalibrationStatus('gemini', '5h');

    assert.strictEqual(status.isTrustworthy, false);
    assert.ok(status.progressText.includes('Calibrando pesos de cuota: 0/30'));
  });

  test('recordStepUsages acumula pasos únicos sin duplicados', () => {
    const cm = new CalibrationManager();
    const step: StepUsage = {
      id: 1,
      conversationId: 'conv_1',
      ts: 1000,
      usage: { input: 100, inputNoCache: 80, cacheRead: 20, output: 50, thoughts: 10 },
    };

    cm.recordStepUsages([step, step]);
    cm.recalculate();

    const status = cm.getCalibrationStatus('gemini', '5h');
    assert.strictEqual(status.isTrustworthy, false);
  });
});
