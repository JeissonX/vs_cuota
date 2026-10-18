// Origen: src/phase2/protoWire.ts (commit f3bb103c8c8adb3dff3d61ff6aafb000dedcc23b)
/**
 * Context Auditor — Vendor Lector de Wire Format Protobuf
 *
 * Lector mínimo de wire format protobuf (varint, fixed32/64, length-delimited).
 * Lee por NÚMERO DE CAMPO, no por offset: campos nuevos o reordenados no rompen.
 *
 * Cero dependencias externas. 100% seguro con números flotantes/BigInts.
 */

import type { TokenUsage } from '../types';

export interface WireField {
  readonly field: number;
  readonly wire: 0 | 1 | 2 | 5;
  readonly num?: number; // wire 0
  readonly bytes?: Uint8Array; // wire 1, 2, 5
}

export function readVarint(buf: Uint8Array, pos: number): [value: number, next: number] {
  let result = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new RangeError('varint truncado');
    const b = buf[pos++]!;
    result += (b & 0x7f) * mul; // sin operadores de bits: seguro hasta 2^53
    if ((b & 0x80) === 0) return [result, pos];
    mul *= 128;
  }
  throw new RangeError('varint demasiado largo');
}

export function* readFields(buf: Uint8Array): Generator<WireField> {
  let pos = 0;
  while (pos < buf.length) {
    let tag: number;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 0) throw new RangeError('campo 0 inválido');
    switch (wire) {
      case 0: {
        let num: number;
        [num, pos] = readVarint(buf, pos);
        yield { field, wire: 0, num };
        break;
      }
      case 1:
      case 5: {
        const len = wire === 1 ? 8 : 4;
        if (pos + len > buf.length) throw new RangeError('fixed truncado');
        yield { field, wire, bytes: buf.subarray(pos, pos + len) };
        pos += len;
        break;
      }
      case 2: {
        let len: number;
        [len, pos] = readVarint(buf, pos);
        if (pos + len > buf.length) throw new RangeError('length-delimited truncado');
        yield { field, wire: 2, bytes: buf.subarray(pos, pos + len) };
        pos += len;
        break;
      }
      default:
        throw new RangeError(`wire type ${wire} no soportado`);
    }
  }
}

/**
 * Mapa de campos dentro del submensaje TokenUsage (campo 9 de metadata).
 * Empíricamente validado en spike:
 * 9.5: input tokens
 * 9.6: cacheRead varint
 * 9.2: thoughts tokens
 * 9.3: output tokens
 * 9.1: modelCode
 */
export const TOKEN_FIELD_MAP = {
  container: 9,
  modelCode: 1,
  thoughts: 2,
  output: 3,
  input: 5,
  cacheVarint: 6,
  cacheAlt: 7, // soporte alternativo en submensaje si existiese
} as const;

export type DecodeFailure =
  | 'malformed'
  | 'noUsageField'
  | 'unsafeInteger'
  | 'cacheExceedsInput';

export type DecodeResult =
  | { readonly ok: true; readonly usage: TokenUsage; readonly modelCode?: number }
  | { readonly ok: false; readonly reason: DecodeFailure };

/**
 * proto3 omite los ceros: un contador ausente vale 0. Si el campo 9 no existe,
 * el paso no trae uso (se reporta aparte para no confundirlo con 0 tokens).
 */
export function decodeTokenUsage(metadata: Uint8Array, map = TOKEN_FIELD_MAP): DecodeResult {
  try {
    let container: Uint8Array | undefined;
    for (const f of readFields(metadata)) {
      if (f.field === map.container && f.wire === 2) container = f.bytes; // gana el último
    }
    if (!container) return { ok: false, reason: 'noUsageField' };

    const v = new Map<number, number>();
    let nestedCache: number | undefined;
    for (const f of readFields(container)) {
      if (f.wire === 0 && f.num !== undefined) v.set(f.field, f.num);
      else if (f.field === map.cacheAlt && f.wire === 2 && f.bytes) {
        for (const g of readFields(f.bytes)) {
          if (g.field === 1 && g.wire === 0 && g.num !== undefined) {
            nestedCache = g.num;
            break;
          }
        }
      }
    }

    const input = v.get(map.input) ?? 0;
    const output = v.get(map.output) ?? 0;
    const thoughts = v.get(map.thoughts) ?? 0;
    const cacheRead = v.get(map.cacheVarint) ?? v.get(map.cacheAlt) ?? nestedCache ?? 0;
    const modelCode = v.get(map.modelCode);

    if (![input, output, thoughts, cacheRead].every(Number.isSafeInteger)) {
      return { ok: false, reason: 'unsafeInteger' };
    }
    if (cacheRead > input) return { ok: false, reason: 'cacheExceedsInput' };

    return {
      ok: true,
      usage: { input, inputNoCache: Math.max(0, input - cacheRead), cacheRead, output, thoughts },
      modelCode,
    };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
