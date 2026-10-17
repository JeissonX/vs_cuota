import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { getQuotaLevel } from '../src/quotaParser';
import { QuotaLevel } from '../src/types';

describe('Lógica de Umbrales de Cuota (thresholds)', () => {
  const WARNING = 30;
  const CRITICAL = 10;

  test('porcentaje mayor a warning es Normal', () => {
    assert.strictEqual(getQuotaLevel(100, WARNING, CRITICAL), QuotaLevel.Normal);
    assert.strictEqual(getQuotaLevel(50, WARNING, CRITICAL), QuotaLevel.Normal);
    assert.strictEqual(getQuotaLevel(31, WARNING, CRITICAL), QuotaLevel.Normal);
  });

  test('porcentaje entre critical y warning es Warning', () => {
    assert.strictEqual(getQuotaLevel(30, WARNING, CRITICAL), QuotaLevel.Warning);
    assert.strictEqual(getQuotaLevel(20, WARNING, CRITICAL), QuotaLevel.Warning);
    assert.strictEqual(getQuotaLevel(11, WARNING, CRITICAL), QuotaLevel.Warning);
  });

  test('porcentaje entre 1 y critical es Critical', () => {
    assert.strictEqual(getQuotaLevel(10, WARNING, CRITICAL), QuotaLevel.Critical);
    assert.strictEqual(getQuotaLevel(5, WARNING, CRITICAL), QuotaLevel.Critical);
    assert.strictEqual(getQuotaLevel(1, WARNING, CRITICAL), QuotaLevel.Critical);
  });

  test('porcentaje 0 o negativo o nulo es Depleted', () => {
    assert.strictEqual(getQuotaLevel(0, WARNING, CRITICAL), QuotaLevel.Depleted);
    assert.strictEqual(getQuotaLevel(-5, WARNING, CRITICAL), QuotaLevel.Depleted);
    assert.strictEqual(getQuotaLevel(null, WARNING, CRITICAL), QuotaLevel.Depleted);
  });
});
