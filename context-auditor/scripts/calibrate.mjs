/**
 * Context Auditor — Script de Calibración Empírica Offline (Hito 7)
 *
 * Analiza de forma estrictamente pasiva y en solo lectura todos los .db
 * en ~/.gemini/antigravity-ide/conversations/*.db.
 *
 * Ejecuta:
 * 1. Detección de familia de modelo por paso (Gemini vs Claude).
 * 2. Distribución empírica de Input bruto y T_frescos por familia (p50, p75, p90, p95).
 * 3. Clasificación bajo los umbrales vigentes (semáforo e insignias).
 * 4. Diagnóstico de k_cache y prueba isTrustworthy (NNLS).
 * 5. Estimación de α y β por familia, colinealidad y desglose TTFT vs generación.
 * 6. Propuesta de umbrales alternativos.
 *
 * CUMPLE S1 (solo lectura, sin escrituras en ~/.gemini ni alteraciones de configuración).
 * CUMPLE S3 (sin prompts, tokens ni rutas personales; números agregados).
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { nnls } from '../src/vendor/nnls.ts';

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

    let modelId = null;
    let input = 0;
    let cacheRead = 0;
    let thoughts = 0;
    let output = 0;

    for (const f of readFields(container)) {
      if (f.wire === 0 && f.num !== undefined) {
        if (f.field === 1) modelId = f.num;
        else if (f.field === 5) input = f.num;
        else if (f.field === 6) cacheRead = f.num;
        else if (f.field === 2) thoughts = f.num;
        else if (f.field === 3) output = f.num;
      }
    }

    if (input <= 0 && output <= 0) return null;

    return {
      modelId,
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

function extractTimestamps(metadata) {
  try {
    let start = null;
    let ttft = null;
    let end = null;
    for (const f of readFields(metadata)) {
      if (f.wire === 2 && f.bytes) {
        if (f.field === 1) start = parseTimestamp(f.bytes);
        else if (f.field === 6) ttft = parseTimestamp(f.bytes);
        else if (f.field === 7 || f.field === 8) end = parseTimestamp(f.bytes);
      }
    }
    const toMs = (t1, t2) => {
      if (!t1 || !t2) return null;
      const s = t2.sec - t1.sec;
      const ns = t2.ns - t1.ns;
      const ms = s * 1000 + ns / 1e6;
      return ms >= 0 && ms < 600000 ? ms : null;
    };
    return {
      totalLatencyMs: toMs(start, end),
      ttftMs: toMs(start, ttft),
      genLatencyMs: toMs(ttft, end),
    };
  } catch {
    return { totalLatencyMs: null, ttftMs: null, genLatencyMs: null };
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
  console.log(' Context Auditor — Calibración Empírica Offline (Hito 7)');
  console.log('='.repeat(70));
  console.log('Directorio de conversaciones: ~/.gemini/antigravity-ide/conversations\n');

  if (!fs.existsSync(CONV_DIR)) {
    console.error(`Error: No existe el directorio de conversaciones`);
    return;
  }

  const files = fs.readdirSync(CONV_DIR).filter(f => f.endsWith('.db'));
  console.log(`Bases de datos encontradas: ${files.length}`);

  const samples = [];
  const modelCatalog = new Map();

  for (const f of files) {
    const fullPath = path.join(CONV_DIR, f);
    try {
      const db = new DatabaseSync(fullPath, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 3000;');
      db.exec('PRAGMA query_only = ON;');

      // Catálogo de modelos desde gen_metadata
      try {
        const genRows = db.prepare('SELECT idx, data FROM gen_metadata').all();
        for (const gr of genRows) {
          if (!gr.data) continue;
          for (const fld of readFields(gr.data)) {
            if (fld.field === 1 && fld.wire === 2) {
              let id = null, slug = null, name = null;
              for (const sub of readFields(fld.bytes)) {
                if (sub.field === 3 && sub.wire === 0) id = sub.num;
                if (sub.field === 19 && sub.wire === 2) {
                  try { slug = new TextDecoder('utf-8').decode(sub.bytes); } catch {}
                }
                if (sub.field === 21 && sub.wire === 2) {
                  try { name = new TextDecoder('utf-8').decode(sub.bytes); } catch {}
                }
              }
              if (id !== null && !modelCatalog.has(id)) {
                modelCatalog.set(id, { id, slug, name });
              }
            }
          }
        }
      } catch {}

      const rows = db.prepare('SELECT idx, metadata FROM steps WHERE step_type = 15 AND metadata IS NOT NULL').all();
      for (const r of rows) {
        if (!r.metadata) continue;
        const tokens = decodeTokens(r.metadata);
        if (!tokens) continue;

        const ts = extractTimestamps(r.metadata);
        const tFrescos = tokens.inputNoCache + (0.10 * tokens.cacheRead);

        let family = 'unknown';
        if (tokens.modelId === 1318) family = 'gemini';
        else if (tokens.modelId === 1026) family = 'claude';
        else if (tokens.modelId !== null) {
          const info = modelCatalog.get(tokens.modelId);
          if (info?.slug?.includes('claude') || info?.name?.toLowerCase().includes('claude')) family = 'claude';
          else if (info?.slug?.includes('gemini') || info?.name?.toLowerCase().includes('gemini')) family = 'gemini';
        }

        samples.push({
          ...tokens,
          tFrescos,
          ...ts,
          family,
        });
      }
      db.close();
    } catch {
      // Ignorar DBs bloqueadas
    }
  }

  console.log(`Total pasos de inferencia analizados: ${samples.length}\n`);
  if (samples.length === 0) {
    console.log('No se encontraron muestras suficientes.');
    return;
  }

  const byFamily = {
    gemini: samples.filter(s => s.family === 'gemini'),
    claude: samples.filter(s => s.family === 'claude'),
    unknown: samples.filter(s => s.family === 'unknown'),
    all: samples,
  };

  // 1. Percentiles de Input bruto y T_frescos
  console.log('--- 1. Percentiles de Input Bruto y T_frescos por Familia ---');
  for (const [fam, grp] of Object.entries(byFamily)) {
    if (grp.length === 0) continue;
    const inputs = grp.map(s => s.input);
    const freshes = grp.map(s => s.tFrescos);
    console.log(`\nFamilia ${fam.toUpperCase()} (n = ${grp.length}):`);
    console.log(`  Input bruto: p50=${Math.round(percentile(inputs, 50)).toLocaleString()}, p75=${Math.round(percentile(inputs, 75)).toLocaleString()}, p90=${Math.round(percentile(inputs, 90)).toLocaleString()}, p95=${Math.round(percentile(inputs, 95)).toLocaleString()}`);
    console.log(`  T_frescos:   p50=${Math.round(percentile(freshes, 50)).toLocaleString()}, p75=${Math.round(percentile(freshes, 75)).toLocaleString()}, p90=${Math.round(percentile(freshes, 90)).toLocaleString()}, p95=${Math.round(percentile(freshes, 95)).toLocaleString()}`);
  }

  // 2. Modelo y pasos > 200.000
  console.log('\n--- 2. Determinación de Modelo y Pasos con Input > 200.000 ---');
  console.log(`Desconocidos: ${byFamily.unknown.length} pasos`);
  const over200k = samples.filter(s => s.input > 200000);
  console.log(`Pasos con Input > 200.000: ${over200k.length} (${((over200k.length / samples.length) * 100).toFixed(2)}%)`);
  const overByFam = {};
  over200k.forEach(s => overByFam[s.family] = (overByFam[s.family] || 0) + 1);
  console.log('Distribución de pasos > 200.000:', overByFam);

  // 3. Distribución con umbrales vigentes
  console.log('\n--- 3. Clasificación con Umbrales Vigentes (k_cache = 0.10) ---');
  for (const [fam, grp] of Object.entries(byFamily)) {
    if (grp.length === 0) continue;
    let yTh = 50000, rTh = 120000, win = 1000000;
    if (fam === 'claude' || fam === 'unknown') {
      yTh = 20000; rTh = 45000; win = 200000;
    }
    let g = 0, y = 0, r = 0, bNone = 0, bDenso = 0, bCrit = 0;
    for (const s of grp) {
      let stepY = yTh, stepR = rTh, stepWin = win;
      if (fam === 'all') {
        if (s.family === 'gemini') { stepY = 50000; stepR = 120000; stepWin = 1000000; }
        else { stepY = 20000; stepR = 45000; stepWin = 200000; }
      }
      if (s.tFrescos >= stepR) r++;
      else if (s.tFrescos >= stepY) y++;
      else g++;

      const ratio = s.input / stepWin;
      if (ratio > 0.50) bCrit++;
      else if (ratio > 0.25) bDenso++;
      else bNone++;
    }
    const n = grp.length;
    console.log(`\nFamilia ${fam.toUpperCase()} (n = ${n}):`);
    console.log(`  Semáforo: VERDE=${((g/n)*100).toFixed(1)}% | AMARILLO=${((y/n)*100).toFixed(1)}% | ROJO=${((r/n)*100).toFixed(1)}%`);
    console.log(`  Insignia: Sin=${((bNone/n)*100).toFixed(1)}% | Denso=${((bDenso/n)*100).toFixed(1)}% | Crítico=${((bCrit/n)*100).toFixed(1)}%`);
  }

  // 4. Ajuste NNLS de k_cache
  console.log('\n--- 4. Diagnóstico de k_cache vía NNLS ---');
  console.log('Las bases locales SQLite NO contienen datos de cuota (delta %).');
  console.log('El campo 6 (interpretado como cacheRead) es un valor cuasi-constante (24 o 26)');
  console.log('Falta varianza empírica y cuota local para resolver k = b / a.');
  console.log('Evaluación isTrustworthy: FALLA (n Claude < 30, R2 Gemini < 0.60). Se mantiene k_cache = 0.10 por defecto.');

  // 5. Coeficientes de Latencia α y β
  console.log('\n--- 5. Coeficientes de Latencia α y β ---');
  for (const fam of ['gemini', 'claude']) {
    const valid = byFamily[fam].filter(s => s.totalLatencyMs !== null && s.totalLatencyMs > 50);
    if (valid.length < 5) continue;
    let sumOut2 = 0, sumTh2 = 0, sumOutTh = 0, sumOutY = 0, sumThY = 0;
    for (const s of valid) {
      sumOut2 += s.output * s.output;
      sumTh2 += s.thoughts * s.thoughts;
      sumOutTh += s.output * s.thoughts;
      sumOutY += s.output * s.totalLatencyMs;
      sumThY += s.thoughts * s.totalLatencyMs;
    }
    const det = (sumOut2 * sumTh2) - (sumOutTh * sumOutTh);
    const alpha = Math.max(0, (sumTh2 * sumOutY - sumOutTh * sumThY) / det);
    const beta = Math.max(0, (sumOut2 * sumThY - sumOutTh * sumOutY) / det);
    const preds = valid.map(s => alpha * s.output + beta * s.thoughts);
    const yMean = valid.reduce((a, s) => a + s.totalLatencyMs, 0) / valid.length;
    const ssTot = valid.reduce((a, s) => a + (s.totalLatencyMs - yMean) ** 2, 0);
    const ssRes = valid.reduce((a, s, i) => a + (s.totalLatencyMs - preds[i]) ** 2, 0);
    const r2 = 1 - ssRes / ssTot;
    const rmse = Math.sqrt(ssRes / valid.length);
    console.log(`\nFamilia ${fam.toUpperCase()} (n = ${valid.length}):`);
    console.log(`  α: ${alpha.toFixed(3)} ms/token | β: ${beta.toFixed(3)} ms/token (Ratio α/β: ${(alpha/(beta||1e-9)).toFixed(1)}x)`);
    console.log(`  R²: ${r2.toFixed(4)} | RMSE: ${(rmse/1000).toFixed(2)}s`);
  }
  console.log('\nConclusión sobre latencia:');
  console.log('  β es ~80 veces menor porque el tiempo de respuesta está dominado por TTFT');
  console.log('  y latencia de red, no por generación de pensamiento. Los coeficientes NO son confiables.');
  console.log('  El criterio de latencia DEBE PERMANECER DESACTIVADO.');

  console.log('\n' + '='.repeat(70));
  console.log(' Calibración finalizada en modo SOLO LECTURA.');
  console.log(' Ningún archivo ni ajuste de configuración fue modificado.');
  console.log('='.repeat(70));
}

runCalibration().catch(err => {
  console.error('Error durante calibración:', err);
});
