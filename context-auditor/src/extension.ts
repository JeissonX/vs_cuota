/**
 * Context Auditor — Extension Entry Point
 *
 * Status bar + panel compacto de salud del contexto y snapshot de migración.
 */

import * as vscode from 'vscode';
import { SessionWatcher } from './sessionWatcher';
import { StatusBarController } from './statusBarController';
import { readSessionContext, readConversationForSnapshot } from './dbReader';
import { assessContextHealth, resolveModelFamily, type HealthEvaluatorConfig, DEFAULT_HEALTH_CONFIG } from './healthEvaluator';
import { collectGitInfo, buildMigrationSnapshot, formatMigrationSnapshot } from './snapshotGenerator';
import { getWebviewContent } from './panelHtml';
import { formatDiagnostics } from './diagnosticsFormatter';
import type { HealthAssessment, InferenceStep } from './types';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarController();
  const watcher = new SessionWatcher(context);

  let currentInference: InferenceStep | null = null;
  let currentHealth: HealthAssessment | null = null;

  function getConfig(): HealthEvaluatorConfig {
    const cfg = vscode.workspace.getConfiguration('contextAuditor');
    return {
      kCache: cfg.get<number>('kCache', DEFAULT_HEALTH_CONFIG.kCache),
      modelFamily: cfg.get<'auto' | 'gemini' | 'claude'>('modelFamily', DEFAULT_HEALTH_CONFIG.modelFamily),
      thresholdProfile: cfg.get<'provisional' | 'observed'>('thresholdProfile', 'observed'),
      windowGemini: cfg.get<number>('windowGemini', DEFAULT_HEALTH_CONFIG.windowGemini),
      windowClaude: cfg.get<number>('windowClaude', DEFAULT_HEALTH_CONFIG.windowClaude),
      thresholdGeminiYellow: cfg.get<number>('thresholdGeminiYellow', DEFAULT_HEALTH_CONFIG.thresholdGeminiYellow),
      thresholdGeminiRed: cfg.get<number>('thresholdGeminiRed', DEFAULT_HEALTH_CONFIG.thresholdGeminiRed),
      thresholdClaudeYellow: cfg.get<number>('thresholdClaudeYellow', DEFAULT_HEALTH_CONFIG.thresholdClaudeYellow),
      thresholdClaudeRed: cfg.get<number>('thresholdClaudeRed', DEFAULT_HEALTH_CONFIG.thresholdClaudeRed),
      enableLatencyCriterion: false,
    };
  }

  function refreshActiveSession(): void {
    const active = watcher.state.activeSession;
    if (!active) {
      statusBar.setInactive('Auditor: Sin sesión');
      currentInference = null;
      currentHealth = null;
      updatePanel();
      return;
    }

    const cfg = getConfig();
    const limitSteps = vscode.workspace.getConfiguration('contextAuditor').get<number>('stepsLimit', 200);
    const sessionRes = readSessionContext(active.dbPath, limitSteps);

    if (!sessionRes.guard.ok) {
      statusBar.setInactive(sessionRes.guard.statusMessage);
      currentInference = null;
      currentHealth = null;
      updatePanel();
      return;
    }

    currentInference = sessionRes.lastInference;
    if (currentInference) {
      currentHealth = assessContextHealth(
        currentInference.usage,
        currentInference.modelName ?? currentInference.modelSlug,
        currentInference.latencyMs,
        cfg,
        currentInference.modelId
      );
    } else {
      currentHealth = null;
    }

    statusBar.update(active, currentInference, currentHealth, watcher.state.hasContention);
    updatePanel();
  }

  function updatePanel(): void {
    if (!currentPanel) return;

    currentPanel.webview.html = getWebviewContent({
      session: watcher.state.activeSession,
      inference: currentInference,
      health: currentHealth,
      contentionNotice: watcher.state.hasContention,
      estimatedComposition: {
        userPercent: 30,
        toolsSystemPercent: 70,
      },
    });
  }

  // 1. Escuchar cambios de sesión y escrituras en SQLite
  watcher.onSessionChange(() => {
    refreshActiveSession();
  });

  // 2. Comando: Copiar Snapshot de Migración
  const copySnapshotCmd = vscode.commands.registerCommand('contextAuditor.copySnapshot', async () => {
    const active = watcher.state.activeSession;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';

    const gitInfo = await collectGitInfo(workspacePath);
    const turns = active ? readConversationForSnapshot(active.dbPath, 200) : {
      userPrompts: [],
      lastAssistantReply: null,
      commands: [],
      touchedFiles: [],
    };

    const snapshot = buildMigrationSnapshot(workspacePath, gitInfo, turns);
    const markdown = formatMigrationSnapshot(snapshot);

    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage('Context Auditor: Snapshot de migración copiado al portapapeles.');
  });

  // 3. Comando: Seleccionar Sesión
  const selectSessionCmd = vscode.commands.registerCommand('contextAuditor.selectSession', async () => {
    await watcher.promptSessionSelection();
  });

  // 4. Comando: Abrir Panel Webview
  const openPanelCmd = vscode.commands.registerCommand('contextAuditor.openPanel', () => {
    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
      currentPanel = vscode.window.createWebviewPanel(
        'contextAuditorPanel',
        'Context Auditor',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
      });

      currentPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'copySnapshot') {
          vscode.commands.executeCommand('contextAuditor.copySnapshot');
        } else if (msg.command === 'selectSession') {
          vscode.commands.executeCommand('contextAuditor.selectSession');
        }
      });
    }

    refreshActiveSession();
  });

  // 5. Comando: Mostrar Diagnóstico en Output Channel
  const outputChannel = vscode.window.createOutputChannel('Context Auditor');
  const diagnosticsCmd = vscode.commands.registerCommand('contextAuditor.diagnostics', () => {
    const active = watcher.state.activeSession;
    const cfg = getConfig();
    const limitSteps = vscode.workspace.getConfiguration('contextAuditor').get<number>('stepsLimit', 200);

    let schemaGuard: import('./types').SchemaGuardResult = {
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
            inference.modelId
          );
        }
      }
    }

    const selectionMethod = active?.isPinned ? 'pinned' : (active ? 'mtime_auto' : 'none');
    const rawFamily: 'gemini' | 'claude' | 'unknown' = cfg.modelFamily === 'auto'
      ? resolveModelFamily('auto', inference?.modelName ?? inference?.modelSlug)
      : cfg.modelFamily;

    const detectionMethod = cfg.modelFamily !== 'auto'
      ? `Configuración manual forzada (contextAuditor.modelFamily = ${cfg.modelFamily})`
      : (rawFamily !== 'unknown'
          ? (inference?.modelId
              ? `Catálogo gen_metadata en tiempo de ejecución (ID: ${inference.modelId}) conciliado por subcadena "${rawFamily}"`
              : `Subcadena "${rawFamily}" en identificador de modelo (${inference?.modelName ?? inference?.modelSlug})`)
          : (inference?.modelId
              ? `Modelo no reconocido en gen_metadata (ID: ${inference.modelId})`
              : 'Sin datos de modelo identificables (modelo desconocido)'));

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

    outputChannel.clear();
    outputChannel.appendLine(diagText);
    outputChannel.show(true);
  });

  // Escuchar cambios en la configuración
  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('contextAuditor')) {
      refreshActiveSession();
    }
  });

  context.subscriptions.push(
    statusBar,
    outputChannel,
    { dispose: () => watcher.stop() },
    copySnapshotCmd,
    selectSessionCmd,
    openPanelCmd,
    diagnosticsCmd,
    configListener
  );

  // Iniciar vigilancia
  watcher.start();
  refreshActiveSession();
}

export function deactivate(): void {
  if (currentPanel) {
    currentPanel.dispose();
  }
}
