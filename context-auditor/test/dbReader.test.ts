import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { validateSchema, readSessionContext, extractStepMetadata } from '../src/dbReader';
import { decodeTokenUsage } from '../src/vendor/protoWire';

function encodeVarint(val: number): Uint8Array {
  const bytes: number[] = [];
  let n = val;
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  bytes.push(n & 0x7f);
  return new Uint8Array(bytes);
}

function encodeTag(fieldNum: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNum << 3) | wireType);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function encodeLengthDelimited(fieldNum: number, content: Uint8Array): Uint8Array {
  return concat(encodeTag(fieldNum, 2), encodeVarint(content.length), content);
}

function encodeVarintField(fieldNum: number, val: number): Uint8Array {
  return concat(encodeTag(fieldNum, 0), encodeVarint(val));
}

function createSyntheticMetadata(tokens: {
  input: number;
  cache: number;
  thoughts: number;
  output: number;
  modelCode?: number;
  startSec?: number;
  endSec?: number;
}): Uint8Array {
  // Container 9 (TokenUsage)
  const containerParts = [
    encodeVarintField(5, tokens.input),
    encodeVarintField(6, tokens.cache),
    encodeVarintField(2, tokens.thoughts),
    encodeVarintField(3, tokens.output),
  ];
  if (tokens.modelCode !== undefined) {
    containerParts.push(encodeVarintField(1, tokens.modelCode));
  }
  const container = concat(...containerParts);

  const metaParts = [
    encodeLengthDelimited(9, container),
  ];

  if (tokens.modelCode !== undefined) {
    metaParts.push(encodeVarintField(11, tokens.modelCode));
  }

  if (tokens.startSec !== undefined) {
    const startBuf = concat(
      encodeVarintField(1, tokens.startSec),
      encodeVarintField(2, 500000000)
    );
    metaParts.push(encodeLengthDelimited(1, startBuf));
  }

  if (tokens.endSec !== undefined) {
    const endBuf = concat(
      encodeVarintField(1, tokens.endSec),
      encodeVarintField(2, 800000000)
    );
    metaParts.push(encodeLengthDelimited(7, endBuf));
  }

  return concat(...metaParts);
}

test('Schema Guard: detecta columnas críticas presentes', () => {
  const mockDb = {
    prepare: () => ({
      all: () => [
        { name: 'idx' },
        { name: 'step_type' },
        { name: 'metadata' },
        { name: 'status' }
      ]
    })
  };
  const res = validateSchema(mockDb);
  assert.equal(res.ok, true);
});

test('Schema Guard: reporta inactivo si falta columna crítica', () => {
  const mockDbIncomplete = {
    prepare: () => ({
      all: () => [
        { name: 'idx' },
        { name: 'step_type' }
        // falta metadata
      ]
    })
  };
  const res = validateSchema(mockDbIncomplete);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.statusMessage, 'Auditor inactivo: versión de base de datos no compatible');
    assert.deepEqual(res.missingColumns, ['metadata']);
  }
});

test('Decodificador Protobuf: extrae valores exactos de tokens', () => {
  const metaBuf = createSyntheticMetadata({
    input: 65410,
    cache: 24,
    thoughts: 2758,
    output: 1079,
    modelCode: 1318,
    startSec: 100,
    endSec: 105,
  });

  const decoded = decodeTokenUsage(metaBuf);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.equal(decoded.usage.input, 65410);
    assert.equal(decoded.usage.cacheRead, 24);
    assert.equal(decoded.usage.inputNoCache, 65410 - 24);
    assert.equal(decoded.usage.thoughts, 2758);
    assert.equal(decoded.usage.output, 1079);
    assert.equal(decoded.modelCode, 1318);
  }

  const meta = extractStepMetadata(metaBuf);
  assert.ok(meta.usage);
  assert.equal(meta.modelCode, 1318);
  assert.equal(meta.latencyMs, 5300); // 5 sec + (800ms - 500ms) = 5300 ms
});

test('Decodificador Protobuf: degrada si metadata no contiene campo 9', () => {
  const dummyBuf = concat(encodeVarintField(1, 999));
  const decoded = decodeTokenUsage(dummyBuf);
  assert.equal(decoded.ok, false);
  if (!decoded.ok) {
    assert.equal(decoded.reason, 'noUsageField');
  }
});

test('Lector SQLite: lee último paso de inferencia desde fixture sintética', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
  const tmpDbPath = path.join(tmpDir, 'test_conv.db');

  const db = new DatabaseSync(tmpDbPath);
  db.exec(`
    CREATE TABLE steps (
      idx INTEGER PRIMARY KEY,
      step_type INTEGER,
      status INTEGER,
      metadata BLOB
    );
  `);

  const meta1 = createSyntheticMetadata({
    input: 20000,
    cache: 5000,
    thoughts: 800,
    output: 400,
    modelCode: 1318,
    startSec: 10,
    endSec: 12,
  });

  const meta2 = createSyntheticMetadata({
    input: 45000,
    cache: 12000,
    thoughts: 1500,
    output: 900,
    modelCode: 1318,
    startSec: 20,
    endSec: 24,
  });

  const insert = db.prepare('INSERT INTO steps (idx, step_type, status, metadata) VALUES (?, ?, ?, ?)');
  insert.run(0, 14, 3, null); // user turn
  insert.run(1, 15, 3, Buffer.from(meta1)); // inference 1
  insert.run(2, 21, 3, null); // tool call
  insert.run(3, 15, 3, Buffer.from(meta2)); // inference 2 (latest)
  db.close();

  const sessionResult = readSessionContext(tmpDbPath);
  assert.equal(sessionResult.guard.ok, true);
  assert.ok(sessionResult.lastInference);
  assert.equal(sessionResult.lastInference.idx, 3);
  assert.equal(sessionResult.lastInference.usage.input, 45000);
  assert.equal(sessionResult.lastInference.usage.cacheRead, 12000);
  assert.equal(sessionResult.lastInference.usage.inputNoCache, 33000);
  assert.equal(sessionResult.lastInference.usage.thoughts, 1500);
  assert.equal(sessionResult.lastInference.usage.output, 900);
  assert.equal(sessionResult.recentInferences.length, 2);

  // Limpiar fixture
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }
});

test('Lector SQLite: degrada graciosamente ante archivo inexistente (S4)', () => {
  const result = readSessionContext('path/que/no/existe.db');
  assert.equal(result.guard.ok, false);
  assert.equal(result.lastInference, null);
  assert.deepEqual(result.recentInferences, []);
});
