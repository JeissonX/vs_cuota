/**
 * Context Auditor — Extractor de Contenido de Pasos (Integrado v1.3.0)
 *
 * Lee textos de turnos de usuario, respuestas de modelo y comandos ejecutados
 * directamente desde los BLOBs protobuf de SQLite sin invocar ningún LLM.
 */

import * as os from 'node:os';
import { readFields } from '../phase2/protoWire';

export interface ExtractedTurn {
  readonly idx: number;
  readonly stepType: number;
  readonly role: 'user' | 'assistant' | 'command' | 'file';
  readonly text: string;
  readonly exitCode?: number | null;
  readonly filePath?: string | null;
}

export function sanitizePath(str: string): string {
  if (!str) return str;
  const home = os.homedir();
  let res = str.replaceAll(home, '~').replaceAll(home.replace(/\\/g, '/'), '~');
  res = res.replace(/C:[\\/]Users[\\/][^\\/]+/gi, '~');
  return res;
}

export function extractStringFromSubmessage(buf: Uint8Array, targetField: number): string | null {
  try {
    for (const f of readFields(buf)) {
      if (f.field === targetField && f.wire === 2 && f.bytes) {
        return new TextDecoder('utf-8', { fatal: false }).decode(f.bytes);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractUserPrompt(payloadBuf: Uint8Array): string | null {
  try {
    for (const f of readFields(payloadBuf)) {
      if (f.field === 19 && f.wire === 2 && f.bytes) {
        // En campo 19, el texto está en campo 2 o submensaje 3.1
        let text = extractStringFromSubmessage(f.bytes, 2);
        if (!text) {
          for (const sf of readFields(f.bytes)) {
            if (sf.field === 3 && sf.wire === 2 && sf.bytes) {
              text = extractStringFromSubmessage(sf.bytes, 1);
              if (text) break;
            }
          }
        }
        if (text) return sanitizePath(text);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractAssistantReply(payloadBuf: Uint8Array): string | null {
  try {
    for (const f of readFields(payloadBuf)) {
      if (f.field === 20 && f.wire === 2 && f.bytes) {
        // En campo 20, el texto principal está en campo 1
        const text = extractStringFromSubmessage(f.bytes, 1);
        if (text) return sanitizePath(text);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractCommandInfo(payloadBuf: Uint8Array): { command: string; exitCode: number | null } | null {
  try {
    let command: string | null = null;
    let exitCode: number | null = null;

    for (const f of readFields(payloadBuf)) {
      if (f.field === 28 && f.wire === 2 && f.bytes) {
        for (const sf of readFields(f.bytes)) {
          if (sf.field === 23 && sf.wire === 2 && sf.bytes) {
            command = new TextDecoder('utf-8', { fatal: false }).decode(sf.bytes);
          } else if (sf.field === 6 && sf.wire === 0 && sf.num !== undefined) {
            exitCode = sf.num;
          }
        }
      }
    }

    if (command) {
      return { command: sanitizePath(command), exitCode };
    }
    return null;
  } catch {
    return null;
  }
}
