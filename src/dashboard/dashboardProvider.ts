/**
 * AG Pro Quota — Dashboard Webview (v1.1.0)
 *
 * Muestra un panel webview moderno y rico con:
 * - Tarjetas por pool para ambas ventanas (5h y semanal), destacando la ventana limitante.
 * - Indicadores de reinicio, modelos asociados y advertencia si 5h está en 0%.
 * - Sparklines SVG nativos de historial de cuota (7 días, intervalos de 5 min).
 * - Sección de tokens de la sesión activa con métricas (entrada, salida, razonamiento, caché N/A, turnos).
 * - Tabla "Tokens por petición" ordenada de más reciente a más antigua con barra de consumo proporcional.
 * - Sección global con totales acumulados y lista de sesiones recientes.
 * - Alternancia instantánea entre formato compacto (742.7K) y exacto (742,700).
 * - 100% i18n es/en, soporte de temas claro/oscuro de VS Code, sin dependencias externas ni red.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig } from '../types';
import type { TokenAuditSnapshot } from '../phase2/tokenAuditor';
import type { QuotaHistoryManager } from '../historyManager';
import { t, getLanguage } from '../i18n';
import { logger } from '../logger';

let currentPanel: vscode.WebviewPanel | null = null;
let latestSnapshot: QuotaSnapshot | null = null;
let latestTokenSnapshot: TokenAuditSnapshot | null = null;
let latestConfig: AgProConfig | null = null;
let latestHistoryManager: QuotaHistoryManager | null = null;

/**
 * Abre o enfoca el panel webview del dashboard.
 */
export function showDashboard(
  context: vscode.ExtensionContext,
  snapshot: QuotaSnapshot,
  tokenSnapshot: TokenAuditSnapshot | null,
  config: AgProConfig,
  historyManager: QuotaHistoryManager | null,
  onRefresh: () => void,
): void {
  latestSnapshot = snapshot;
  latestTokenSnapshot = tokenSnapshot;
  latestConfig = config;
  latestHistoryManager = historyManager;

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

  currentPanel.webview.html = buildHtml(snapshot, tokenSnapshot, config, historyManager);

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
export function updateDashboardIfOpen(
  snapshot: QuotaSnapshot,
  tokenSnapshot: TokenAuditSnapshot | null,
  config: AgProConfig,
  historyManager: QuotaHistoryManager | null,
): void {
  latestSnapshot = snapshot;
  latestTokenSnapshot = tokenSnapshot;
  latestConfig = config;
  latestHistoryManager = historyManager;
  if (currentPanel) {
    sendUpdate();
  }
}

function sendUpdate(): void {
  if (!currentPanel || !latestSnapshot || !latestConfig) return;
  try {
    currentPanel.webview.html = buildHtml(
      latestSnapshot,
      latestTokenSnapshot,
      latestConfig,
      latestHistoryManager,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Error al actualizar vista del dashboard: ${msg}`);
  }
}

function formatCompact(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

function formatExact(num: number): string {
  return num.toLocaleString();
}

function dualNum(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return `<span class="val-compact">${formatCompact(num)}</span><span class="val-exact" style="display:none;">${formatExact(num)}</span>`;
}

function buildHtml(
  snapshot: QuotaSnapshot,
  tokenSnapshot: TokenAuditSnapshot | null,
  _config: AgProConfig,
  historyManager: QuotaHistoryManager | null,
): string {
  const lang = getLanguage();
  const isEs = lang === 'es';

  // 1. Tarjetas por pool
  const groupCards = snapshot.groups
    .map((group) => {
      // Determinar la ventana limitante del pool
      let lowestPct = 101;
      for (const b of group.buckets) {
        if (b.remainingPercent < lowestPct) {
          lowestPct = b.remainingPercent;
        }
      }

      // Modelos que pertenecen a este pool
      const poolModels = snapshot.models.filter(
        (m) =>
          m.poolName.toLowerCase().includes(group.displayName.toLowerCase()) ||
          group.displayName.toLowerCase().includes(m.poolName.toLowerCase()),
      );

      const modelsPills = poolModels
        .map((m) => `<span class="model-pill">${m.label}</span>`)
        .join('');

      const bucketRows = group.buckets
        .map((b) => {
          const isBinding = b.remainingPercent === lowestPct;
          const windowLabel =
            b.window === 'weekly'
              ? (isEs ? 'Semanal (7d)' : 'Weekly (7d)')
              : b.window === '5h'
                ? (isEs ? 'Sprint (5h)' : 'Sprint (5h)')
                : b.window;
          const barColor =
            b.remainingPercent > 50 ? '#3fb950' : b.remainingPercent > 20 ? '#f59e0b' : '#ef4444';
          const barWidth = Math.max(2, b.remainingPercent);

          const sparkline = historyManager
            ? historyManager.generateSparklineSvg(group.displayName, b.window, 120, 24)
            : '';

          const resetTimeFormatted = b.resetTime
            ? b.resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

          const isExhausted5h = b.window === '5h' && b.remainingPercent === 0;

          return `
            <div class="bucket ${isBinding ? 'bucket-binding' : ''}">
              <div class="bucket-header">
                <div class="bucket-title-line">
                  <span class="bucket-label">${windowLabel}</span>
                  ${isBinding ? `<span class="binding-badge">★ ${t('dashboard.bindingBadge')}</span>` : ''}
                </div>
                <div class="bucket-values">
                  <span class="bucket-percent" style="color: ${barColor}">${b.remainingPercent}%</span>
                  <div class="sparkline-box">${sparkline}</div>
                </div>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${barWidth}%; background: ${barColor};"></div>
              </div>
              <div class="bucket-meta">
                <span>${t('dashboard.resetIn')}: <strong>${b.resetCountdown || '-'}</strong> ${resetTimeFormatted ? `(${resetTimeFormatted})` : ''}</span>
              </div>
              ${
                isExhausted5h
                  ? `<div class="exhausted-alert">
                      ${t('statusBar.fiveHourExhausted')
                        .replace('{time}', resetTimeFormatted)
                        .replace('{countdown}', b.resetCountdown || '-')}
                    </div>`
                  : ''
              }
            </div>`;
        })
        .join('');

      const lowerName = group.displayName.toLowerCase();
      const poolCategory =
        lowerName.includes('gemini') || lowerName.includes('argon') || lowerName.includes('flash')
          ? 'gemini'
          : lowerName.includes('claude') ||
              lowerName.includes('gpt') ||
              lowerName.includes('sonnet') ||
              lowerName.includes('opus')
            ? 'claude'
            : 'other';

      return `
        <div class="card pool-card" data-pool="${poolCategory}">
          <div class="card-title-row">
            <span class="card-title">${group.displayName}</span>
          </div>
          ${modelsPills ? `<div class="models-row">${modelsPills}</div>` : ''}
          ${bucketRows}
        </div>`;
    })
    .join('');

  // 2. Tokens de la Sesión Activa
  let sessionTokensHtml = '';
  if (!tokenSnapshot || !tokenSnapshot.isAvailable) {
    const reason = tokenSnapshot?.unavailableReason || t('tokens.notAvailable');
    sessionTokensHtml = `
      <div class="banner info-banner">
        <span>ℹ️ ${t('tokens.notAvailable')}: ${reason}</span>
      </div>`;
  } else if (!tokenSnapshot.activeSession) {
    sessionTokensHtml = `
      <div class="banner info-banner">
        <span>${t('tokens.noRequests')}</span>
      </div>`;
  } else {
    const sess = tokenSnapshot.activeSession;
    const maxReqTokens = Math.max(1, ...sess.requests.map((r) => r.totalTokens));

    const requestRows = sess.requests
      .map((r) => {
        const barPct = Math.max(3, Math.round((r.totalTokens / maxReqTokens) * 100));
        const durStr = r.durationSeconds !== null ? `${r.durationSeconds}s` : '-';
        const speedStr = r.outputSpeedTokensPerSec !== null ? `${r.outputSpeedTokensPerSec} t/s` : '-';

        return `
          <tr>
            <td><span class="step-badge">#${r.stepIndex}</span></td>
            <td><span class="model-tag">${r.modelName}</span></td>
            <td>${dualNum(r.outputTokens)}</td>
            <td>${dualNum(r.thoughtTokens)}</td>
            <td>${dualNum(r.promptTokens)}</td>
            <td><strong>${dualNum(r.totalTokens)}</strong></td>
            <td>${durStr}</td>
            <td>${speedStr}</td>
            <td class="bar-cell">
              <div class="req-bar-track">
                <div class="req-bar-fill" style="width: ${barPct}%;"></div>
              </div>
            </td>
          </tr>`;
      })
      .join('');

    sessionTokensHtml = `
      <div class="session-section">
        <div class="session-header">
          <div>
            <h3>${t('tokens.sessionTitle')}</h3>
            <span class="session-id-text">${isEs ? 'ID de sesión' : 'Session ID'}: <code>${sess.sessionId}</code></span>
          </div>
          <div class="session-turns-meta">
            <span>${t('tokens.turns')}: <strong>${sess.userTurns}</strong> ${isEs ? 'usuario' : 'user'} · <strong>${sess.modelTurns}</strong> ${isEs ? 'modelo' : 'model'}</span>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">${t('tokens.total')}</span>
            <span class="metric-val accent">${dualNum(sess.totalTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.input')}</span>
            <span class="metric-val">${dualNum(sess.totalPromptTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.output')}</span>
            <span class="metric-val">${dualNum(sess.totalOutputTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.thought')}</span>
            <span class="metric-val">${dualNum(sess.totalThoughtTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.cache')}</span>
            <span class="metric-val muted-val">${sess.cacheRatioFormatted}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.average')}</span>
            <span class="metric-val">${dualNum(sess.averageTokensPerRequest)}</span>
          </div>
        </div>

        <h4 style="margin: 18px 0 10px 0; font-size: 1.05em;">${t('tokens.perRequestTitle')} (${sess.requests.length})</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('tokens.step')}</th>
                <th>${isEs ? 'Modelo' : 'Model'}</th>
                <th>${t('tokens.output')}</th>
                <th>${t('tokens.thought')}</th>
                <th>${t('tokens.prompt')}</th>
                <th>${t('tokens.total')}</th>
                <th>${t('tokens.duration')}</th>
                <th>${t('tokens.speed')}</th>
                <th style="min-width: 90px;">${isEs ? 'Consumo' : 'Usage'}</th>
              </tr>
            </thead>
            <tbody>
              ${requestRows || `<tr><td colspan="9" style="text-align: center; color: var(--muted);">${t('tokens.noRequests')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // 3. Sección Global y Listado de Sesiones
  let globalSectionHtml = '';
  if (tokenSnapshot && tokenSnapshot.globalSummary) {
    const glob = tokenSnapshot.globalSummary;
    const sessionRows = glob.sessions
      .map((s) => {
        const modDate = new Date(s.lastModifiedMs).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const activeBadge = s.isActive
          ? `<span class="active-badge">${t('tokens.activeBadge')}</span>`
          : '';
        return `
          <tr class="${s.isActive ? 'active-session-row' : ''}">
            <td><code>${s.sessionId.substring(0, 14)}...</code> ${activeBadge}</td>
            <td>${modDate}</td>
            <td><strong>${dualNum(s.totalTokens)}</strong></td>
          </tr>`;
      })
      .join('');

    globalSectionHtml = `
      <div class="global-section">
        <h3 style="margin-bottom: 12px;">${t('tokens.globalTitle')}</h3>
        <div class="metrics-grid" style="margin-bottom: 16px;">
          <div class="metric-card">
            <span class="metric-label">${t('tokens.total')}</span>
            <span class="metric-val accent">${dualNum(glob.totalTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.input')}</span>
            <span class="metric-val">${dualNum(glob.totalPromptTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.output')}</span>
            <span class="metric-val">${dualNum(glob.totalOutputTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${t('tokens.thought')}</span>
            <span class="metric-val">${dualNum(glob.totalThoughtTokens)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">${isEs ? 'Sesiones totales' : 'Total Sessions'}</span>
            <span class="metric-val">${glob.totalSessions}</span>
          </div>
        </div>

        <h4 style="margin: 16px 0 8px 0; font-size: 1.0em;">${t('tokens.sessionList')}</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('tokens.session')}</th>
                <th>${t('tokens.lastModified')}</th>
                <th>${t('tokens.total')}</th>
              </tr>
            </thead>
            <tbody>
              ${sessionRows}
            </tbody>
          </table>
        </div>
      </div>`;
  }

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
  <title>${t('dashboard.title')}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --card-border: var(--vscode-editorWidget-border, #333);
      --muted: var(--vscode-descriptionForeground, #888);
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --badge-bg: var(--vscode-badge-background, #007acc);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', -apple-system, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 24px;
      line-height: 1.45;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 14px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
    }
    .header h1 { font-size: 1.35em; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .badge {
      font-size: 0.85em; padding: 4px 10px; border-radius: 4px; font-weight: 500;
    }
    .badge.connected { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }
    .badge.disconnected { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .meta { color: var(--muted); font-size: 0.85em; }

    .header-btn {
      background: var(--card-bg); color: var(--fg); border: 1px solid var(--card-border);
      padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;
      transition: background 0.2s, border-color 0.2s;
    }
    .header-btn:hover { border-color: var(--accent); }
    .header-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .cards-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .filter-pills {
      display: inline-flex;
      background: rgba(128, 128, 128, 0.08);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 3px;
      gap: 4px;
    }
    .filter-pill {
      background: transparent;
      color: var(--muted);
      border: none;
      padding: 5px 14px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 0.82em;
      font-weight: 500;
      transition: all 0.2s ease;
      outline: none;
    }
    .filter-pill:hover {
      color: var(--fg);
      background: rgba(128, 128, 128, 0.15);
    }
    .filter-pill.active {
      background: var(--accent);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(55, 148, 255, 0.35);
    }

    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      animation: fadeInUp 0.25s ease-out;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
      border-color: rgba(55, 148, 255, 0.4);
    }
    .pool-card.is-hidden {
      display: none !important;
    }
    .card-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .card-title { font-weight: 600; font-size: 1.15em; }

    .models-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .model-pill {
      font-size: 0.75em; padding: 2px 8px; border-radius: 12px;
      background: rgba(128, 128, 128, 0.12); color: var(--muted); border: 1px solid rgba(128, 128, 128, 0.2);
    }

    .bucket {
      background: rgba(0, 0, 0, 0.04);
      border: 1px solid var(--card-border);
      border-radius: 6px; padding: 12px; margin-bottom: 10px;
    }
    .bucket:last-child { margin-bottom: 0; }
    .bucket-binding {
      border-color: rgba(245, 158, 11, 0.5);
      background: rgba(245, 158, 11, 0.04);
    }
    .bucket-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .bucket-title-line { display: flex; align-items: center; gap: 8px; }
    .bucket-label { font-size: 0.9em; font-weight: 500; }
    .binding-badge {
      font-size: 0.75em; padding: 1px 6px; border-radius: 3px;
      background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-weight: 600;
    }
    .bucket-values { display: flex; align-items: center; gap: 8px; }
    .bucket-percent { font-weight: 700; font-size: 1.15em; }
    .sparkline-box { display: inline-flex; align-items: center; }

    .bar-track {
      height: 8px; border-radius: 4px;
      background: rgba(128, 128, 128, 0.2); overflow: hidden;
    }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
    .bucket-meta { font-size: 0.8em; color: var(--muted); margin-top: 6px; display: flex; justify-content: space-between; }
    .exhausted-alert {
      margin-top: 8px; padding: 6px 10px; border-radius: 4px;
      background: rgba(239, 68, 68, 0.12); color: #ef4444; font-size: 0.82em; font-weight: 500;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .session-section, .global-section {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 20px; margin-bottom: 24px;
    }
    .session-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .session-header h3 { font-size: 1.15em; }
    .session-id-text { font-size: 0.85em; color: var(--muted); }
    .session-id-text code { font-family: monospace; background: rgba(128, 128, 128, 0.15); padding: 1px 5px; border-radius: 3px; }
    .session-turns-meta { font-size: 0.85em; color: var(--muted); }

    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;
    }
    .metric-card {
      background: rgba(0, 0, 0, 0.06); border: 1px solid var(--card-border);
      border-radius: 6px; padding: 12px; display: flex; flex-direction: column;
    }
    .metric-label { font-size: 0.78em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
    .metric-val { font-size: 1.25em; font-weight: 700; }
    .metric-val.accent { color: var(--accent); }
    .metric-val.muted-val { color: var(--muted); font-size: 1.05em; font-weight: 500; }

    .table-wrap { overflow-x: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--card-border); font-size: 0.9em; }
    th { font-weight: 600; color: var(--muted); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.5px; }
    .step-badge { font-weight: 600; color: var(--muted); font-family: monospace; }
    .model-tag {
      font-size: 0.82em; padding: 2px 7px; border-radius: 4px;
      background: rgba(128, 128, 128, 0.15); font-weight: 500;
    }
    .req-bar-track {
      height: 6px; width: 100%; border-radius: 3px;
      background: rgba(128, 128, 128, 0.2); overflow: hidden;
    }
    .req-bar-fill { height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
    .bar-cell { min-width: 90px; }

    .active-session-row { background: rgba(55, 148, 255, 0.05); }
    .active-badge {
      font-size: 0.75em; padding: 2px 6px; border-radius: 3px;
      background: rgba(63, 185, 80, 0.2); color: #3fb950; font-weight: 600; margin-left: 6px;
    }

    .banner {
      padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 0.9em;
    }
    .info-banner {
      background: rgba(55, 148, 255, 0.1); border: 1px solid rgba(55, 148, 255, 0.25); color: var(--fg);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 ${t('dashboard.title')}</h1>
    <div class="header-right">
      ${statusBadge}
      <span class="meta">${t('dashboard.lastSync')}: ${lastSync} · ${latency}</span>
      <button class="header-btn" id="toggleFormatBtn" onclick="toggleFormat()">
        ${t('tokens.formatExact')}
      </button>
      <button class="header-btn primary" onclick="sendMsg('refresh')">
        🔄 ${t('dashboard.refresh')}
      </button>
      <button class="header-btn" onclick="sendMsg('openSettings')">
        ⚙️ ${t('dashboard.settings')}
      </button>
    </div>
  </div>

  <div class="cards-header">
    <div class="filter-pills" id="poolFilterPills">
      <button class="filter-pill active" data-filter="all" onclick="setPoolFilter('all')">
        ${t('dashboard.filterAll')}
      </button>
      <button class="filter-pill" data-filter="gemini" onclick="setPoolFilter('gemini')">
        ${t('dashboard.filterGemini')}
      </button>
      <button class="filter-pill" data-filter="claude" onclick="setPoolFilter('claude')">
        ${t('dashboard.filterClaude')}
      </button>
    </div>
  </div>

  <div class="cards">${groupCards}</div>

  ${sessionTokensHtml}

  ${globalSectionHtml}

  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command) { vscode.postMessage({ command }); }

    function setPoolFilter(filter) {
      try {
        sessionStorage.setItem('agpro_selected_pool_filter', filter);
        localStorage.setItem('agpro_selected_pool_filter', filter);
      } catch (e) {}

      const pills = document.querySelectorAll('.filter-pill');
      pills.forEach(pill => {
        pill.classList.toggle('active', pill.getAttribute('data-filter') === filter);
      });

      const cards = document.querySelectorAll('.pool-card');
      cards.forEach(card => {
        const pool = card.getAttribute('data-pool');
        if (filter === 'all' || pool === filter) {
          card.classList.remove('is-hidden');
        } else {
          card.classList.add('is-hidden');
        }
      });
    }

    (function initFilter() {
      try {
        const saved = sessionStorage.getItem('agpro_selected_pool_filter') ||
                      localStorage.getItem('agpro_selected_pool_filter') ||
                      'all';
        setPoolFilter(saved);
      } catch (e) {
        setPoolFilter('all');
      }
    })();

    let isExact = false;
    function toggleFormat() {
      isExact = !isExact;
      const compacts = document.querySelectorAll('.val-compact');
      const exacts = document.querySelectorAll('.val-exact');
      const btn = document.getElementById('toggleFormatBtn');

      compacts.forEach(el => el.style.display = isExact ? 'none' : 'inline');
      exacts.forEach(el => el.style.display = isExact ? 'inline' : 'none');

      if (btn) {
        btn.textContent = isExact ? '${t('tokens.formatCompact')}' : '${t('tokens.formatExact')}';
      }
    }
  </script>
</body>
</html>`;
}
