/**
 * Script de inspección segura del esquema SQLite de Antigravity (Hito B)
 * REGLAS DE PRIVACIDAD:
 * - Modo estrictamente solo lectura.
 * - NUNCA selecciona ni lee columnas de texto de conversación.
 * - Sanitiza y redacta UUIDs, identificadores y tokens.
 */

import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error node:sqlite es nativo en Node 22+
import { DatabaseSync } from 'node:sqlite';

function decodeVarint(buf: Buffer, offset: number): [number, number] {
  let res = 0;
  let shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    res |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [res, offset];
}

interface ProtobufDecodedField {
  fieldNumber: number;
  wireType: number;
  value?: number | string | Buffer | unknown[];
}

function parseProtobufFields(buf: Buffer): ProtobufDecodedField[] {
  const fields: ProtobufDecodedField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    try {
      const [tag, nextOffset] = decodeVarint(buf, offset);
      offset = nextOffset;
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x07;

      if (wireType === 0) {
        const [val, varOffset] = decodeVarint(buf, offset);
        offset = varOffset;
        fields.push({ fieldNumber, wireType, value: val });
      } else if (wireType === 2) {
        const [length, lenOffset] = decodeVarint(buf, offset);
        offset = lenOffset;
        const subBuf = buf.subarray(offset, offset + length);
        offset += length;

        try {
          const subFields = parseProtobufFields(subBuf);
          if (subFields.length > 0) {
            fields.push({ fieldNumber, wireType, value: subFields });
            continue;
          }
        } catch {
          // ignore
        }

        const strVal = subBuf.toString('utf8');
        if (/^[a-zA-Z0-9_\-\.]{4,}$/.test(strVal)) {
          // Redactar cualquier UUID o identificador opaco
          if (strVal.length > 15 || /[0-9a-f]{8}-[0-9a-f]{4}/i.test(strVal)) {
            fields.push({ fieldNumber, wireType, value: 'REDACTED' });
          } else {
            fields.push({ fieldNumber, wireType, value: strVal });
          }
        } else {
          fields.push({ fieldNumber, wireType, value: `[binary ${subBuf.length} bytes]` });
        }
      } else if (wireType === 1) {
        offset += 8;
        fields.push({ fieldNumber, wireType, value: '[64-bit float/int]' });
      } else if (wireType === 5) {
        offset += 4;
        fields.push({ fieldNumber, wireType, value: '[32-bit float/int]' });
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return fields;
}

async function run() {
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const convDir = path.join(userHome, '.gemini', 'antigravity-ide', 'conversations');

  if (!fs.existsSync(convDir)) {
    console.error(`Directorio no encontrado: ${convDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(convDir).filter((f) => f.endsWith('.db'));
  if (files.length === 0) {
    console.error('No se encontraron archivos .db');
    process.exit(1);
  }

  const sortedDbs = files
    .map((f) => ({ name: f, path: path.join(convDir, f), mtime: fs.statSync(path.join(convDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const targetDb = sortedDbs[0];
  console.log(`Inspeccionando base de datos más reciente (modo solo lectura): REDACTED.db`);

  const db = new DatabaseSync(targetDb.path, { readOnly: true });

  // 1. Esquema general de tablas y columnas (PRAGMA table_info)
  const tablesStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
  const tables = tablesStmt.all() as Array<{ name: string }>;

  const schemaInfo: Record<string, unknown> = {};

  for (const t of tables) {
    const colStmt = db.prepare(`PRAGMA table_info(${t.name});`);
    const cols = colStmt.all() as Array<{ cid: number; name: string; type: string; notnull: number; pk: number }>;
    schemaInfo[t.name] = {
      columns: cols.map((c) => ({ name: c.name, type: c.type, isPrimaryKey: c.pk === 1 })),
    };
  }

  // 2. Conteo de tipos de pasos en tabla steps
  let stepTypesInfo: any = {};
  if (schemaInfo['steps']) {
    const typeCountStmt = db.prepare('SELECT step_type, COUNT(*) as count FROM steps GROUP BY step_type;');
    stepTypesInfo = typeCountStmt.all();
  }

  // 3. Inspección de metadatos de pasos del modelo (step_type = 15)
  // ÚNICAMENTE seleccionamos idx, step_type, metadata. NUNCA columnas con texto.
  const metadataSamples: any[] = [];
  if (schemaInfo['steps']) {
    const modelStepsStmt = db.prepare(
      'SELECT idx, step_type, metadata FROM steps WHERE step_type = 15 AND metadata IS NOT NULL ORDER BY idx DESC LIMIT 5;',
    );
    const rows = modelStepsStmt.all() as Array<{ idx: number; step_type: number; metadata: Buffer }>;

    for (const r of rows) {
      if (r.metadata) {
        const buf = Buffer.from(r.metadata);
        const parsed = parseProtobufFields(buf);
        metadataSamples.push({
          idx: r.idx,
          step_type: r.step_type,
          metadataLengthBytes: buf.length,
          parsedFields: parsed,
        });
      }
    }
  }

  db.close();

  const samplesDir = path.join(__dirname, '..', 'docs', 'samples');
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(samplesDir, 'sqlite_schema.json'),
    JSON.stringify(
      {
        databaseFile: 'REDACTED.db',
        tables: schemaInfo,
        stepTypesSummary: stepTypesInfo,
      },
      null,
      2,
    ),
    'utf8',
  );

  fs.writeFileSync(
    path.join(samplesDir, 'metadata_structure.json'),
    JSON.stringify(
      {
        sampleCount: metadataSamples.length,
        samples: metadataSamples,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('Esquema y metadatos sanitizados guardados exitosamente en docs/samples/');
}

run().catch((err) => {
  console.error('Error en inspección:', err);
  process.exit(1);
});
