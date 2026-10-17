/**
 * AG Pro Quota — Servicio de configuración
 * Lee y valida ajustes bajo el prefijo agPro.*
 */

import * as vscode from 'vscode';
import type { AgProConfig, StatusBarFormat, StatusBarWindowsMode } from './types';

const VALID_FORMATS: StatusBarFormat[] = [
  'icon',
  'dot',
  'percent',
  'compact',
  'namePercent',
  'standard',
];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const VALID_LANGUAGES = ['auto', 'es', 'en'] as const;

/**
 * Lee la configuración completa desde workspace settings bajo agPro.*
 * Garantiza un intervalo mínimo de 5 segundos y valores acotados.
 */
export function readConfig(): AgProConfig {
  const cfg = vscode.workspace.getConfiguration('agPro');

  const rawFormat = cfg.get<string>('statusBarFormat', 'standard');
  const format: StatusBarFormat = VALID_FORMATS.includes(rawFormat as StatusBarFormat)
    ? (rawFormat as StatusBarFormat)
    : 'standard';

  const rawShowWindows = cfg.get<string>('statusBar.showWindows', 'both');
  const statusBarShowWindows: StatusBarWindowsMode =
    rawShowWindows === 'binding' ? 'binding' : 'both';

  const statusBarPools = cfg.get<string[]>('statusBar.pools', []);

  const rawLogLevel = cfg.get<string>('logLevel', 'info');
  const logLevel = VALID_LOG_LEVELS.includes(rawLogLevel as (typeof VALID_LOG_LEVELS)[number])
    ? (rawLogLevel as AgProConfig['logLevel'])
    : 'info';

  const rawLang = cfg.get<string>('language', 'auto');
  const language = VALID_LANGUAGES.includes(rawLang as (typeof VALID_LANGUAGES)[number])
    ? (rawLang as AgProConfig['language'])
    : 'auto';

  const warningRaw = cfg.get<number>('warningThreshold', 30);
  const criticalRaw = cfg.get<number>('criticalThreshold', 10);

  return {
    refreshIntervalSeconds: Math.max(5, cfg.get<number>('refreshIntervalSeconds', 15)),
    statusBarFormat: format,
    statusBarShowWindows,
    statusBarPools,
    warningThreshold: Math.min(99, Math.max(1, warningRaw)),
    criticalThreshold: Math.min(99, Math.max(1, criticalRaw)),
    language,
    pinnedModels: cfg.get<string[]>('pinnedModels', []),
    notificationsEnabled: cfg.get<boolean>('notificationsEnabled', true),
    logLevel,
  };
}
