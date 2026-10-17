import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTokenUsage } from '../src/phase2/protoWire';
import { fitCalibration, isTrustworthy } from '../src/phase2/nnls';
import { alignInterval, buildSamples } from '../src/phase2/calibrationAligner';
import type { CalibrationQuotaSnapshot, StepUsage } from '../src/types';

// --- encoder protobuf de prueba sintética ---
const varint = (n: number): number[] => {
  const o: number[] = [];
  while (n >= 128) {
    o.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  o.push(n);
  return o;
};

const fVar = (f: number, v: number) => [...varint(f * 8), ...varint(v)];
const fLen = (f: number, b: number[]) => [...varint(f * 8 + 2), ...varint(b.length), ...b];

describe('HITO E: Calibración v1.2.0 (Decoder Protobuf, NNLS y Alineador)', () => {
  test('1) Decoder de Wire Format Protobuf (campo 9 y subcampos)', () => {
    // Campo 9 con ruido alrededor y campos desconocidos
    const inner = [
      ...fVar(2, 120),
      ...fVar(3, 450),
      ...fVar(5, 20000),
      ...fVar(6, 15000),
      ...fVar(11, 7),
    ];
    const meta = Uint8Array.from([...fVar(1, 3), ...fLen(9, inner), ...fLen(12, [1, 2, 3])]);
    const d = decodeTokenUsage(meta);

    assert.ok(d.ok);
    assert.equal(d.usage.inputNoCache, 5000);
    assert.equal(d.usage.cacheRead, 15000);
    assert.equal(d.usage.output, 450);
    assert.equal(d.usage.thoughts, 120);

    // Truncado
    assert.equal(decodeTokenUsage(Uint8Array.from([0x08])).ok, false);

    // Sin campo 9
    const noField = decodeTokenUsage(Uint8Array.from(fVar(1, 1)));
    assert.equal(noField.ok, false);
    if (!noField.ok) assert.equal(noField.reason, 'noUsageField');

    // cacheRead > input
    const bad = Uint8Array.from(fLen(9, [...fVar(5, 10), ...fVar(6, 99)]));
    const badRes = decodeTokenUsage(bad);
    assert.equal(badRes.ok, false);
    if (!badRes.ok) assert.equal(badRes.reason, 'cacheExceedsInput');

    // Submensaje anidado alternativo (campo 7 con subcampo 1)
    const nested = Uint8Array.from(fLen(9, [...fVar(5, 1000), ...fLen(7, fVar(1, 400))]));
    const nestedRes = decodeTokenUsage(nested);
    assert.ok(nestedRes.ok);
    assert.equal(nestedRes.usage.cacheRead, 400);
  });

  test('2) NNLS (Lawson-Hanson): recuperación de coeficientes conocidos con ruido', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const truth = { inputNoCache: 2e-5, cacheRead: 0, output: 1e-4, thoughts: 8e-5 };

    const mk = (i: number) => {
      const x = {
        inputNoCache: 3000 + rnd() * 60000,
        cacheRead: rnd() * 400000,
        output: 200 + rnd() * 6000,
        thoughts: rnd() * 8000,
      };
      const y =
        truth.inputNoCache * x.inputNoCache +
        truth.output * x.output +
        truth.thoughts * x.thoughts +
        (rnd() - 0.5) * 0.04;
      return {
        pool: 'claude' as const,
        window: '5h' as const,
        t0: i,
        t1: i + 1,
        deltaPct: y,
        x,
        stepCount: 1,
      };
    };

    const fit = fitCalibration(
      Array.from({ length: 80 }, (_, i) => mk(i)),
      'claude',
      '5h',
    );
    assert.ok(fit !== null);
    assert.ok(fit.r2 > 0.95);
    assert.ok(isTrustworthy(fit));
    assert.ok(fit.coefPctPerToken.cacheRead < 1e-6);
    assert.ok(Math.abs(fit.coefPctPerToken.output / truth.output - 1) < 0.1);
  });

  test('3) Alineador de intervalos y construcción de muestras acumuladas', () => {
    const snap = (t: number, g: number, c: number, reset = 1e12): CalibrationQuotaSnapshot => ({
      takenAt: t,
      pools: {
        gemini: { '5h': { remainingFraction: g, resetAtMs: reset } },
        claude: { '5h': { remainingFraction: c, resetAtMs: reset } },
      },
    });

    const u = (ts: number, tok: number): StepUsage => ({
      id: ts,
      conversationId: 'c',
      ts,
      usage: { input: tok, inputNoCache: tok, cacheRead: 0, output: 100, thoughts: 0 },
    });

    const steps = [u(1_000, 5000), u(95_000, 8000), u(125_000, 9000)];
    const T0 = 100_000,
      T1 = 130_000;

    // Solo claude cae 1%
    let r = alignInterval(snap(T0, 1, 0.99), snap(T1, 1, 0.98), steps);
    assert.ok(r.ok);
    assert.equal(r.sample.pool, 'claude');
    assert.equal(r.sample.stepCount, 1);
    assert.equal(r.sample.x.inputNoCache, 8000);

    // Ambos caen -> concurrente
    r = alignInterval(snap(T0, 1, 0.99), snap(T1, 0.99, 0.98), steps);
    assert.ok(!r.ok);
    assert.equal(r.reason, 'concurrent');

    // 0.47% < 0.5% -> ruido
    r = alignInterval(snap(T0, 1, 0.99), snap(T1, 1, 0.9853), steps);
    assert.ok(!r.ok);
    assert.equal(r.reason, 'noise');

    // Salto de cuota hacia arriba -> reset
    r = alignInterval(snap(T0, 1, 0.5), snap(T1, 1, 1.0), steps);
    assert.ok(!r.ok);
    assert.equal(r.reason, 'reset');

    // Sin tokens locales en la ventana
    r = alignInterval(snap(T0, 1, 0.99), snap(T1, 1, 0.98), []);
    assert.ok(!r.ok);
    assert.equal(r.reason, 'noLocalTokens');

    // buildSamples: acumula ruido hasta cruzar 0.5%
    const rep = buildSamples(
      [snap(0, 1, 1), snap(60_000, 1, 0.997), snap(120_000, 1, 0.99)],
      [u(30_000, 100), u(100_000, 2000)],
    );
    assert.equal(rep.samples.length, 1);
    assert.equal(rep.samples[0]!.t0, 0);
  });
});
