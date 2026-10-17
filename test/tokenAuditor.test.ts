import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// @ts-expect-error node:sqlite es nativo en Node 22+
import { DatabaseSync } from 'node:sqlite';
import { auditTokens, parseStepMetadata, resolveModelCodeName } from '../src/phase2/tokenAuditor';

function encodeVarint(val: number): Buffer {
  const bytes: number[] = [];
  let v = val;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v = v >>> 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function makeField(fieldNum: number, wireType: number, payload: Buffer): Buffer {
  const tag = encodeVarint((fieldNum << 3) | wireType);
  return Buffer.concat([tag, payload]);
}

function makeVarintField(fieldNum: number, val: number): Buffer {
  return makeField(fieldNum, 0, encodeVarint(val));
}

function makeSubmessageField(fieldNum: number, sub: Buffer): Buffer {
  const len = encodeVarint(sub.length);
  return makeField(fieldNum, 2, Buffer.concat([len, sub]));
}

describe('HITO C: Auditor de Tokens con Fixtures Sintéticos (node:sqlite)', () => {
  let tempDir: string;
  let dbFilePath: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agpro_test_tokens_'));
    dbFilePath = path.join(tempDir, 'test_session.db');

    const db = new DatabaseSync(dbFilePath);
    db.exec(`
      CREATE TABLE steps (
        idx INTEGER PRIMARY KEY,
        step_type INTEGER,
        metadata BLOB
      );
    `);

    // 1. Turno de usuario
    db.prepare('INSERT INTO steps (idx, step_type, metadata) VALUES (?, ?, ?);').run(1, 14, null);

    // 2. Paso de modelo sintético:
    // Field 1: startTime (sec: 1700000000, ns: 0)
    const startMsg = Buffer.concat([makeVarintField(1, 1700000000), makeVarintField(2, 0)]);
    const f1 = makeSubmessageField(1, startMsg);

    // Field 7: endTime (sec: 1700000010, ns: 0) -> Duración = 10s
    const endMsg = Buffer.concat([makeVarintField(1, 1700000010), makeVarintField(2, 0)]);
    const f7 = makeSubmessageField(7, endMsg);

    // Field 9: Tokens (model: 1318, thought: 50, output: 200, prompt: 1000)
    const f9Sub = Buffer.concat([
      makeVarintField(1, 1318), // Gemini 3.8 Flash High
      makeVarintField(2, 50),   // Thought tokens
      makeVarintField(3, 200),  // Output tokens
      makeVarintField(5, 1000), // Prompt tokens
    ]);
    const f9 = makeSubmessageField(9, f9Sub);

    const step2Blob = Buffer.concat([f1, f7, f9]);
    db.prepare('INSERT INTO steps (idx, step_type, metadata) VALUES (?, ?, ?);').run(2, 15, step2Blob);

    db.close();
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('parseStepMetadata decodifica correctamente tiempos, modelo y tokens', () => {
    const startMsg = Buffer.concat([makeVarintField(1, 1700000000), makeVarintField(2, 500000000)]);
    const f1 = makeSubmessageField(1, startMsg);

    const endMsg = Buffer.concat([makeVarintField(1, 1700000005), makeVarintField(2, 500000000)]);
    const f7 = makeSubmessageField(7, endMsg);

    const f9Sub = Buffer.concat([
      makeVarintField(1, 1026),
      makeVarintField(2, 120),
      makeVarintField(3, 80),
      makeVarintField(5, 5000),
    ]);
    const f9 = makeSubmessageField(9, f9Sub);

    const buf = Buffer.concat([f1, f7, f9]);
    const parsed = parseStepMetadata(buf);

    assert.strictEqual(parsed.modelCode, 1026);
    assert.strictEqual(resolveModelCodeName(1026), 'Claude Opus 4.6 (Thinking)');
    assert.strictEqual(parsed.thoughtTokens, 120);
    assert.strictEqual(parsed.outputTokens, 80);
    assert.strictEqual(parsed.promptTokens, 5000);
    assert.strictEqual(parsed.startTime?.sec, 1700000000);
    assert.strictEqual(parsed.endTime?.sec, 1700000005);
  });

  test('auditTokens escanea la base sintética y calcula métricas y velocidad real', async () => {
    const snapshot = await auditTokens(tempDir);

    assert.strictEqual(snapshot.isAvailable, true);
    assert.ok(snapshot.activeSession);

    const session = snapshot.activeSession!;
    assert.strictEqual(session.userTurns, 1);
    assert.strictEqual(session.modelTurns, 1);
    assert.strictEqual(session.totalPromptTokens, 1000);
    assert.strictEqual(session.totalOutputTokens, 200);
    assert.strictEqual(session.totalThoughtTokens, 50);
    assert.strictEqual(session.totalTokens, 1250);

    // Debe contener 1 petición
    assert.strictEqual(session.requests.length, 1);
    const req = session.requests[0];
    assert.strictEqual(req.stepIndex, 2);
    assert.strictEqual(req.modelName, 'Gemini 3.8 Flash (High)');
    assert.strictEqual(req.durationSeconds, 10);
    // 200 tokens / 10s = 20 t/s
    assert.strictEqual(req.outputSpeedTokensPerSec, 20);
    assert.strictEqual(req.cacheTokens, 0); // Decodificado por protoWire v1.2.0
  });

  test('auditTokens lee de forma incremental cuando se añaden nuevos pasos', async () => {
    // Añadimos un paso 3 a la base existente
    const db = new DatabaseSync(dbFilePath);
    const f9Sub = Buffer.concat([
      makeVarintField(1, 1318),
      makeVarintField(2, 10),
      makeVarintField(3, 100),
      makeVarintField(5, 1200),
    ]);
    const f9 = makeSubmessageField(9, f9Sub);
    db.prepare('INSERT INTO steps (idx, step_type, metadata) VALUES (?, ?, ?);').run(3, 15, f9);
    db.close();

    // Re-auditar
    const snapshot = await auditTokens(tempDir);
    const session = snapshot.activeSession!;

    assert.strictEqual(session.modelTurns, 2);
    assert.strictEqual(session.requests.length, 2);
    // Ordenado: el más reciente primero (idx 3)
    assert.strictEqual(session.requests[0].stepIndex, 3);
    assert.strictEqual(session.requests[1].stepIndex, 2);
    assert.strictEqual(session.totalOutputTokens, 300);
  });
});
