import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildSnapshot,
  clampFraction,
  formatCountdown,
  inferPoolName,
  toCalibrationSnapshot,
} from '../src/quotaParser';
import type { RawQuotaSummaryResponse, RawUserStatusResponse } from '../src/types';

describe('quotaParser con muestras reales de docs/samples/', () => {
  const quotaSamplePath = path.join(__dirname, '..', 'docs', 'samples', 'RetrieveUserQuotaSummary.json');
  const statusSamplePath = path.join(__dirname, '..', 'docs', 'samples', 'GetUserStatus.json');

  const rawQuota: RawQuotaSummaryResponse = JSON.parse(fs.readFileSync(quotaSamplePath, 'utf8'));
  const rawStatus: RawUserStatusResponse = JSON.parse(fs.readFileSync(statusSamplePath, 'utf8'));

  test('parsea correctamente los grupos y buckets del sample real', () => {
    const snapshot = buildSnapshot(rawQuota, rawStatus, 15);

    assert.strictEqual(snapshot.isConnected, true);
    assert.strictEqual(snapshot.groups.length, 2);

    const geminiGroup = snapshot.groups.find((g) => g.displayName === 'Gemini Models');
    assert.ok(geminiGroup, 'Debe existir Gemini Models');
    assert.strictEqual(geminiGroup.buckets.length, 2);

    const weeklyBucket = geminiGroup.buckets.find((b) => b.window === 'weekly');
    assert.ok(weeklyBucket);
    assert.strictEqual(weeklyBucket.remainingPercent, 94);

    const fiveHBucket = geminiGroup.buckets.find((b) => b.window === '5h');
    assert.ok(fiveHBucket);
    assert.strictEqual(fiveHBucket.remainingPercent, 96);
  });

  test('asocia modelos de Claude agotados al pool correspondiente y calcula 0%', () => {
    const snapshot = buildSnapshot(rawQuota, rawStatus, 20);

    const claudeSonnet = snapshot.models.find((m) => m.label.includes('Claude Sonnet'));
    assert.ok(claudeSonnet, 'Debe encontrar Claude Sonnet');
    assert.strictEqual(claudeSonnet.poolName, 'Claude and GPT models');
    // En el sample real, 3p-5h tiene 0 de cuota restante
    assert.strictEqual(claudeSonnet.remainingPercent, 0);
    assert.strictEqual(claudeSonnet.isExhausted, true);
  });

  test('parsea modelos de Gemini con cuota directa', () => {
    const snapshot = buildSnapshot(rawQuota, rawStatus, 20);

    const geminiFlash = snapshot.models.find((m) => m.label.includes('Gemini 3.8 Flash (High)'));
    assert.ok(geminiFlash);
    assert.strictEqual(geminiFlash.remainingPercent, 96);
    assert.strictEqual(geminiFlash.isExhausted, false);
  });

  test('clampFraction maneja valores fuera de rango y nulos', () => {
    assert.strictEqual(clampFraction(-0.5), 0);
    assert.strictEqual(clampFraction(1.5), 1);
    assert.strictEqual(clampFraction(0.75), 0.75);
    assert.strictEqual(clampFraction(null), 0);
    assert.strictEqual(clampFraction(undefined), 0);
  });

  test('inferPoolName clasifica adecuadamente los modelos', () => {
    assert.strictEqual(inferPoolName('Gemini 3.8 Flash'), 'Gemini Models');
    assert.strictEqual(inferPoolName('Claude Opus 4.6 (Thinking)'), 'Claude and GPT models');
    assert.strictEqual(inferPoolName('GPT-OSS 120B'), 'Claude and GPT models');
  });

  test('formatCountdown extrae tiempo de descripciones reales', () => {
    const desc = 'You have used some of your weekly limit, it will fully refresh in 6 days, 17 hours.';
    const countdown = formatCountdown(desc, null);
    assert.strictEqual(countdown, '6 days, 17 hours');
  });

  test('toCalibrationSnapshot mapea RetrieveUserQuotaSummary a CalibrationQuotaSnapshot', () => {
    const snap = toCalibrationSnapshot(rawQuota, 1700000000000);
    assert.ok(snap, 'Debe producir snapshot');
    assert.strictEqual(snap.takenAt, 1700000000000);

    // Pools gemini y claude
    assert.ok(snap.pools.gemini['5h']);
    assert.ok(snap.pools.gemini['weekly']);
    assert.strictEqual(snap.pools.gemini['5h']?.remainingFraction, 0.95980984);
    assert.strictEqual(snap.pools.gemini['weekly']?.remainingFraction, 0.944796);
    assert.ok(snap.pools.gemini['5h']!.resetAtMs > 0);

    assert.ok(snap.pools.claude['5h']);
    assert.strictEqual(snap.pools.claude['5h']?.remainingFraction, 0);
  });
});

