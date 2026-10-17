import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { formatStatusBarPoolsText } from '../src/statusBarFormatter';
import {
  getBindingBucket,
  get5hBucket,
  getWeeklyBucket,
  formatPoolShortName,
} from '../src/quotaParser';
import type { QuotaGroup, AgProConfig } from '../src/types';

describe('HITO A: Barra de Estado Completa y Ventana Limitante', () => {
  const sampleGroups: QuotaGroup[] = [
    {
      groupId: 'gemini-models',
      displayName: 'Gemini Models',
      lowestPercent: 94,
      buckets: [
        {
          window: '5h',
          remainingFraction: 0.96,
          remainingPercent: 96,
          description: '5h refresh',
          resetTime: new Date('2026-10-17T08:35:01Z'),
          resetCountdown: '3h 58m',
        },
        {
          window: 'weekly',
          remainingFraction: 0.94,
          remainingPercent: 94,
          description: 'weekly refresh',
          resetTime: new Date('2026-10-23T22:35:01Z'),
          resetCountdown: '6d 17h',
        },
      ],
    },
    {
      groupId: 'claude-and-gpt-models',
      displayName: 'Claude and GPT models',
      lowestPercent: 0,
      buckets: [
        {
          window: '5h',
          remainingFraction: 0,
          remainingPercent: 0,
          description: '5h refresh',
          resetTime: new Date('2026-10-17T09:17:43Z'),
          resetCountdown: '4h 40m',
        },
        {
          window: 'weekly',
          remainingFraction: 0.49,
          remainingPercent: 49,
          description: 'weekly refresh',
          resetTime: new Date('2026-10-24T04:17:43Z'),
          resetCountdown: '6d 23h',
        },
      ],
    },
  ];

  const baseConfig: AgProConfig = {
    refreshIntervalSeconds: 15,
    statusBarFormat: 'standard',
    statusBarShowWindows: 'both',
    statusBarPools: [],
    statusBarPoolView: 'all',
    warningThreshold: 30,
    criticalThreshold: 10,
    language: 'es',
    pinnedModels: [],
    notificationsEnabled: true,
    logLevel: 'info',
  };

  test('calcula correctamente la ventana limitante (binding bucket)', () => {
    const geminiBinding = getBindingBucket(sampleGroups[0]);
    assert.strictEqual(geminiBinding?.window, 'weekly');
    assert.strictEqual(geminiBinding?.remainingPercent, 94);

    const claudeBinding = getBindingBucket(sampleGroups[1]);
    assert.strictEqual(claudeBinding?.window, '5h');
    assert.strictEqual(claudeBinding?.remainingPercent, 0);
  });

  test('get5hBucket y getWeeklyBucket identifican las ventanas correctas', () => {
    assert.strictEqual(get5hBucket(sampleGroups[0])?.remainingPercent, 96);
    assert.strictEqual(getWeeklyBucket(sampleGroups[0])?.remainingPercent, 94);

    assert.strictEqual(get5hBucket(sampleGroups[1])?.remainingPercent, 0);
    assert.strictEqual(getWeeklyBucket(sampleGroups[1])?.remainingPercent, 49);
  });

  test('formato standard con showWindows: both muestra ambos pools con sus dos ventanas', () => {
    const text = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'standard',
      statusBarShowWindows: 'both',
    });
    assert.strictEqual(text, '🟢 Gemini 96%/94% · 🔴 Claude 0%/49%');
  });

  test('formato namePercent con showWindows: both coincide con el formato requerido', () => {
    const text = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'namePercent',
      statusBarShowWindows: 'both',
    });
    assert.strictEqual(text, 'Gemini 96%/94% · Claude 0%/49%');
  });

  test('formato con showWindows: binding muestra solo la ventana menor', () => {
    const text = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'namePercent',
      statusBarShowWindows: 'binding',
    });
    assert.strictEqual(text, 'Gemini 94% · Claude 0%');
  });

  test('formato compact, percent y dot funcionan con múltiples pools', () => {
    const compact = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'compact',
      statusBarShowWindows: 'both',
    });
    assert.strictEqual(compact, '🟢 96%/94% · 🔴 0%/49%');

    const percent = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'percent',
      statusBarShowWindows: 'both',
    });
    assert.strictEqual(percent, '96%/94% · 0%/49%');

    const dot = formatStatusBarPoolsText(sampleGroups, {
      ...baseConfig,
      statusBarFormat: 'dot',
    });
    assert.strictEqual(dot, '🟢 · 🔴');
  });

  test('formatPoolShortName simplifica nombres para barra de estado', () => {
    assert.strictEqual(formatPoolShortName('Gemini Models'), 'Gemini');
    assert.strictEqual(formatPoolShortName('Claude and GPT models'), 'Claude');
  });

  test('statusBarPoolView formatea con dos puntos cuando se filtra un solo pool', () => {
    const geminiText = formatStatusBarPoolsText([sampleGroups[0]], {
      ...baseConfig,
      statusBarPoolView: 'gemini',
    });
    assert.strictEqual(geminiText, 'Gemini: 96%/94%');

    const claudeText = formatStatusBarPoolsText([sampleGroups[1]], {
      ...baseConfig,
      statusBarPoolView: 'claude',
    });
    assert.strictEqual(claudeText, 'Claude: 0%/49%');
  });
});
