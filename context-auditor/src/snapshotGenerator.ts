/**
 * Context Auditor — Generador de Snapshot Determinista
 *
 * Genera un resumen compacto de migración para traspasar contexto a una nueva
 * sesión sin invocar ningún modelo de lenguaje, aplicando topes duros estrictos.
 */

import { execFile } from 'node:child_process';
import type { MigrationSnapshot } from './types';
import { sanitizePath } from './stepExtractor';

const LIMITS = {
  gitLines: 20,
  gitChars: 1000,
  lastAssistantChars: 400,
  lastUserChars: 300,
  firstUserChars: 300,
  intermediateChars: 150,
  maxIntermediates: 2,
  maxFiles: 8,
  maxCommands: 3,
} as const;

export interface GitInfo {
  readonly branch: string;
  readonly summary: string;
  readonly modifiedFiles: string[];
}

export function runGitCommand(args: string[], cwd: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: timeoutMs }, (error, stdout) => {
      if (error || !stdout) {
        resolve('');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function collectGitInfo(workspacePath: string): Promise<GitInfo> {
  const branchRaw = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], workspacePath);
  const statusRaw = await runGitCommand(['status', '-s'], workspacePath);
  const diffRaw = await runGitCommand(['diff', '--stat'], workspacePath);

  const branch = branchRaw || '[No disponible]';

  // Extraer lista de archivos modificados desde git status
  const modifiedFiles: string[] = [];
  if (statusRaw) {
    const lines = statusRaw.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const file = parts.slice(1).join(' ');
      if (file && !modifiedFiles.includes(file)) {
        modifiedFiles.push(file);
      }
    }
  }

  // Generar resumen combinado (status -s + diff --stat)
  const combinedSummary = [statusRaw, diffRaw].filter(Boolean).join('\n---\n');
  const summary = truncateGitSummary(combinedSummary);

  return {
    branch,
    summary: summary || '[Consultar git status]',
    modifiedFiles: modifiedFiles.slice(0, LIMITS.maxFiles),
  };
}

export function truncateGitSummary(rawSummary: string): string {
  if (!rawSummary || !rawSummary.trim()) {
    return '[Consultar git status]';
  }

  const lines = rawSummary.trim().split('\n');
  const truncatedLines = lines.slice(0, LIMITS.gitLines);
  let result = truncatedLines.join('\n');

  if (result.length > LIMITS.gitChars) {
    result = result.slice(0, LIMITS.gitChars) + '\n... [TRUNCADO]';
  } else if (lines.length > LIMITS.gitLines) {
    result += '\n... [TRUNCADO]';
  }

  return result;
}

export interface ConversationTurnInputs {
  readonly userPrompts: string[];
  readonly lastAssistantReply?: string | null;
  readonly commands?: { command: string; exitCode: number | null }[];
  readonly touchedFiles?: string[];
}

export function buildMigrationSnapshot(
  workspacePath: string,
  gitInfo: GitInfo,
  turns: ConversationTurnInputs
): MigrationSnapshot {
  const safeWorkspace = workspacePath ? sanitizePath(workspacePath) : '[No disponible]';

  // Historial acotado
  const firstUserRaw = turns.userPrompts[0] || '[No disponible]';
  const firstUser = firstUserRaw.length > LIMITS.firstUserChars
    ? firstUserRaw.slice(0, LIMITS.firstUserChars) + '... [TRUNCADO]'
    : firstUserRaw;

  const lastUserRaw = turns.userPrompts[turns.userPrompts.length - 1] || '[No disponible]';
  const lastUser = lastUserRaw.length > LIMITS.lastUserChars
    ? lastUserRaw.slice(0, LIMITS.lastUserChars) + '... [TRUNCADO]'
    : lastUserRaw;

  // Intermedios (entre el primero y el último)
  const intermediateCandidates = turns.userPrompts.slice(1, -1);
  const intermediates: string[] = [];
  if (intermediateCandidates.length > 0) {
    const step = Math.max(1, Math.floor(intermediateCandidates.length / LIMITS.maxIntermediates));
    for (let i = 0; i < intermediateCandidates.length && intermediates.length < LIMITS.maxIntermediates; i += step) {
      const raw = intermediateCandidates[i]!;
      const truncated = raw.length > LIMITS.intermediateChars
        ? raw.slice(0, LIMITS.intermediateChars) + '... [TRUNCADO]'
        : raw;
      intermediates.push(truncated);
    }
  }

  // Última respuesta del asistente (los finales 400 chars)
  let lastAssistant = '[No disponible]';
  if (turns.lastAssistantReply && turns.lastAssistantReply.trim()) {
    const rawAssistant = turns.lastAssistantReply.trim();
    if (rawAssistant.length > LIMITS.lastAssistantChars) {
      lastAssistant = '... [TRUNCADO] ' + rawAssistant.slice(-LIMITS.lastAssistantChars);
    } else {
      lastAssistant = rawAssistant;
    }
  }

  // Archivos combinados de git y herramientas
  const filesSet = new Set<string>(gitInfo.modifiedFiles);
  if (turns.touchedFiles) {
    for (const f of turns.touchedFiles) {
      if (filesSet.size < LIMITS.maxFiles) {
        filesSet.add(sanitizePath(f));
      }
    }
  }

  // Últimos comandos
  const lastCommands = turns.commands ? turns.commands.slice(-LIMITS.maxCommands) : undefined;

  return {
    environment: {
      workspace: safeWorkspace,
      gitBranch: gitInfo.branch,
      gitSummary: gitInfo.summary,
    },
    lastInteraction: {
      lastAssistant,
      lastUser,
    },
    boundedHistory: {
      firstUser,
      intermediates,
    },
    modifiedFiles: Array.from(filesSet).slice(0, LIMITS.maxFiles),
    lastCommands,
    resumeDirective: 'Continúa la tarea a partir del estado actual y los archivos modificados indicados en este snapshot sin reiniciar el razonamiento previo.',
  };
}

export function formatMigrationSnapshot(snapshot: MigrationSnapshot): string {
  const lines: string[] = [];

  lines.push('# Snapshot de Migración — Context Auditor');
  lines.push('');
  lines.push('## Entorno');
  lines.push(`- **Workspace**: \`${snapshot.environment.workspace}\``);
  lines.push(`- **Rama Git**: \`${snapshot.environment.gitBranch}\``);
  lines.push('- **Resumen Git**:');
  lines.push('```text');
  lines.push(snapshot.environment.gitSummary);
  lines.push('```');
  lines.push('');

  lines.push('## Última Interacción');
  lines.push('### Última instrucción del usuario');
  lines.push(snapshot.lastInteraction.lastUser);
  lines.push('');
  lines.push('### Extracto final de la última respuesta del asistente');
  lines.push(snapshot.lastInteraction.lastAssistant);
  lines.push('');

  lines.push('## Historial Acotado');
  lines.push(`- **Instrucción inicial**: ${snapshot.boundedHistory.firstUser}`);
  if (snapshot.boundedHistory.intermediates.length > 0) {
    snapshot.boundedHistory.intermediates.forEach((inter, idx) => {
      lines.push(`- **Paso intermedio ${idx + 1}**: ${inter}`);
    });
  }
  lines.push('');

  lines.push('## Archivos Modificados');
  if (snapshot.modifiedFiles.length > 0) {
    snapshot.modifiedFiles.forEach(f => lines.push(`- \`${f}\``));
  } else {
    lines.push('- [No se registran archivos modificados]');
  }
  lines.push('');

  if (snapshot.lastCommands && snapshot.lastCommands.length > 0) {
    lines.push('## Últimos Comandos');
    snapshot.lastCommands.forEach(c => {
      const exitStr = c.exitCode !== null ? `(código ${c.exitCode})` : '(código no disponible)';
      lines.push(`- \`${c.command}\` ${exitStr}`);
    });
    lines.push('');
  }

  lines.push('## Directiva de Reanudación');
  lines.push(snapshot.resumeDirective);

  return lines.join('\n');
}
