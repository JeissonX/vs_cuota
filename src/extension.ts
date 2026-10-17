/**
 * AG Pro Quota — Punto de entrada y orquestador del ciclo de vida
 *
 * Responsabilidades:
 * - Inicialización ordenada (Logger, Configuración, i18n, StatusBar).
 * - Timer único de refresco periódico con intervalo mínimo de 5 segundos.
 * - Registro de todos los comandos (Dashboard, QuickPick, Refresco, Diagnóstico, Configuración).
 * - Comando "agPro: Diagnóstico" para depuración sin revelar datos privados ni tokens.
 * - Limpieza total de recursos en deactivate().
 */

import * as vscode from 'vscode';
import { readConfig } from './config';
import { logger } from './logger';
import { resolveLanguage, setLanguage, t, getLanguage } from './i18n';
import { StatusBarManager } from './statusBar';
import { fetchQuotaSummary, fetchUserStatus } from './quotaClient';
import { buildSnapshot } from './quotaParser';
import { checkAndNotify, resetNotifications } from './notifications';
import { showDashboard, updateDashboardIfOpen } from './dashboard/dashboardProvider';
import { showQuickOverview } from './quickPick';
import { discoverServer } from './discovery';
import { QuotaHistoryManager } from './historyManager';
import { auditTokens, type TokenAuditSnapshot } from './phase2/tokenAuditor';
import type { QuotaSnapshot, AgProConfig } from './types';

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let statusBar: StatusBarManager | null = null;
let lastSnapshot: QuotaSnapshot | null = null;
let lastTokenSnapshot: TokenAuditSnapshot | null = null;
let historyManager: QuotaHistoryManager | null = null;
let currentConfig: AgProConfig;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Logger
  const outputChannel = vscode.window.createOutputChannel('AG Pro Quota');
  logger.init(outputChannel);
  context.subscriptions.push(outputChannel);

  // 2. Configuración inicial
  currentConfig = readConfig();
  logger.setLevel(currentConfig.logLevel);
  logger.info('Iniciando AG Pro Quota v1.0.0...');

  // 3. Internacionalización
  const lang = resolveLanguage(currentConfig.language);
  setLanguage(lang);
  logger.info(`Idioma activo: ${lang}`);

  // 4. Barra de estado e Historial
  statusBar = new StatusBarManager(context);
  historyManager = new QuotaHistoryManager(context.globalState);

  // 5. Registro de comandos
  context.subscriptions.push(
    vscode.commands.registerCommand('agPro.openDashboard', () => {
      if (lastSnapshot) {
        showDashboard(
          context,
          lastSnapshot,
          lastTokenSnapshot,
          currentConfig,
          historyManager,
          () => triggerRefresh(),
        );
      } else {
        statusBar?.setLoading();
        triggerRefresh().then(() => {
          if (lastSnapshot) {
            showDashboard(
              context,
              lastSnapshot,
              lastTokenSnapshot,
              currentConfig,
              historyManager,
              () => triggerRefresh(),
            );
          }
        });
      }
    }),

    vscode.commands.registerCommand('agPro.refresh', () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t('statusBar.connecting'),
          cancellable: false,
        },
        async () => {
          await triggerRefresh();
        },
      );
    }),

    vscode.commands.registerCommand('agPro.quickOverview', () => {
      if (lastSnapshot) {
        showQuickOverview(lastSnapshot, currentConfig, lastTokenSnapshot);
      } else {
        triggerRefresh().then(() => {
          if (lastSnapshot) {
            showQuickOverview(lastSnapshot, currentConfig, lastTokenSnapshot);
          }
        });
      }
    }),

    vscode.commands.registerCommand('agPro.toggleLang', async () => {
      const nextLang = getLanguage() === 'es' ? 'en' : 'es';
      setLanguage(nextLang);
      await vscode.workspace.getConfiguration('agPro').update('language', nextLang, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(t('lang.switched'));
      if (lastSnapshot) {
        statusBar?.update(lastSnapshot, currentConfig);
        updateDashboardIfOpen(lastSnapshot, lastTokenSnapshot, currentConfig, historyManager);
      }
    }),

    vscode.commands.registerCommand('agPro.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agPro');
    }),

    vscode.commands.registerCommand('agPro.diagnose', async () => {
      await runDiagnostic();
    }),
  );

  // 6. Observador de cambios de configuración
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agPro')) {
        const oldInterval = currentConfig.refreshIntervalSeconds;
        currentConfig = readConfig();
        logger.setLevel(currentConfig.logLevel);

        const newLang = resolveLanguage(currentConfig.language);
        setLanguage(newLang);

        if (currentConfig.refreshIntervalSeconds !== oldInterval) {
          logger.info(`Intervalo de refresco actualizado a ${currentConfig.refreshIntervalSeconds}s`);
          startRefreshLoop();
        }

        if (lastSnapshot) {
          statusBar?.update(lastSnapshot, currentConfig);
          updateDashboardIfOpen(lastSnapshot, lastTokenSnapshot, currentConfig, historyManager);
        }
      }
    }),
  );

  // 7. Iniciar ciclo de refresco periódico
  startRefreshLoop();
  triggerRefresh();
}

/**
 * Inicia el temporizador único de refresco.
 */
function startRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  const intervalMs = currentConfig.refreshIntervalSeconds * 1000;
  refreshTimer = setInterval(() => {
    triggerRefresh();
  }, intervalMs);
}

/**
 * Ejecuta una actualización completa de cuota contra el Language Server y auditoría de tokens.
 */
async function triggerRefresh(): Promise<void> {
  try {
    const [{ data: quotaRaw, latencyMs }, userStatusRaw, tokenSnapshot] = await Promise.all([
      fetchQuotaSummary(),
      fetchUserStatus(),
      Promise.resolve().then(() => auditTokens()).catch((err) => {
        logger.warn(`Error auditando tokens: ${err}`);
        return null;
      }),
    ]);

    const snapshot = buildSnapshot(quotaRaw, userStatusRaw, latencyMs);
    lastSnapshot = snapshot;
    lastTokenSnapshot = tokenSnapshot;

    historyManager?.recordSnapshot(snapshot);
    statusBar?.update(snapshot, currentConfig);
    checkAndNotify(snapshot, currentConfig);
    updateDashboardIfOpen(snapshot, lastTokenSnapshot, currentConfig, historyManager);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Error en ciclo de refresco: ${msg}`);

    if (!lastSnapshot) {
      lastSnapshot = {
        timestamp: new Date(),
        isConnected: false,
        groups: [],
        models: [],
        errorMessage: msg,
      };
      statusBar?.update(lastSnapshot, currentConfig);
    }
  }
}

/**
 * Comando de Diagnóstico seguro:
 * Vuelca al OutputChannel el estado de conexión, PID, puerto y las respuestas
 * crudas de los endpoints sanitizando cualquier dato personal y garantizando
 * que el token CSRF NUNCA se muestre en los registros.
 */
async function runDiagnostic(): Promise<void> {
  logger.show();
  logger.info('====================================================');
  logger.info('🔍 DIAGNÓSTICO DEL SISTEMA AG PRO QUOTA');
  logger.info('====================================================');
  logger.info(`Fecha local: ${new Date().toLocaleString()}`);
  logger.info(`Plataforma: ${process.platform} (${process.arch})`);

  logger.info('1. Verificando descubrimiento de proceso y puertos...');
  const conn = await discoverServer(true);
  if (!conn) {
    logger.error('❌ No se encontró ningún proceso activo de Antigravity en el sistema.');
    vscode.window.showErrorMessage('Diagnóstico: No se encontró el proceso de Antigravity.');
    return;
  }

  logger.info(`✅ Proceso detectado: PID ${conn.pid}`);
  logger.info(`✅ Puerto activo validado: ${conn.port}`);
  logger.info('🔒 Token CSRF: [PROTEGIDO - EN MEMORIA]');

  logger.info('2. Consultando endpoint RetrieveUserQuotaSummary...');
  const quotaResult = await fetchQuotaSummary();
  if (quotaResult.data) {
    const sanitizedQuota = sanitizeForLog(quotaResult.data);
    logger.info(`Respuesta RetrieveUserQuotaSummary (Latencia: ${quotaResult.latencyMs}ms):`);
    logger.info(JSON.stringify(sanitizedQuota, null, 2));
  } else {
    logger.warn('⚠️ RetrieveUserQuotaSummary no devolvió datos válidos.');
  }

  logger.info('3. Consultando endpoint GetUserStatus...');
  const statusResult = await fetchUserStatus();
  if (statusResult) {
    const sanitizedStatus = sanitizeForLog(statusResult);
    logger.info('Respuesta GetUserStatus (Sanitizada):');
    logger.info(JSON.stringify(sanitizedStatus, null, 2));
  } else {
    logger.warn('⚠️ GetUserStatus no devolvió datos.');
  }

  logger.info('====================================================');
  logger.info('✅ Diagnóstico finalizado con éxito.');
  logger.info('====================================================');
  vscode.window.showInformationMessage(t('diagnostic.done'));
}

/**
 * Reemplaza de forma preventiva cualquier correo, nombre de usuario o credencial por REDACTED.
 */
function sanitizeForLog(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj
      .replace(/[\w.-]+@[\w.-]+\.\w+/g, 'REDACTED')
      .replace(/(--csrf_token[\s=]+)[^\s&]+/gi, '$1REDACTED');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLog);
  }
  if (obj !== null && typeof obj === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lower = k.toLowerCase();
      if (
        lower === 'email' ||
        lower === 'name' ||
        lower === 'username' ||
        lower.includes('csrf') ||
        lower.includes('token')
      ) {
        copy[k] = 'REDACTED';
      } else {
        copy[k] = sanitizeForLog(v);
      }
    }
    return copy;
  }
  return obj;
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  statusBar?.dispose();
  resetNotifications();
  logger.info('AG Pro Quota desactivada correctamente.');
  logger.dispose();
}
