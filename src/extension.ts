/**
 * AG Pro Quota — Punto de entrada y orquestador del ciclo de vida (v1.3.0 Integrado)
 *
 * Responsabilidades:
 * - Inicialización ordenada (Logger, Configuración, i18n, StatusBar de Cuota y Context Auditor).
 * - Un solo vigilante de archivos (SessionWatcher) y un solo sondeo periódico (startRefreshLoop).
 * - Aislamiento estricto de fallos del auditor mediante try/catch, sin afectar la cuota.
 * - Registro de todos los comandos de Cuota y Context Auditor.
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
import { showDashboard, updateDashboardIfOpen, DashboardViewProvider } from './dashboard/dashboardProvider';
import { showQuickOverview } from './quickPick';
import { discoverServer } from './discovery';
import { QuotaHistoryManager } from './historyManager';
import { auditTokens, type TokenAuditSnapshot } from './phase2/tokenAuditor';
import { CalibrationManager } from './phase2/calibrationManager';
import type { QuotaSnapshot, AgProConfig, StatusBarPoolView } from './types';

// Módulos integrados del Context Auditor
import { SessionWatcher } from './context/sessionWatcher';
import { StatusBarController } from './context/statusBarController';
import { readSessionContext, readConversationForSnapshot } from './context/dbReader';
import {
  assessContextHealth,
  resolveModelFamily,
  type HealthEvaluatorConfig,
  DEFAULT_HEALTH_CONFIG,
} from './context/healthEvaluator';
import {
  collectGitInfo,
  buildMigrationSnapshot,
  formatMigrationSnapshot,
} from './context/snapshotGenerator';
import { formatDiagnostics } from './context/diagnosticsFormatter';
import type { HealthAssessment, InferenceStep, SchemaGuardResult } from './context/types';
import type { PanelRenderData } from './context/panelHtml';

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let statusBar: StatusBarManager | null = null;
let contextStatusBar: StatusBarController | null = null;
let sessionWatcher: SessionWatcher | null = null;

let lastSnapshot: QuotaSnapshot | null = null;
let lastTokenSnapshot: TokenAuditSnapshot | null = null;
let historyManager: QuotaHistoryManager | null = null;
let calibrationManager: CalibrationManager | null = null;
let currentConfig: AgProConfig;

let currentInference: InferenceStep | null = null;
let currentHealth: HealthAssessment | null = null;
let latestContextData: PanelRenderData | null = null;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Logger unificado
  const outputChannel = vscode.window.createOutputChannel('AG Pro Quota');
  logger.init(outputChannel);
  context.subscriptions.push(outputChannel);

  // 2. Configuración inicial
  currentConfig = readConfig();
  logger.setLevel(currentConfig.logLevel);
  logger.info('Iniciando AG Pro Quota v1.3.0...');

  // 3. Internacionalización
  const lang = resolveLanguage(currentConfig.language);
  setLanguage(lang);
  logger.info(`Idioma activo: ${lang}`);

  // 4. Barra de estado, Historial y Calibración de Cuota
  statusBar = new StatusBarManager(context);
  historyManager = new QuotaHistoryManager(context.globalState);
  calibrationManager = new CalibrationManager();

  // 5. Inicialización de Context Auditor (un solo vigilante, sin sondeo duplicado)
  try {
    contextStatusBar = new StatusBarController();
    context.subscriptions.push(contextStatusBar);

    sessionWatcher = new SessionWatcher(context, undefined, { enableInternalPolling: false });
    sessionWatcher.onSessionChange(() => {
      logger.info('Cambio detectado en bases de conversaciones, refrescando cuota y auditor...');
      triggerRefresh();
      refreshContextAuditor();
    });
    sessionWatcher.start();
    context.subscriptions.push({ dispose: () => sessionWatcher?.stop() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Error al iniciar SessionWatcher del auditor: ${msg}`);
  }

  // 6. Registro de comandos de AG Pro Quota
  context.subscriptions.push(
    vscode.commands.registerCommand('agPro.openDashboard', () => {
      if (lastSnapshot) {
        showDashboard(
          context,
          lastSnapshot,
          lastTokenSnapshot,
          currentConfig,
          historyManager,
          calibrationManager,
          () => triggerCombinedRefresh(),
          'quota',
          latestContextData,
        );
      } else {
        statusBar?.setLoading();
        triggerCombinedRefresh().then(() => {
          if (lastSnapshot) {
            showDashboard(
              context,
              lastSnapshot,
              lastTokenSnapshot,
              currentConfig,
              historyManager,
              calibrationManager,
              () => triggerCombinedRefresh(),
              'quota',
              latestContextData,
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
          await triggerCombinedRefresh();
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
      await vscode.workspace
        .getConfiguration('agPro')
        .update('language', nextLang, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(t('lang.switched'));
      if (lastSnapshot) {
        statusBar?.update(lastSnapshot, currentConfig, calibrationManager || undefined);
        updateDashboardIfOpen(
          lastSnapshot,
          lastTokenSnapshot,
          currentConfig,
          historyManager,
          calibrationManager,
          latestContextData,
        );
      }
    }),

    vscode.commands.registerCommand('agPro.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agPro');
    }),

    vscode.commands.registerCommand('agPro.togglePoolView', async () => {
      const current = currentConfig.statusBarPoolView || 'all';
      const isEs = getLanguage() === 'es';
      const items: { label: string; description: string; value: StatusBarPoolView }[] = [
        {
          label: `${current === 'all' ? '$(check) ' : ''}${isEs ? 'Ambos (Gemini & Claude)' : 'Both (Gemini & Claude)'}`,
          description: isEs ? 'Muestra ambos pools en la barra inferior' : 'Show both pools in status bar',
          value: 'all',
        },
        {
          label: `${current === 'gemini' ? '$(check) ' : ''}${isEs ? 'Solo Gemini' : 'Gemini Only'}`,
          description: isEs ? 'Muestra únicamente la cuota de Gemini' : 'Show Gemini pool quota only',
          value: 'gemini',
        },
        {
          label: `${current === 'claude' ? '$(check) ' : ''}${isEs ? 'Solo Claude / GPT' : 'Claude / GPT Only'}`,
          description: isEs ? 'Muestra únicamente la cuota de Claude & GPT' : 'Show Claude & GPT pool quota only',
          value: 'claude',
        },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: isEs ? 'AG Pro: Vista de Pools en Barra de Estado' : 'AG Pro: Status Bar Pool View',
        placeHolder: isEs ? 'Selecciona qué pools mostrar' : 'Select pools to display',
      });

      if (pick) {
        await vscode.workspace
          .getConfiguration('agPro')
          .update('statusBar.poolView', pick.value, vscode.ConfigurationTarget.Global);
        currentConfig = readConfig();
        if (lastSnapshot) {
          statusBar?.update(lastSnapshot, currentConfig);
        }
      }
    }),

    vscode.commands.registerCommand('agPro.diagnose', async () => {
      await runDiagnostic();
    }),
  );

  // 7. Registro de comandos del Context Auditor
  context.subscriptions.push(
    vscode.commands.registerCommand('contextAuditor.copySnapshot', async () => {
      try {
        const active = sessionWatcher?.state.activeSession;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath =
          workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';

        const gitInfo = await collectGitInfo(workspacePath);
        const turns = active
          ? readConversationForSnapshot(active.dbPath, 200)
          : {
              userPrompts: [],
              lastAssistantReply: null,
              commands: [],
              touchedFiles: [],
            };

        const snapshot = buildMigrationSnapshot(workspacePath, gitInfo, turns);
        const markdown = formatMigrationSnapshot(snapshot);

        await vscode.env.clipboard.writeText(markdown);
        vscode.window.showInformationMessage(
          'Context Auditor: Snapshot de migración copiado al portapapeles.',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error al generar Snapshot de migración: ${msg}`);
        vscode.window.showErrorMessage(`Context Auditor: Error al copiar snapshot (${msg})`);
      }
    }),

    vscode.commands.registerCommand('contextAuditor.selectSession', async () => {
      try {
        await sessionWatcher?.promptSessionSelection();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error al seleccionar sesión: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('contextAuditor.openPanel', () => {
      try {
        if (lastSnapshot) {
          showDashboard(
            context,
            lastSnapshot,
            lastTokenSnapshot,
            currentConfig,
            historyManager,
            calibrationManager,
            () => triggerCombinedRefresh(),
            'context',
            latestContextData,
          );
        } else {
          statusBar?.setLoading();
          triggerCombinedRefresh().then(() => {
            if (lastSnapshot) {
              showDashboard(
                context,
                lastSnapshot,
                lastTokenSnapshot,
                currentConfig,
                historyManager,
                calibrationManager,
                () => triggerCombinedRefresh(),
                'context',
                latestContextData,
              );
            }
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error al abrir panel de Context Auditor: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('contextAuditor.diagnostics', () => {
      try {
        const active = sessionWatcher?.state.activeSession ?? null;
        const cfg = getContextAuditorConfig();
        const limitSteps = vscode.workspace
          .getConfiguration('contextAuditor')
          .get<number>('stepsLimit', 200);

        let schemaGuard: SchemaGuardResult = {
          ok: false,
          statusMessage: 'Sin base de datos activa',
          missingColumns: [],
        };
        let stepsRead = 0;
        let inference = currentInference;
        let health = currentHealth;

        if (active) {
          const sessionRes = readSessionContext(active.dbPath, limitSteps);
          schemaGuard = sessionRes.guard;
          stepsRead = sessionRes.totalStepsRead;
          if (sessionRes.guard.ok) {
            inference = sessionRes.lastInference;
            if (inference) {
              health = assessContextHealth(
                inference.usage,
                inference.modelName ?? inference.modelSlug,
                inference.latencyMs,
                cfg,
                inference.modelId,
              );
            }
          }
        }

        const selectionMethod = active?.isPinned ? 'pinned' : active ? 'mtime_auto' : 'none';
        const rawFamily: 'gemini' | 'claude' | 'unknown' =
          cfg.modelFamily === 'auto'
            ? resolveModelFamily('auto', inference?.modelName ?? inference?.modelSlug)
            : cfg.modelFamily;

        const detectionMethod =
          cfg.modelFamily !== 'auto'
            ? `Configuración manual forzada (contextAuditor.modelFamily = ${cfg.modelFamily})`
            : rawFamily !== 'unknown'
              ? inference?.modelId
                ? `Catálogo gen_metadata en tiempo de ejecución (ID: ${inference.modelId}) conciliado por subcadena "${rawFamily}"`
                : `Subcadena "${rawFamily}" en identificador de modelo (${inference?.modelName ?? inference?.modelSlug})`
              : inference?.modelId
                ? `Modelo no reconocido en gen_metadata (ID: ${inference.modelId})`
                : 'Sin datos de modelo identificables (modelo desconocido)';

        const diagText = formatDiagnostics({
          nodeVersion: process.versions.node,
          electronVersion: process.versions['electron'],
          schemaGuard,
          activeSession: active,
          selectionMethod,
          stepsRead,
          stepsLimit: limitSteps,
          lastInference: inference,
          health,
          detectedFamily: rawFamily,
          detectionMethod,
          config: {
            ...cfg,
            stepsLimit: limitSteps,
          },
        });

        logger.show();
        logger.info('\n' + diagText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error en diagnóstico de Context Auditor: ${msg}`);
      }
    }),
  );

  // 8. Registrar Webview View Provider para la barra lateral (Activity Bar)
  const dashboardViewProvider = new DashboardViewProvider(context, () => triggerCombinedRefresh());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardViewProvider.viewType,
      dashboardViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // 9. Observador de cambios de configuración
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
          statusBar?.update(lastSnapshot, currentConfig, calibrationManager || undefined);
          updateDashboardIfOpen(
            lastSnapshot,
            lastTokenSnapshot,
            currentConfig,
            historyManager,
            calibrationManager,
            latestContextData,
          );
        }
      }

      if (e.affectsConfiguration('contextAuditor')) {
        refreshContextAuditor();
      }
    }),
  );

  // 10. Iniciar ciclo de refresco periódico y refresco inicial
  startRefreshLoop();
  triggerCombinedRefresh();
}

function isContextAuditorEnabled(): boolean {
  return vscode.workspace.getConfiguration('contextAuditor').get<boolean>('enabled', true);
}

function getContextAuditorConfig(): HealthEvaluatorConfig {
  const cfg = vscode.workspace.getConfiguration('contextAuditor');
  return {
    kCache: cfg.get<number>('kCache', DEFAULT_HEALTH_CONFIG.kCache),
    modelFamily: cfg.get<'auto' | 'gemini' | 'claude'>('modelFamily', DEFAULT_HEALTH_CONFIG.modelFamily),
    thresholdProfile: cfg.get<'provisional' | 'observed'>('thresholdProfile', 'observed'),
    windowGemini: cfg.get<number>('windowGemini', DEFAULT_HEALTH_CONFIG.windowGemini),
    windowClaude: cfg.get<number>('windowClaude', DEFAULT_HEALTH_CONFIG.windowClaude),
    thresholdGeminiYellow: cfg.get<number>(
      'thresholdGeminiYellow',
      DEFAULT_HEALTH_CONFIG.thresholdGeminiYellow,
    ),
    thresholdGeminiRed: cfg.get<number>(
      'thresholdGeminiRed',
      DEFAULT_HEALTH_CONFIG.thresholdGeminiRed,
    ),
    thresholdClaudeYellow: cfg.get<number>(
      'thresholdClaudeYellow',
      DEFAULT_HEALTH_CONFIG.thresholdClaudeYellow,
    ),
    thresholdClaudeRed: cfg.get<number>(
      'thresholdClaudeRed',
      DEFAULT_HEALTH_CONFIG.thresholdClaudeRed,
    ),
    enableLatencyCriterion: false,
  };
}

function refreshContextAuditor(): void {
  if (!contextStatusBar) return;

  if (!isContextAuditorEnabled()) {
    contextStatusBar.hide();
    latestContextData = null;
    return;
  }

  contextStatusBar.show();

  try {
    const active = sessionWatcher?.state.activeSession ?? null;
    if (!active) {
      contextStatusBar.setInactive('Auditor: Sin sesión');
      currentInference = null;
      currentHealth = null;
      latestContextData = null;
      updateDashboardContextData();
      return;
    }

    const cfg = getContextAuditorConfig();
    const limitSteps = vscode.workspace
      .getConfiguration('contextAuditor')
      .get<number>('stepsLimit', 200);
    const sessionRes = readSessionContext(active.dbPath, limitSteps);

    if (!sessionRes.guard.ok) {
      contextStatusBar.setInactive(sessionRes.guard.statusMessage);
      currentInference = null;
      currentHealth = null;
      latestContextData = null;
      updateDashboardContextData();
      return;
    }

    currentInference = sessionRes.lastInference;
    if (currentInference) {
      currentHealth = assessContextHealth(
        currentInference.usage,
        currentInference.modelName ?? currentInference.modelSlug,
        currentInference.latencyMs,
        cfg,
        currentInference.modelId,
      );
    } else {
      currentHealth = null;
    }

    contextStatusBar.update(
      active,
      currentInference,
      currentHealth,
      sessionWatcher?.state.hasContention ?? false,
    );

    latestContextData = {
      session: active,
      inference: currentInference,
      health: currentHealth,
      contentionNotice: sessionWatcher?.state.hasContention ?? false,
      estimatedComposition: {
        userPercent: 30,
        toolsSystemPercent: 70,
      },
    };

    updateDashboardContextData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Error en Context Auditor: ${msg}`);
  }
}

function updateDashboardContextData(): void {
  if (lastSnapshot && currentConfig) {
    updateDashboardIfOpen(
      lastSnapshot,
      lastTokenSnapshot,
      currentConfig,
      historyManager,
      calibrationManager,
      latestContextData,
    );
  }
}

async function triggerCombinedRefresh(): Promise<void> {
  await triggerRefresh();
  refreshContextAuditor();
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
    try {
      sessionWatcher?.scan();
    } catch (err) {
      logger.warn(`Error en escaneo periódico de sesión: ${err}`);
    }
    triggerRefresh();
    refreshContextAuditor();
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
      Promise.resolve()
        .then(() => auditTokens())
        .catch((err) => {
          logger.warn(`Error auditando tokens: ${err}`);
          return null;
        }),
    ]);

    if (quotaRaw) {
      calibrationManager?.recordQuotaRaw(quotaRaw);
    }
    if (tokenSnapshot?.collectedStepUsages && tokenSnapshot.collectedStepUsages.length > 0) {
      calibrationManager?.recordStepUsages(tokenSnapshot.collectedStepUsages);
      calibrationManager?.recalculate();
    }

    const snapshot = buildSnapshot(quotaRaw, userStatusRaw, latencyMs);
    lastSnapshot = snapshot;
    lastTokenSnapshot = tokenSnapshot;

    historyManager?.recordSnapshot(snapshot);
    statusBar?.update(snapshot, currentConfig, calibrationManager || undefined);
    checkAndNotify(snapshot, currentConfig);
    updateDashboardIfOpen(
      snapshot,
      lastTokenSnapshot,
      currentConfig,
      historyManager,
      calibrationManager,
      latestContextData,
    );
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
 * Comando de Diagnóstico seguro de Cuota
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
  contextStatusBar?.dispose();
  sessionWatcher?.stop();
  resetNotifications();
  logger.info('AG Pro Quota desactivada correctamente.');
  logger.dispose();
}
