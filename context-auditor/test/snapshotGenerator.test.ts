import test from 'node:test';
import assert from 'node:assert/strict';

import {
  truncateGitSummary,
  buildMigrationSnapshot,
  formatMigrationSnapshot,
  type GitInfo,
} from '../src/snapshotGenerator';
import {
  extractUserPrompt,
  extractAssistantReply,
  extractCommandInfo,
  sanitizePath,
} from '../src/stepExtractor';

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

test('truncateGitSummary: topes duros de 20 líneas y 1000 caracteres', () => {
  // Caso 1: Cadena vacía -> fallback
  assert.equal(truncateGitSummary(''), '[Consultar git status]');
  assert.equal(truncateGitSummary('   \n  '), '[Consultar git status]');

  // Caso 2: Más de 20 líneas -> trunca a 20 líneas
  const thirtyLines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
  const resLines = truncateGitSummary(thirtyLines);
  const resultLines = resLines.split('\n');
  assert.equal(resultLines.length, 21); // 20 líneas + '... [TRUNCADO]'
  assert.ok(resLines.includes('... [TRUNCADO]'));

  // Caso 3: Menos de 20 líneas pero más de 1000 caracteres
  const longLine = 'a'.repeat(1200);
  const resChars = truncateGitSummary(longLine);
  assert.ok(resChars.length <= 1020);
  assert.ok(resChars.includes('... [TRUNCADO]'));
});

test('buildMigrationSnapshot: respeta topes de caracteres y fallbacks', () => {
  const gitInfo: GitInfo = {
    branch: 'context-auditor',
    summary: 'M package.json\n?? newfile.ts',
    modifiedFiles: ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts', 'f7.ts', 'f8.ts', 'f9.ts', 'f10.ts'],
  };

  const longPrompt1 = 'A'.repeat(500); // Excede 300
  const longPrompt2 = 'B'.repeat(300); // Intermedio excede 150
  const longPrompt3 = 'C'.repeat(300); // Intermedio excede 150
  const longPrompt4 = 'D'.repeat(400); // Último prompt excede 300
  const longAssistant = 'E'.repeat(600); // Asistente excede 400

  const snapshot = buildMigrationSnapshot('C:\\Users\\Jeisson\\workspace', gitInfo, {
    userPrompts: [longPrompt1, longPrompt2, longPrompt3, longPrompt4],
    lastAssistantReply: longAssistant,
    commands: [
      { command: 'cmd1', exitCode: 0 },
      { command: 'cmd2', exitCode: 1 },
      { command: 'cmd3', exitCode: 0 },
      { command: 'cmd4', exitCode: 0 },
    ],
  });

  // Topes de prompts
  assert.ok(snapshot.boundedHistory.firstUser.length <= 320);
  assert.ok(snapshot.boundedHistory.firstUser.endsWith('... [TRUNCADO]'));

  assert.ok(snapshot.lastInteraction.lastUser.length <= 320);
  assert.ok(snapshot.lastInteraction.lastUser.endsWith('... [TRUNCADO]'));

  // Intermedios: máximo 2 intermedios, cada uno <= 170 chars
  assert.equal(snapshot.boundedHistory.intermediates.length, 2);
  for (const inter of snapshot.boundedHistory.intermediates) {
    assert.ok(inter.length <= 170);
    assert.ok(inter.endsWith('... [TRUNCADO]'));
  }

  // Última respuesta del asistente: toma los últimos 400 caracteres
  assert.ok(snapshot.lastInteraction.lastAssistant.length <= 420);
  assert.ok(snapshot.lastInteraction.lastAssistant.startsWith('... [TRUNCADO]'));

  // Archivos modificados: máximo 8
  assert.equal(snapshot.modifiedFiles.length, 8);

  // Comandos: máximo 3
  assert.ok(snapshot.lastCommands);
  assert.equal(snapshot.lastCommands.length, 3);
  assert.equal(snapshot.lastCommands[2]?.command, 'cmd4');

  // Sanitización de workspace
  assert.ok(!snapshot.environment.workspace.includes('C:\\Users\\Jeisson'));
  assert.ok(snapshot.environment.workspace.startsWith('~'));
});

test('formatMigrationSnapshot: formatea todas las secciones requeridas', () => {
  const snapshot = buildMigrationSnapshot('~/workspace', {
    branch: 'context-auditor',
    summary: 'M src/dbReader.ts',
    modifiedFiles: ['src/dbReader.ts'],
  }, {
    userPrompts: ['Implementa el hito 3'],
    lastAssistantReply: 'Hito 3 implementado exitosamente.',
    commands: [{ command: 'npm test', exitCode: 0 }],
  });

  const formatted = formatMigrationSnapshot(snapshot);

  assert.ok(formatted.includes('# Snapshot de Migración — Context Auditor'));
  assert.ok(formatted.includes('## Entorno'));
  assert.ok(formatted.includes('## Última Interacción'));
  assert.ok(formatted.includes('## Historial Acotado'));
  assert.ok(formatted.includes('## Archivos Modificados'));
  assert.ok(formatted.includes('## Últimos Comandos'));
  assert.ok(formatted.includes('## Directiva de Reanudación'));
  assert.ok(formatted.includes('`npm test` (código 0)'));
});

test('Extractores de turnos Protobuf: extraen texto y comando de BLOBs sintéticos', () => {
  // Turno de usuario (step 14): field 19 -> subfield 2 (string)
  const userTextBuf = new TextEncoder().encode('Instrucción del usuario para la prueba');
  const userPayload = encodeLengthDelimited(19, encodeLengthDelimited(2, userTextBuf));
  const extractedPrompt = extractUserPrompt(userPayload);
  assert.equal(extractedPrompt, 'Instrucción del usuario para la prueba');

  // Turno de asistente (step 15): field 20 -> subfield 1 (string)
  const assistantTextBuf = new TextEncoder().encode('Respuesta generada por el asistente');
  const assistantPayload = encodeLengthDelimited(20, encodeLengthDelimited(1, assistantTextBuf));
  const extractedReply = extractAssistantReply(assistantPayload);
  assert.equal(extractedReply, 'Respuesta generada por el asistente');

  // Turno de comando (step 21): field 28 -> subfield 23 (command), subfield 6 (exitCode)
  const cmdTextBuf = new TextEncoder().encode('git status --short');
  const cmdSub = concat(
    encodeLengthDelimited(23, cmdTextBuf),
    encodeVarintField(6, 0)
  );
  const cmdPayload = encodeLengthDelimited(28, cmdSub);
  const extractedCmd = extractCommandInfo(cmdPayload);
  assert.ok(extractedCmd);
  assert.equal(extractedCmd.command, 'git status --short');
  assert.equal(extractedCmd.exitCode, 0);
});

test('sanitizePath: sustituye carpetas personales por ~', () => {
  const winPath = 'C:\\Users\\Jeisson\\Documents\\AGENCIA\\vs_cuota';
  const sanitized = sanitizePath(winPath);
  assert.ok(!sanitized.includes('C:\\Users\\Jeisson'));
  assert.ok(sanitized.startsWith('~'));
});
