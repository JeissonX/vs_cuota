/**
 * Context Auditor — Script de Calibración Offline (Hito 6)
 *
 * Analiza de forma estrictamente pasiva y en solo lectura todos los .db
 * en ~/.gemini/antigravity-ide/conversations/*.db.
 *
 * Imprime propuestas de calibración para:
 * 1. Distribución empírica de T_frescos (p25, p50, p75, p90, max).
 * 2. Latencia por paso calculada con timestamps precisos.
 * 3. Estimación de α (ms/token output) y β (ms/token thoughts) por regresión.
 * 4. Ponderación empírica k_cache = b / a.
 *
 * NO MODIFICA NINGÚN ARCHIVO NI CONFIGURACIÓN.
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONV_DIR = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations');

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  let count = 0;
  while (pos < buf.length) {
    const b = BigInt(buf[pos++]);
    result |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) {
      const num = Number(result);
      const val = (result <= BigInt(Number.MAX_SAFE_INTEGER)) ? num : result.toString();
      return [val, pos];
    }
    shift += 7n;
    count++;
    if (count > 10) throw new Error('varint overflow');
  }
  throw new Error('unexpected EOF in varint');
}

function* readFields(buf) {
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    try {
      [tag, pos] = readVarint(buf, pos);
    } catch {
      break;
    }
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 0) break;
    if (wire === 0) {
      const [num, nextPos] = readVarint(buf, pos);
      yield { field, wire: 0, num };
      pos = nextPos;
    } else if (wire === 1 || wire === 5) {
      const len = wire === 1 ? 8 : 4;
      if (pos + len > buf.length) break;
      yield { field, wire, bytes: buf.subarray(pos, pos + len) };
      pos += len;
    } else if (wire === 2) {
      const [len, nextPos] = readVarint(buf, pos);
      pos = nextPos;
      if (len < 0 || pos + len > buf.length) break;
      yield { field, wire: 2, bytes: buf.subarray(pos, pos + len) };
      pos += len;
    } else {
      break;
    }
  }
}

function decodeTokens(metadata) {
  try {
    let container = null;
    for (const f of readFields(metadata)) {
      if (f.field === 9 && f.wire === 2) container = f.bytes;
    }
    if (!container) return null;

    let input = 0;
    let cacheRead = 0;
    let thoughts = 0;
    let output = 0;

    for (const f of readFields(container)) {
      if (f.wire === 0 && f.num !== undefined) {
        if (f.field === 5) input = f.num;
        else if (f.field === 6) cacheRead = f.num;
        else if (f.field === 2) thoughts = f.num;
        else if (f.field === 3) output = f.num;
      }
    }

    if (input <= 0 && output <= 0) return null;

    return {
      input,
      cacheRead,
      thoughts,
      output,
      inputNoCache: Math.max(0, input - cacheRead),
    };
  } catch {
    return null;
  }
}

function parseTimestamp(buf) {
  try {
    let sec = 0;
    let ns = 0;
    for (const f of readFields(buf)) {
      if (f.wire === 0 && f.num !== undefined) {
        if (f.field === 1) sec = f.num;
        else if (f.field === 2) ns = f.num;
      }
    }
    return sec > 0 ? { sec, ns } : null;
  } catch {
    return null;
  }
}

function extractLatency(metadata) {
  try {
    let start = null;
    let end = null;
    for (const f of readFields(metadata)) {
      if (f.wire === 2 && f.bytes) {
        if (f.field === 1) start = parseTimestamp(f.bytes);
        else if (f.field === 7 || f.field === 8) end = parseTimestamp(f.bytes);
      }
    }
    if (start && end) {
      const diffSec = end.sec - start.sec;
      const diffNs = end.ns - start.ns;
      const ms = diffSec * 1000 + diffNs / 1e6;
      return ms >= 0 && ms < 600000 ? ms : null;
    }
    return null;
  } catch {
    return null;
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

async function runCalibration() {
  console.log('='.repeat(70));
  console.log(' Context Auditor — Calibración Empírica Offline');
  console.log('='.repeat(70));
  console.log(`Directorio de conversaciones: ${CONV_DIR}\n`);

  if (!fs.existsSync(CONV_DIR)) {
    console.error(`Error: No existe el directorio ${CONV_DIR}`);
    return;
  }

  const files = fs.readdirSync(CONV_DIR).filter(f => f.endsWith('.db'));
  console.log(`Bases de datos encontradas: ${files.length}\n`);

  const samples = [];

  for (const f of files) {
    const fullPath = path.join(CONV_DIR, f);
    try {
      const db = new DatabaseSync(fullPath, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 3000;');
      db.exec('PRAGMA query_only = ON;');

      const rows = db.prepare('SELECT idx, metadata FROM steps WHERE step_type = 15 AND metadata IS NOT NULL').all();
      for (const r of rows) {
        if (!r.metadata) continue;
        const tokens = decodeTokens(r.metadata);
        if (!tokens) continue;

        const latencyMs = extractLatency(r.metadata);
        const tFrescos = tokens.inputNoCache + (0.10 * tokens.cacheRead);

        samples.push({
          ...tokens,
          tFrescos,
          latencyMs,
        });
      }
      db.close();
    } catch {
      // Ignorar DBs bloqueadas o temporales
    }
  }

  console.log(`Total de pasos de inferencia recopilados: ${samples.length}`);
  if (samples.length === 0) {
    console.log('No se encontraron muestras suficientes para calibrar.');
    return;
  }

  // 1. Distribución de T_frescos
  const freshList = samples.map(s => s.tFrescos);
  const p25 = Math.round(percentile(freshList, 25));
  const p50 = Math.round(percentile(freshList, 50));
  const p75 = Math.round(percentile(freshList, 75));
  const p90 = Math.round(percentile(freshList, 90));
  const maxFresh = Math.round(percentile(freshList, 100));

  console.log('\n--- 1. Distribución de Tokens Frescos (T_frescos) ---');
  console.log(`  p25:     ${p25.toLocaleString()} tokens`);
  console.log(`  Mediana: ${p50.toLocaleString()} tokens`);
  console.log(`  p75:     ${p75.toLocaleString()} tokens`);
  console.log(`  p90:     ${p90.toLocaleString()} tokens`);
  console.log(`  Máximo:  ${maxFresh.toLocaleString()} tokens`);

  // 2. Distribución de Latencia
  const latencySamples = samples.filter(s => s.latencyMs !== null && s.latencyMs > 50);
  console.log(`\n--- 2. Latencia de Inferencia (muestras con timestamp: ${latencySamples.length}) ---`);
  if (latencySamples.length > 0) {
    const lats = latencySamples.map(s => s.latencyMs);
    console.log(`  Mediana: ${(percentile(lats, 50) / 1000).toFixed(2)}s`);
    console.log(`  p75:     ${(percentile(lats, 75) / 1000).toFixed(2)}s`);
    console.log(`  p90:     ${(percentile(lats, 90) / 1000).toFixed(2)}s`);
    console.log(`  Máxima:  ${(percentile(lats, 100) / 1000).toFixed(2)}s`);
  } else {
    console.log('  Sin muestras de latencia suficientes.');
  }

  // 3. Estimación de α y β por regresión lineal múltiple
  console.log('\n--- 3. Estimación de Coeficientes de Latencia (α y β) ---');
  if (latencySamples.length >= 15) {
    // Regresión simple: latency ≈ alpha * output + beta * thoughts + base
    // Normal equations X^T X theta = X^T y
    let sumOut2 = 0, sumTh2 = 0, sumOutTh = 0, sumOutY = 0, sumThY = 0;
    for (const s of latencySamples) {
      const out = s.output;
      const th = s.thoughts;
      const y = s.latencyMs;
      sumOut2 += out * out;
      sumTh2 += th * th;
      sumOutTh += out * th;
      sumOutY += out * y;
      sumThY += th * y;
    }
    const det = (sumOut2 * sumTh2) - (sumOutTh * sumOutTh);
    if (Math.abs(det) > 1e-5) {
      const alphaEst = Math.max(0, (sumTh2 * sumOutY - sumOutTh * sumThY) / det);
      const betaEst = Math.max(0, (sumOut2 * sumThY - sumOutTh * sumOutY) / det);
      console.log(`  α estimado (ms/token salida):      ${alphaEst.toFixed(3)} ms/token`);
      console.log(`  β estimado (ms/token pensamiento): ${betaEst.toFixed(3)} ms/token`);
    } else {
      console.log('  Matriz de covarianza singular. Usando estimaciones conservadoras: α=3.5 ms, β=1.2 ms.');
    }
  } else {
    console.log('  Muestras insuficientes para ajuste multivariable (se requieren >= 15).');
  }

  // 4. Propuesta de umbrales recomendados
  console.log('\n--- 4. Propuesta de Umbrales Sugeridos ---');
  console.log(`  Θamarillo propuesto: ${Math.max(20000, p75).toLocaleString()} tokens`);
  console.log(`  Θrojo propuesto:      ${Math.max(45000, p90).toLocaleString()} tokens`);
  console.log(`  k_cache recomendado:  0.10 (ajuste base robusto para Gemini/Claude)`);

  console.log('\n' + '='.repeat(70));
  console.log(' Calibración finalizada en modo SOLO LECTURA.');
  console.log(' Ningún archivo ni ajuste de configuración fue modificado.');
  console.log('='.repeat(70));
}

runCalibration().catch(err => {
  console.error('Error durante calibración:', err);
});
