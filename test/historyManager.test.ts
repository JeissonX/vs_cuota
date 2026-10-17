import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { QuotaHistoryManager, type StorageMemento } from '../src/historyManager';
import type { QuotaSnapshot } from '../src/types';

describe('HITO D: QuotaHistoryManager y Generador de Sparklines SVG', () => {
  function createMockStorage(): StorageMemento {
    const store = new Map<string, unknown>();
    return {
      get<T>(key: string, defaultValue?: T): T {
        return (store.has(key) ? store.get(key) : defaultValue) as T;
      },
      update(key: string, value: unknown) {
        store.set(key, value);
      },
    };
  }

  const mockSnapshot: QuotaSnapshot = {
    timestamp: new Date(),
    isConnected: true,
    groups: [
      {
        groupId: 'claude',
        displayName: 'Claude',
        lowestPercent: 49,
        buckets: [
          {
            window: '5h',
            remainingFraction: 0,
            remainingPercent: 0,
            description: '5h limit',
            resetTime: new Date(Date.now() + 3600000),
            resetCountdown: '1h 00m',
          },
          {
            window: 'weekly',
            remainingFraction: 0.49,
            remainingPercent: 49,
            description: 'weekly limit',
            resetTime: new Date(Date.now() + 86400000),
            resetCountdown: '1d 00m',
          },
        ],
      },
      {
        groupId: 'gemini',
        displayName: 'Gemini',
        lowestPercent: 94,
        buckets: [
          {
            window: '5h',
            remainingFraction: 0.96,
            remainingPercent: 96,
            description: '5h limit',
            resetTime: new Date(Date.now() + 3600000),
            resetCountdown: '3h 58m',
          },
          {
            window: 'weekly',
            remainingFraction: 0.94,
            remainingPercent: 94,
            description: 'weekly limit',
            resetTime: new Date(Date.now() + 86400000),
            resetCountdown: '6d 22m',
          },
        ],
      },
    ],
    models: [],
  };

  test('registra puntos en el historial y respeta el intervalo de 5 minutos', () => {
    const storage = createMockStorage();
    const manager = new QuotaHistoryManager(storage);

    manager.recordSnapshot(mockSnapshot);
    const history1 = manager.getHistory();
    assert.strictEqual(history1.length, 4, 'Debe haber 4 puntos (2 pools x 2 ventanas)');

    // Inmediatamente después no debería duplicar porque no pasaron 5 min
    manager.recordSnapshot(mockSnapshot);
    const history2 = manager.getHistory();
    assert.strictEqual(history2.length, 4, 'No debe registrar de nuevo antes de 5 min');
  });

  test('genera SVG de sparkline cuando hay suficientes puntos', () => {
    const storage = createMockStorage();
    const manager = new QuotaHistoryManager(storage);

    const now = Date.now();
    const mockHistory = [
      { t: now - 3600000, p: 'Claude', w: '5h', pct: 60 },
      { t: now - 1800000, p: 'Claude', w: '5h', pct: 30 },
      { t: now, p: 'Claude', w: '5h', pct: 0 },
    ];
    storage.update('agPro.quotaHistory', mockHistory);

    const svg = manager.generateSparklineSvg('Claude', '5h', 140, 32);
    assert.ok(svg.includes('<svg'), 'Debe generar un elemento SVG');
    assert.ok(svg.includes('<polyline'), 'Debe incluir polyline con los puntos');
    assert.ok(svg.includes('#ef4444'), 'Debe usar color crítico rojo si pct <= 20');
  });

  test('genera SVG placeholder cuando hay menos de 2 puntos', () => {
    const storage = createMockStorage();
    const manager = new QuotaHistoryManager(storage);

    const svg = manager.generateSparklineSvg('Inexistente', '5h', 140, 32);
    assert.ok(svg.includes('<svg'), 'Debe generar un SVG');
    assert.ok(svg.includes('stroke-dasharray="2"'), 'Debe generar línea punteada de placeholder');
  });
});
