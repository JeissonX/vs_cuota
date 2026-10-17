import * as vscode from 'vscode';
import { readConfig } from './config';
import { logger } from './logger';
import { resolveLanguage, setLanguage, t } from './i18n';

/**
 * Activa la extensión AG Pro Quota (Hito 1: Cimientos inicializados).
 */
export function activate(context: vscode.ExtensionContext): void {
  // 1. Logger
  const outputChannel = vscode.window.createOutputChannel('AG Pro Quota');
  logger.init(outputChannel);
  context.subscriptions.push(outputChannel);

  // 2. Config
  const config = readConfig();
  logger.setLevel(config.logLevel);
  logger.info('AG Pro Quota inicializando cimientos...');

  // 3. i18n
  const lang = resolveLanguage(config.language);
  setLanguage(lang);
  logger.info(`Idioma activo: ${lang} (${t('dashboard.title')})`);
}

/**
 * Desactiva la extensión y limpia recursos.
 */
export function deactivate(): void {
  logger.dispose();
}
