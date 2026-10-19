/**
 * Context Auditor — Plantilla HTML para Webview Panel y Pestaña de Dashboard (Integrado v1.3.0)
 *
 * Interfaz compacta, moderna y accesible según variables de tema de VS Code.
 */

import type { HealthAssessment, InferenceStep } from './types';
import type { SessionInfo } from './sessionWatcher';
import { escapeHtml, clampPercent, generateNonce, buildCspMeta } from '../dashboard/htmlEscape';

export interface PanelRenderData {
  readonly session: SessionInfo | null;
  readonly inference: InferenceStep | null;
  readonly health: HealthAssessment | null;
  readonly estimatedComposition?: {
    userPercent: number;
    toolsSystemPercent: number;
  };
  readonly contentionNotice?: boolean;
}

const TRAFFIC_LIGHT_CLASSES: Record<string, 'ctx-green' | 'ctx-yellow' | 'ctx-red'> = {
  GREEN: 'ctx-green',
  YELLOW: 'ctx-yellow',
  RED: 'ctx-red',
};

const BADGE_CLASSES: Record<string, 'ctx-green' | 'ctx-yellow' | 'ctx-red'> = {
  NORMAL: 'ctx-green',
  DENSO: 'ctx-yellow',
  CRITICO: 'ctx-red',
};

export function getContextTabContentHtml(data: PanelRenderData): string {
  const rawSessionId = data.session?.id ?? '';
  const sessionId = rawSessionId ? `${rawSessionId.slice(0, 8)}...${rawSessionId.slice(-4)}` : 'Ninguna';
  const fullSessionId = rawSessionId;
  const isPinned = data.session?.isPinned ?? false;

  const usage = data.inference?.usage;
  const input = usage ? usage.input.toLocaleString() : '--';
  const cache = usage ? usage.cacheRead.toLocaleString() : '--';
  const thoughts = usage ? usage.thoughts.toLocaleString() : '--';
  const output = usage ? usage.output.toLocaleString() : '--';
  const fresh = data.health ? data.health.freshTokens.toLocaleString() : '--';
  const latency = data.inference?.latencyMs ? `${(data.inference.latencyMs / 1000).toFixed(2)}s` : '--';
  const rawModelName = data.health?.modelDisplayName
    || (data.inference?.modelId ? `modelo desconocido (ID: ${data.inference.modelId})` : (data.inference?.modelName || data.inference?.modelSlug || 'modelo desconocido'));
  const modelName = escapeHtml(rawModelName);

  // Semáforo
  const lightClass = TRAFFIC_LIGHT_CLASSES[data.health?.trafficLight ?? 'GREEN'] ?? 'ctx-green';
  let lightText = 'VERDE — Contexto Óptimo';
  let lightDesc = 'El consumo fresco por petición es bajo. La sesión puede continuar sin degradación.';
  if (data.health?.trafficLight === 'YELLOW') {
    lightText = 'AMARILLO — Precaución';
    lightDesc = 'El contexto comienza a acumular datos frescos. Considera cerrar tareas secundarias.';
  } else if (data.health?.trafficLight === 'RED') {
    lightText = 'ROJO — Migración Recomendada';
    lightDesc = 'El volumen de tokens frescos es crítico. Se recomienda generar un Snapshot e iniciar una nueva sesión.';
  }

  // Insignia
  const badgeClass = BADGE_CLASSES[data.health?.badge ?? 'NORMAL'] ?? 'ctx-green';
  let badgeText = 'NORMAL (≤ 25%)';
  if (data.health?.badge === 'DENSO') {
    badgeText = 'DENSO (> 25%)';
  } else if (data.health?.badge === 'CRITICO') {
    badgeText = 'CRÍTICO (> 50%)';
  }

  // Barra de porcentajes de tokens
  const totalTokens = usage ? (usage.input + usage.output + usage.thoughts) || 1 : 1;
  const cachePct = usage ? ((usage.cacheRead / totalTokens) * 100).toFixed(1) : '0';
  const freshPct = usage ? ((usage.inputNoCache / totalTokens) * 100).toFixed(1) : '0';
  const thoughtsPct = usage ? ((usage.thoughts / totalTokens) * 100).toFixed(1) : '0';
  const outputPct = usage ? ((usage.output / totalTokens) * 100).toFixed(1) : '0';

  // Composición estimada (chars / 4 normalizado)
  const estUser = data.estimatedComposition?.userPercent ?? 35;
  const estTools = data.estimatedComposition?.toolsSystemPercent ?? 65;

  return `
    <div class="context-panel-inner">
      <div class="session-bar ctx-session-bar">
        <div>
          <span class="ctx-session-label">Sesión Activa:</span>
          <strong class="ctx-session-id" title="${escapeHtml(fullSessionId)}">${escapeHtml(sessionId)}</strong>
          ${isPinned ? '<span class="ctx-pinned-badge">[Fijada]</span>' : ''}
        </div>
        <button class="header-btn ctx-btn-sm" data-action="selectSession">
          🔄 Cambiar Sesión
        </button>
      </div>

      ${data.contentionNotice ? `
      <div class="ctx-contention-alert">
        ⚠️ <strong>Atención:</strong> Múltiples conversaciones activas en los últimos 2s. Puedes fijar la sesión manualmente con el botón "Cambiar Sesión".
      </div>` : ''}

      <!-- Semáforo y Salud -->
      <div class="session-section ctx-mb-20">
        <div class="ctx-health-header">
          <div class="ctx-traffic-light ${lightClass}"></div>
          <div class="ctx-health-info">
            <div class="ctx-traffic-title ${lightClass}">${lightText}</div>
            <div class="ctx-traffic-desc">${lightDesc}</div>
            <div class="ctx-traffic-basis">
              Base semáforo: <em>${escapeHtml(data.health?.trafficLightBasis ?? 'carga relativa a tu historial')}</em>
            </div>
          </div>
        </div>
        <div class="ctx-badge-row">
          <span class="ctx-badge-label">${escapeHtml(data.health?.badgeBasis ?? 'ocupación de la ventana del modelo')} (${modelName}):</span>
          <span class="ctx-badge ${badgeClass}">
            ${badgeText}
          </span>
        </div>
      </div>

      <!-- Radiografía de Tokens del Último Paso -->
      <div class="session-section ctx-mb-20">
        <h3 class="ctx-section-title">Radiografía Exacta (Último Paso de Inferencia)</h3>
        <div class="metrics-grid ctx-mb-16">
          <div class="metric-card">
            <span class="metric-label">Tokens Frescos (T_frescos)</span>
            <span class="metric-val ctx-metric-fresh ${lightClass}">${fresh}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Entrada (Input)</span>
            <span class="metric-val">${input}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Caché (no disp. local)</span>
            <span class="metric-val muted-val" title="Antigravity no expone tokens de caché en su base SQLite local (campo 9.6 fija ${cache} tokens como enum de modelo). k_cache sin efecto.">No disponible</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Pensamiento / Salida</span>
            <span class="metric-val">${thoughts} / ${output}</span>
          </div>
        </div>

        <!-- Barra de desglose de tokens -->
        <div class="ctx-mt-14">
          <div class="ctx-bar-header">
            <span>Desglose de Tokens del Turno</span>
            <span>Latencia: ${latency}</span>
          </div>
          <div class="ctx-bar-track">
            <div class="ctx-bar-seg ctx-seg-cache" data-percent="${clampPercent(cachePct)}" title="Caché: ${cachePct}%"></div>
            <div class="ctx-bar-seg ctx-seg-fresh" data-percent="${clampPercent(freshPct)}" title="Fresco: ${freshPct}%"></div>
            <div class="ctx-bar-seg ctx-seg-thoughts" data-percent="${clampPercent(thoughtsPct)}" title="Pensamiento: ${thoughtsPct}%"></div>
            <div class="ctx-bar-seg ctx-seg-output" data-percent="${clampPercent(outputPct)}" title="Salida: ${outputPct}%"></div>
          </div>
          <div class="ctx-legend">
            <div class="ctx-legend-item"><div class="ctx-legend-dot ctx-seg-cache"></div> Caché (${cachePct}%)</div>
            <div class="ctx-legend-item"><div class="ctx-legend-dot ctx-seg-fresh"></div> Input Fresco (${freshPct}%)</div>
            <div class="ctx-legend-item"><div class="ctx-legend-dot ctx-seg-thoughts"></div> Pensamiento (${thoughtsPct}%)</div>
            <div class="ctx-legend-item"><div class="ctx-legend-dot ctx-seg-output"></div> Salida (${outputPct}%)</div>
          </div>
        </div>

        <!-- Composición Estimada -->
        <div class="ctx-composition-box">
          <div class="ctx-bar-header">
            <span>*Composición estimada del Prompt (chars/4 normalizado)</span>
            <span>${estUser}% Usuario / ${estTools}% Sistema</span>
          </div>
          <div class="ctx-bar-track-sm">
            <div class="ctx-bar-seg ctx-seg-user" data-percent="${clampPercent(estUser)}" title="Usuario: ${estUser}%"></div>
            <div class="ctx-bar-seg ctx-seg-tools" data-percent="${clampPercent(estTools)}" title="Sistema / Herramientas: ${estTools}%"></div>
          </div>
        </div>
      </div>

      <!-- Botón de Snapshot de Migración -->
      <div class="ctx-action-row">
        <button class="header-btn primary ctx-btn-block" data-action="copySnapshot">
          📋 Copiar Snapshot de Migración
        </button>
      </div>
    </div>
  `;
}

export const CONTEXT_TAB_CSS = `
  /* Context Tab Styles */
  .ctx-session-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: 10px 14px;
    background: rgba(128, 128, 128, 0.08);
    border: 1px solid var(--card-border);
    border-radius: 6px;
  }
  .ctx-session-label {
    font-size: 0.85em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .ctx-session-id {
    margin-left: 6px;
  }
  .ctx-pinned-badge {
    font-size: 0.75em;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(55, 148, 255, 0.2);
    color: var(--accent);
    margin-left: 6px;
    font-weight: 600;
  }
  .context-panel-inner .header-btn.ctx-btn-sm {
    font-size: 0.82em;
    padding: 4px 10px;
  }
  .context-panel-inner .header-btn.ctx-btn-block {
    flex: 1;
    padding: 10px 16px;
    font-size: 0.95em;
    justify-content: center;
  }
  .ctx-contention-alert {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #f59e0b;
    padding: 10px 14px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 0.88em;
  }
  .ctx-mb-20 {
    margin-bottom: 20px;
  }
  .ctx-health-header {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ctx-traffic-light {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ctx-traffic-light.ctx-green {
    background: #3fb950;
    box-shadow: 0 0 12px #3fb95088;
  }
  .ctx-traffic-light.ctx-yellow {
    background: #d29922;
    box-shadow: 0 0 12px #d2992288;
  }
  .ctx-traffic-light.ctx-red {
    background: #f85149;
    box-shadow: 0 0 12px #f8514988;
  }
  .ctx-health-info {
    flex: 1;
  }
  .ctx-traffic-title {
    font-size: 1.1em;
    font-weight: 700;
  }
  .ctx-traffic-title.ctx-green,
  .ctx-metric-fresh.ctx-green {
    color: #3fb950;
  }
  .ctx-traffic-title.ctx-yellow,
  .ctx-metric-fresh.ctx-yellow {
    color: #d29922;
  }
  .ctx-traffic-title.ctx-red,
  .ctx-metric-fresh.ctx-red {
    color: #f85149;
  }
  .ctx-traffic-desc {
    font-size: 0.9em;
    color: var(--muted);
    margin-top: 3px;
  }
  .ctx-traffic-basis {
    font-size: 0.8em;
    color: var(--muted);
    margin-top: 4px;
  }
  .ctx-badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--card-border);
  }
  .ctx-badge-label {
    font-size: 0.9em;
  }
  .ctx-badge {
    font-weight: 600;
    font-size: 0.82em;
    padding: 3px 10px;
    border-radius: 12px;
  }
  .ctx-badge.ctx-green {
    background: #58a6ff22;
    color: #58a6ff;
    border: 1px solid #58a6ff66;
  }
  .ctx-badge.ctx-yellow {
    background: #e3b34122;
    color: #e3b341;
    border: 1px solid #e3b34166;
  }
  .ctx-badge.ctx-red {
    background: #ff7b7222;
    color: #ff7b72;
    border: 1px solid #ff7b7266;
  }
  .ctx-section-title {
    margin-bottom: 12px;
    font-size: 1.05em;
  }
  .ctx-mb-16 {
    margin-bottom: 16px;
  }
  .ctx-mt-14 {
    margin-top: 14px;
  }
  .ctx-bar-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.82em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .ctx-bar-track {
    display: flex;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    background: rgba(128, 128, 128, 0.2);
  }
  .ctx-bar-track-sm {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(128, 128, 128, 0.2);
  }
  .ctx-bar-seg {
    height: 100%;
  }
  .ctx-seg-cache { background: #58a6ff; }
  .ctx-seg-fresh { background: #d29922; }
  .ctx-seg-thoughts { background: #bc8cff; }
  .ctx-seg-output { background: #3fb950; }
  .ctx-seg-user { background: #238636; }
  .ctx-seg-tools { background: #8957e5; }
  .ctx-legend {
    display: flex;
    gap: 14px;
    font-size: 0.78em;
    margin-top: 8px;
    flex-wrap: wrap;
    color: var(--muted);
  }
  .ctx-legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .ctx-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .ctx-composition-box {
    margin-top: 14px;
    padding: 12px;
    background: rgba(128, 128, 128, 0.06);
    border: 1px solid var(--card-border);
    border-radius: 6px;
  }
  .ctx-action-row {
    display: flex;
    gap: 12px;
  }
`;

export const CONTEXT_TAB_JS = `
  function applyDynamicStyles(root) {
    var container = root || document;
    var elements = container.querySelectorAll('[data-percent]');
    elements.forEach(function(el) {
      var pct = el.getAttribute('data-percent');
      if (pct !== null) {
        el.style.width = pct + '%';
      }
    });
  }

  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    var el = target.closest('[data-action]');
    if (el && typeof sendMsg === 'function') {
      var action = el.getAttribute('data-action');
      if (action) {
        sendMsg(action);
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      applyDynamicStyles(document);
    });
  } else {
    applyDynamicStyles(document);
  }
`;

export function getWebviewContent(
  data: PanelRenderData,
  cspSource: string = 'https://file+.vscode-resource.vscode-cdn.net',
): string {
  const nonce = generateNonce();
  const content = getContextTabContentHtml(data);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${buildCspMeta(cspSource, nonce)}
  <title>Context Auditor</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --card-border: var(--vscode-panel-border, #333333);
      --muted: var(--vscode-descriptionForeground, #888888);
      --accent: var(--vscode-textLink-foreground, #3794ff);
    }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      margin: 0; padding: 20px;
      background: var(--bg); color: var(--fg);
    }
    .header-btn {
      background: rgba(128, 128, 128, 0.15); border: 1px solid var(--card-border);
      color: var(--fg); border-radius: 4px; padding: 6px 12px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px; font-weight: 500;
    }
    .header-btn:hover { background: rgba(128, 128, 128, 0.25); }
    .header-btn.primary { background: var(--accent); color: #ffffff; border-color: transparent; }
    .header-btn.primary:hover { opacity: 0.9; }
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;
    }
    .metric-card {
      background: rgba(0, 0, 0, 0.06); border: 1px solid var(--card-border);
      border-radius: 6px; padding: 12px; display: flex; flex-direction: column;
    }
    .metric-label { font-size: 0.78em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
    .metric-val { font-size: 1.25em; font-weight: 700; }
    .metric-val.muted-val { color: var(--muted); font-size: 1.05em; font-weight: 500; }
    .session-section {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 20px;
    }
    ${CONTEXT_TAB_CSS}
  </style>
</head>
<body>
  ${content}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function sendMsg(command) { vscode.postMessage({ command }); }
    ${CONTEXT_TAB_JS}
  </script>
</body>
</html>`;
}
