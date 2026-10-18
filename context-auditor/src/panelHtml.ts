/**
 * Context Auditor — Plantilla HTML para Webview Panel
 *
 * Interfaz compacta, moderna y accesible según variables de tema de VS Code.
 */

import type { HealthAssessment, InferenceStep } from './types';
import type { SessionInfo } from './sessionWatcher';

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

export function getWebviewContent(data: PanelRenderData): string {
  const sessionId = data.session?.id ? `${data.session.id.slice(0, 8)}...${data.session.id.slice(-4)}` : 'Ninguna';
  const fullSessionId = data.session?.id ?? '';
  const isPinned = data.session?.isPinned ?? false;

  const usage = data.inference?.usage;
  const input = usage ? usage.input.toLocaleString() : '--';
  const cache = usage ? usage.cacheRead.toLocaleString() : '--';
  const thoughts = usage ? usage.thoughts.toLocaleString() : '--';
  const output = usage ? usage.output.toLocaleString() : '--';
  const fresh = data.health ? data.health.freshTokens.toLocaleString() : '--';
  const latency = data.inference?.latencyMs ? `${(data.inference.latencyMs / 1000).toFixed(2)}s` : '--';
  const modelName = data.inference?.modelName || data.inference?.modelSlug || 'Desconocido';

  // Semáforo
  let lightColor = '#3fb950'; // green
  let lightText = 'VERDE — Contexto Óptimo';
  let lightDesc = 'El consumo fresco por petición es bajo. La sesión puede continuar sin degradación.';
  if (data.health?.trafficLight === 'YELLOW') {
    lightColor = '#d29922'; // yellow
    lightText = 'AMARILLO — Precaución';
    lightDesc = 'El contexto comienza a acumular datos frescos. Considera cerrar tareas secundarias.';
  } else if (data.health?.trafficLight === 'RED') {
    lightColor = '#f85149'; // red
    lightText = 'ROJO — Migración Recomendada';
    lightDesc = 'El volumen de tokens frescos es crítico. Se recomienda generar un Snapshot e iniciar una nueva sesión.';
  }

  // Insignia
  let badgeColor = '#58a6ff';
  let badgeText = 'NORMAL (≤ 25%)';
  if (data.health?.badge === 'DENSO') {
    badgeColor = '#e3b341';
    badgeText = 'DENSO (> 25%)';
  } else if (data.health?.badge === 'CRITICO') {
    badgeColor = '#ff7b72';
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Context Auditor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --border: var(--vscode-panel-border, #333333);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      background-color: var(--bg);
      color: var(--fg);
      line-height: 1.4;
      font-size: 13px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .session-badge {
      font-size: 11px;
      padding: 3px 8px;
      background: var(--card-bg);
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .traffic-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .traffic-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${lightColor};
      box-shadow: 0 0 10px ${lightColor}88;
      flex-shrink: 0;
    }
    .traffic-title {
      font-size: 14px;
      font-weight: 600;
      color: ${lightColor};
    }
    .traffic-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888888);
      margin-top: 2px;
    }
    .badge-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed var(--border);
    }
    .badge-pill {
      font-weight: 600;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      background: ${badgeColor}22;
      color: ${badgeColor};
      border: 1px solid ${badgeColor}66;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    .metric {
      background: var(--bg);
      padding: 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .metric-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888888);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-value {
      font-size: 16px;
      font-weight: 700;
      margin-top: 4px;
    }
    .progress-bar-container {
      margin-top: 14px;
    }
    .bar-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground, #888888);
    }
    .bar {
      display: flex;
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      background: #333333;
    }
    .bar-seg-cache { background: #58a6ff; width: ${cachePct}%; }
    .bar-seg-fresh { background: #d29922; width: ${freshPct}%; }
    .bar-seg-thoughts { background: #bc8cff; width: ${thoughtsPct}%; }
    .bar-seg-output { background: #3fb950; width: ${outputPct}%; }
    .bar-legend {
      display: flex;
      gap: 12px;
      font-size: 10px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-box { width: 8px; height: 8px; border-radius: 2px; }
    .est-box {
      margin-top: 12px;
      padding: 10px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    button {
      flex: 1;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .btn-primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    .btn-primary:hover {
      background: var(--btn-hover);
    }
    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
    }
    .btn-secondary:hover {
      background: #4e5157;
    }
    .alert-contention {
      background: #d2992222;
      border: 1px solid #d2992266;
      color: #e3b341;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      Context Auditor
    </div>
    <div class="session-badge" title="${fullSessionId}">
      Sesión: <strong>${sessionId}</strong>${isPinned ? ' [Fijada]' : ''}
    </div>
  </div>

  ${data.contentionNotice ? `
  <div class="alert-contention">
    ⚠️ <strong>Atención:</strong> Múltiples conversaciones activas en los últimos 2s. Puedes fijar la sesión manualmente.
  </div>` : ''}

  <!-- Semáforo y Salud -->
  <div class="card">
    <div class="traffic-box">
      <div class="traffic-dot"></div>
      <div>
        <div class="traffic-title">${lightText}</div>
        <div class="traffic-desc">${lightDesc}</div>
      </div>
    </div>
    <div class="badge-row">
      <span>Ocupación de Ventana (${modelName}):</span>
      <span class="badge-pill">${badgeText}</span>
    </div>
  </div>

  <!-- Radiografía de Tokens del Último Paso -->
  <div class="card">
    <div style="font-weight: 600; margin-bottom: 8px;">Radiografía Exacta (Último Paso de Inferencia)</div>
    <div class="grid">
      <div class="metric">
        <div class="metric-label">Tokens Frescos (T_frescos)</div>
        <div class="metric-value" style="color: ${lightColor};">${fresh}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Total Entrada (Input)</div>
        <div class="metric-value">${input}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Leído de Caché</div>
        <div class="metric-value" style="color: #58a6ff;">${cache}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Pensamiento / Output</div>
        <div class="metric-value">${thoughts} / ${output}</div>
      </div>
    </div>

    <!-- Barra de desglose de tokens -->
    <div class="progress-bar-container">
      <div class="bar-label">
        <span>Desglose de Tokens</span>
        <span>Latencia: ${latency}</span>
      </div>
      <div class="bar">
        <div class="bar-seg-cache" title="Caché: ${cachePct}%"></div>
        <div class="bar-seg-fresh" title="Fresco: ${freshPct}%"></div>
        <div class="bar-seg-thoughts" title="Pensamiento: ${thoughtsPct}%"></div>
        <div class="bar-seg-output" title="Salida: ${outputPct}%"></div>
      </div>
      <div class="bar-legend">
        <div class="legend-item"><div class="legend-box" style="background:#58a6ff"></div> Caché (${cachePct}%)</div>
        <div class="legend-item"><div class="legend-box" style="background:#d29922"></div> Input Fresco (${freshPct}%)</div>
        <div class="legend-item"><div class="legend-box" style="background:#bc8cff"></div> Pensamiento (${thoughtsPct}%)</div>
        <div class="legend-item"><div class="legend-box" style="background:#3fb950"></div> Salida (${outputPct}%)</div>
      </div>
    </div>

    <!-- Barra de Composición Estimada (Escenario A) -->
    <div class="est-box">
      <div class="bar-label">
        <span>*Composición estimada del Prompt (chars/4 normalizado)</span>
        <span>${estUser}% Usuario / ${estTools}% Sistema</span>
      </div>
      <div class="bar" style="height: 6px;">
        <div style="background: #238636; width: ${estUser}%;" title="Usuario: ${estUser}%"></div>
        <div style="background: #8957e5; width: ${estTools}%;" title="Sistema / Herramientas: ${estTools}%"></div>
      </div>
    </div>
  </div>

  <!-- Botones de Acción -->
  <div class="actions">
    <button class="btn-primary" id="btnCopySnapshot">
      📋 Copiar Snapshot de Migración
    </button>
    <button class="btn-secondary" id="btnSelectSession">
      🔄 Cambiar Sesión
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('btnCopySnapshot').addEventListener('click', () => {
      vscode.postMessage({ command: 'copySnapshot' });
    });
    document.getElementById('btnSelectSession').addEventListener('click', () => {
      vscode.postMessage({ command: 'selectSession' });
    });
  </script>
</body>
</html>`;
}
