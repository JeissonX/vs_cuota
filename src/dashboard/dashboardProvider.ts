/**
 * AG Pro Quota — Dashboard Webview
 *
 * Muestra un panel webview moderno con tarjetas de cuota agrupadas por pool,
 * barras de progreso con colores dinámicos, tabla detallada de modelos,
 * y soporte automático para temas claro y oscuro utilizando variables CSS de VS Code.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig } from '../types';
import { t, getLanguage } from '../i18n';
import { logger } from '../logger';

let currentPanel: vscode.WebviewPanel | null = null;
let latestSnapshot: QuotaSnapshot | null = null;
let latestConfig: AgProConfig | null = null;

/**
 * Abre o enfoca el panel webview del dashboard.
 */
export function showDashboard(
  context: vscode.ExtensionContext,
  snapshot: QuotaSnapshot,
  config: AgProConfig,
  onRefresh: () => void,
): void {
  latestSnapshot = snapshot;
  latestConfig = config;

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    sendUpdate();
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'agProDashboard',
    t('dashboard.title'),
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  currentPanel.webview.html = buildHtml(snapshot, config);

  currentPanel.webview.onDidReceiveMessage(
    (msg: { command: string }) => {
      switch (msg.command) {
        case 'refresh':
          onRefresh();
          break;
        case 'openSettings':
          vscode.commands.executeCommand('agPro.openSettings');
          break;
      }
    },
    undefined,
    context.subscriptions,
  );

  currentPanel.onDidDispose(() => {
    currentPanel = null;
  });
}

/**
 * Actualiza el dashboard si está actualmente abierto y visible.
 */
export function updateDashboardIfOpen(snapshot: QuotaSnapshot, config: AgProConfig): void {
  latestSnapshot = snapshot;
  latestConfig = config;
  if (currentPanel) {
    sendUpdate();
  }
}

function sendUpdate(): void {
  if (!currentPanel || !latestSnapshot || !latestConfig) return;
  try {
    currentPanel.webview.html = buildHtml(latestSnapshot, latestConfig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error al actualizar vista del dashboard: ${msg}`);
  }
}

function buildHtml(snapshot: QuotaSnapshot, _config: AgProConfig): string {
  const lang = getLanguage();
  const isEs = lang === 'es';

  const groupCards = snapshot.groups
    .map((group) => {
      const bucketRows = group.buckets
        .map((b) => {
          const windowLabel =
            b.window === 'weekly'
              ? (isEs ? 'Semanal (7d)' : 'Weekly (7d)')
              : b.window === '5h'
                ? (isEs ? 'Sprint (5h)' : 'Sprint (5h)')
                : b.window;
          const barColor =
            b.remainingPercent > 50 ? '#3fb950' : b.remainingPercent > 20 ? '#f59e0b' : '#ef4444';
          const barWidth = Math.max(2, b.remainingPercent);

          return `
            <div class="bucket">
              <div class="bucket-header">
                <span class="bucket-label">${windowLabel}</span>
                <span class="bucket-percent" style="color: ${barColor}">${b.remainingPercent}%</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${barWidth}%; background: ${barColor};"></div>
              </div>
              <div class="bucket-meta">${isEs ? 'Reinicio en' : 'Resets in'}: ${b.resetCountdown || '-'}</div>
            </div>`;
        })
        .join('');

      return `
        <div class="card">
          <div class="card-title">${group.displayName}</div>
          ${bucketRows}
        </div>`;
    })
    .join('');

  const modelRows = snapshot.models
    .map((m) => {
      const pct = m.remainingPercent !== null ? `${m.remainingPercent}%` : '--%';
      const dot =
        m.remainingPercent !== null
          ? m.remainingPercent > 50
            ? '🟢'
            : m.remainingPercent > 20
              ? '🟡'
              : '🔴'
          : '⚪';
      return `
        <tr>
          <td>${dot} ${m.label}</td>
          <td><strong>${pct}</strong></td>
          <td>${m.resetCountdown || '-'}</td>
          <td><span class="pool-tag">${m.poolName}</span></td>
        </tr>`;
    })
    .join('');

  const statusBadge = snapshot.isConnected
    ? `<span class="badge connected">${isEs ? '🟢 Conectado' : '🟢 Connected'}</span>`
    : `<span class="badge disconnected">${isEs ? '🔴 Sin conexión' : '🔴 Offline'}</span>`;

  const lastSync = snapshot.timestamp.toLocaleTimeString();
  const latency = snapshot.latencyMs !== undefined ? `${snapshot.latencyMs}ms` : '-';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --card-border: var(--vscode-editorWidget-border, #333);
      --muted: var(--vscode-descriptionForeground, #888);
      --accent: var(--vscode-textLink-foreground, #3794ff);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 24px;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .header h1 { font-size: 1.4em; font-weight: 600; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .badge {
      font-size: 0.85em; padding: 3px 10px; border-radius: 4px; font-weight: 500;
    }
    .badge.connected { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }
    .badge.disconnected { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .meta { color: var(--muted); font-size: 0.85em; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .card-title { font-weight: 600; font-size: 1.15em; margin-bottom: 14px; }
    .bucket { margin-bottom: 14px; }
    .bucket:last-child { margin-bottom: 0; }
    .bucket-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .bucket-label { font-size: 0.9em; color: var(--muted); }
    .bucket-percent { font-weight: 700; font-size: 1.1em; }
    .bar-track {
      height: 8px; border-radius: 4px;
      background: var(--card-border); overflow: hidden;
    }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
    .bucket-meta { font-size: 0.8em; color: var(--muted); margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--card-border); }
    th { font-weight: 600; color: var(--muted); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; }
    .pool-tag {
      font-size: 0.8em; padding: 2px 6px; border-radius: 3px;
      background: var(--card-border); color: var(--accent);
    }
    .actions { margin-top: 24px; display: flex; gap: 12px; }
    button {
      background: var(--accent); color: #fff; border: none; padding: 8px 18px;
      border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: 500;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.85; }
    button.secondary { background: var(--card-border); color: var(--fg); }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 ${isEs ? 'Dashboard de Cuota de Antigravity' : 'Antigravity Quota Dashboard'}</h1>
    <div class="header-right">
      ${statusBadge}
      <span class="meta">${isEs ? 'Última sync' : 'Last sync'}: ${lastSync} · ${latency}</span>
    </div>
  </div>

  <div class="cards">${groupCards}</div>

  ${
    snapshot.models.length > 0
      ? `
  <h2 style="font-size: 1.15em; margin-bottom: 12px;">${isEs ? 'Modelos Disponibles' : 'Available Models'}</h2>
  <table>
    <thead>
      <tr>
        <th>${isEs ? 'Modelo' : 'Model'}</th>
        <th>${isEs ? 'Cuota Restante' : 'Remaining Quota'}</th>
        <th>${isEs ? 'Reinicio Estimado' : 'Estimated Reset'}</th>
        <th>Pool</th>
      </tr>
    </thead>
    <tbody>${modelRows}</tbody>
  </table>`
      : ''
  }

  <div class="actions">
    <button onclick="sendMsg('refresh')">${isEs ? '🔄 Refrescar' : '🔄 Refresh'}</button>
    <button class="secondary" onclick="sendMsg('openSettings')">${isEs ? '⚙️ Configuración' : '⚙️ Settings'}</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
}
