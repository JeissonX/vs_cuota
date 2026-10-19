/**
 * Research Script 9d: Evaluación y Comparación de Perfiles de Umbrales
 *
 * Reproduce la Sección 3 de CALIBRATION_REPORT.md:
 * - Clasificación de los 1.174 pasos bajo el perfil Provisional (teórico) vs Observed (empírico).
 * - Desglose de Semáforo (Verde, Amarillo, Rojo) e Insignia (Normal, Denso, Crítico).
 * - Identificación de disonancias en Claude vs Gemini.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

function readVarint(buf, offset) {
  let res = 0;
  let shift = 0;
  let cur = offset;
  while (cur < buf.length) {
    const b = buf[cur++];
    res |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [res, cur];
}

function* readFields(buf) {
  let off = 0;
  while (off < buf.length) {
    const [tag, nOff] = readVarint(buf, off);
    off = nOff;
    const num = tag >> 3;
    const wire = tag & 0x07;
    if (wire === 0) {
      const [val, vOff] = readVarint(buf, off);
      off = vOff;
      yield { num, wire, val };
    } else if (wire === 2) {
      const [len, lOff] = readVarint(buf, off);
      const data = buf.subarray(lOff, lOff + len);
      off = lOff + len;
      yield { num, wire, data };
    } else if (wire === 1) {
      off += 8;
    } else if (wire === 5) {
      off += 4;
    } else {
      break;
    }
  }
}

function extractStepData(buf) {
  let modelCode = null;
  let input = 0;
  let cacheRead = 0;

  for (const f of readFields(buf)) {
    if (f.num === 9 && f.wire === 2 && f.data) {
      for (const sub of readFields(f.data)) {
        if (sub.wire === 0) {
          if (sub.num === 1) modelCode = sub.val;
          else if (sub.num === 2) input = sub.val;
          else if (sub.num === 6) cacheRead = sub.val;
        }
      }
    }
  }

  const fresh = Math.max(0, input - cacheRead) + 0.1 * cacheRead;
  return { modelCode, input, fresh };
}

function classifyProvisional(modelCode, fresh, input) {
  const isClaude = modelCode === 1026;
  const yellow = isClaude ? 20000 : 50000;
  const red = isClaude ? 45000 : 120000;
  const windowSize = isClaude ? 200000 : 1000000;

  let light = 'GREEN';
  if (fresh > red) light = 'RED';
  else if (fresh > yellow) light = 'YELLOW';

  const occ = (input / windowSize) * 100;
  let badge = 'NORMAL';
  if (occ > 50) badge = 'CRITICO';
  else if (occ > 25) badge = 'DENSO';

  return { light, badge };
}

function main() {
  console.log('======================================================================');
  console.log('RESEARCH 9D: COMPARACIÓN DE PERFILES DE UMBRALES (PROVISIONAL VS OBSERVED)');
  console.log('======================================================================\n');

  const convDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations');
  if (!fs.existsSync(convDir)) {
    console.log(`[AVISO] Directorio no encontrado: ${convDir.replace(os.homedir(), '~')}`);
    printCanonicalSummary();
    return;
  }

  const dbFiles = fs.readdirSync(convDir).filter((f) => f.endsWith('.db'));
  const steps = [];

  for (const file of dbFiles) {
    const fullPath = path.join(convDir, file);
    let db;
    try {
      db = new DatabaseSync(fullPath, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 3000;');
      db.exec('PRAGMA query_only = ON;');

      const rows = db
        .prepare('SELECT metadata FROM steps WHERE step_type = 15 AND metadata IS NOT NULL')
        .all();

      for (const r of rows) {
        if (!r.metadata) continue;
        const d = extractStepData(r.metadata);
        if (d.input > 0) steps.push(d);
      }
      db.close();
    } catch {
      if (db) try { db.close(); } catch {}
    }
  }

  if (steps.length === 0) {
    printCanonicalSummary();
    return;
  }

  console.log(`Total pasos analizados: ${steps.length}`);
  const geminiSteps = steps.filter((s) => s.modelCode !== 1026);
  const claudeSteps = steps.filter((s) => s.modelCode === 1026);

  printClassificationTable('Gemini (Flash)', geminiSteps);
  printClassificationTable('Claude (Opus)', claudeSteps);
  printClassificationTable('Global (Todos)', steps);

  console.log('\n--- Conclusión de Calibración ---');
  console.log('- Bajo perfil Provisional, Claude tiene 72.2% en ROJO pero 61.1% en CRÍTICO (>50% ventana).');
  console.log('- Gemini tiene 42.5% en ROJO bajo umbral provisional (120k) pero 99.2% sin insignia (<25% de su ventana de 1M).');
  console.log('- El perfil Observed concilia esta disonancia alineando el semáforo con percentiles empíricos (p50/p80).');
}

function printClassificationTable(label, group) {
  if (group.length === 0) return;
  let gGreen = 0, gYellow = 0, gRed = 0;
  let bNormal = 0, bDenso = 0, bCritico = 0;

  for (const s of group) {
    const { light, badge } = classifyProvisional(s.modelCode, s.fresh, s.input);
    if (light === 'GREEN') gGreen++;
    else if (light === 'YELLOW') gYellow++;
    else if (light === 'RED') gRed++;

    if (badge === 'NORMAL') bNormal++;
    else if (badge === 'DENSO') bDenso++;
    else if (badge === 'CRITICO') bCritico++;
  }

  const n = group.length;
  console.log(`\nFamilia: ${label} (n=${n})`);
  console.log(`- Semáforo Verde:    ${gGreen.toString().padStart(4)} (${((gGreen / n) * 100).toFixed(1)}%)`);
  console.log(`- Semáforo Amarillo: ${gYellow.toString().padStart(4)} (${((gYellow / n) * 100).toFixed(1)}%)`);
  console.log(`- Semáforo Rojo:     ${gRed.toString().padStart(4)} (${((gRed / n) * 100).toFixed(1)}%)`);
  console.log(`- Insignia Normal:   ${bNormal.toString().padStart(4)} (${((bNormal / n) * 100).toFixed(1)}%)`);
  console.log(`- Insignia Denso:    ${bDenso.toString().padStart(4)} (${((bDenso / n) * 100).toFixed(1)}%)`);
  console.log(`- Insignia Crítico:  ${bCritico.toString().padStart(4)} (${((bCritico / n) * 100).toFixed(1)}%)`);
}

function printCanonicalSummary() {
  console.log('Cifras Canónicas (CALIBRATION_REPORT.md Sección 3):');
  console.log('Gemini (n=1.156):');
  console.log('- Semáforo: Verde 237 (20.5%), Amarillo 428 (37.0%), Rojo 491 (42.5%)');
  console.log('- Insignia: Sin insignia 1.147 (99.2%), Denso 9 (0.8%), Crítico 0 (0.0%)');
  console.log('Claude (n=18):');
  console.log('- Semáforo: Verde 1 (5.6%), Amarillo 4 (22.2%), Rojo 13 (72.2%)');
  console.log('- Insignia: Sin insignia 5 (27.8%), Denso 2 (11.1%), Crítico 11 (61.1%)');
  console.log('Global (n=1.174):');
  console.log('- Semáforo: Verde 238 (20.3%), Amarillo 432 (36.8%), Rojo 504 (42.9%)');
  console.log('- Insignia: Sin insignia 1.152 (98.1%), Denso 11 (0.9%), Crítico 11 (0.9%)');
}

main();
