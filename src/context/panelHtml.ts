/**
 * Context Auditor — Plantilla HTML para Webview Panel y Pestaña de Dashboard (Integrado v1.3.0)
 *
 * Interfaz compacta, moderna y accesible según variables de tema de VS Code.
 */

import type { HealthAssessment, InferenceStep } from './types';
import type { SessionInfo } from './sessionWatcher';
import { escapeHtml } from '../dashboard/htmlEscape';

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

  return `
    <div class="context-panel-inner">
      <div class="session-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 10px 14px; background: rgba(128, 128, 128, 0.08); border: 1px solid var(--card-border); border-radius: 6px;">
        <div>
          <span style="font-size: 0.85em; color: var(--muted); text-transform: uppercase;">Sesión Activa:</span>
          <strong style="margin-left: 6px;" title="${escapeHtml(fullSessionId)}">${escapeHtml(sessionId)}</strong>
          ${isPinned ? '<span style="font-size: 0.75em; padding: 2px 6px; border-radius: 3px; background: rgba(55, 148, 255, 0.2); color: var(--accent); margin-left: 6px; font-weight: 600;">[Fijada]</span>' : ''}
        </div>
        <button class="header-btn" onclick="sendMsg('selectSession')" style="font-size: 0.82em; padding: 4px 10px;">
          🔄 Cambiar Sesión
        </button>
      </div>

      ${data.contentionNotice ? `
      <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #f59e0b; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 0.88em;">
        ⚠️ <strong>Atención:</strong> Múltiples conversaciones activas en los últimos 2s. Puedes fijar la sesión manualmente con el botón "Cambiar Sesión".
      </div>` : ''}

      <!-- Semáforo y Salud -->
      <div class="session-section" style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 26px; height: 26px; border-radius: 50%; background: ${lightColor}; box-shadow: 0 0 12px ${lightColor}88; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div style="font-size: 1.1em; font-weight: 700; color: ${lightColor};">${lightText}</div>
            <div style="font-size: 0.9em; color: var(--muted); margin-top: 3px;">${lightDesc}</div>
            <div style="font-size: 0.8em; color: var(--muted); margin-top: 4px;">
              Base semáforo: <em>${data.health?.trafficLightBasis ?? 'carga relativa a tu historial'}</em>
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--card-border);">
          <span style="font-size: 0.9em;">${data.health?.badgeBasis ?? 'ocupación de la ventana del modelo'} (${modelName}):</span>
          <span style="font-weight: 600; font-size: 0.82em; padding: 3px 10px; border-radius: 12px; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}66;">
            ${badgeText}
          </span>
        </div>
      </div>

      <!-- Radiografía de Tokens del Último Paso -->
      <div class="session-section" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 12px; font-size: 1.05em;">Radiografía Exacta (Último Paso de Inferencia)</h3>
        <div class="metrics-grid" style="margin-bottom: 16px;">
          <div class="metric-card">
            <span class="metric-label">Tokens Frescos (T_frescos)</span>
            <span class="metric-val" style="color: ${lightColor};">${fresh}</span>
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
        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.82em; color: var(--muted); margin-bottom: 6px;">
            <span>Desglose de Tokens del Turno</span>
            <span>Latencia: ${latency}</span>
          </div>
          <div style="display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: rgba(128, 128, 128, 0.2);">
            <div style="background: #58a6ff; width: ${cachePct}%;" title="Caché: ${cachePct}%"></div>
            <div style="background: #d29922; width: ${freshPct}%;" title="Fresco: ${freshPct}%"></div>
            <div style="background: #bc8cff; width: ${thoughtsPct}%;" title="Pensamiento: ${thoughtsPct}%"></div>
            <div style="background: #3fb950; width: ${outputPct}%;" title="Salida: ${outputPct}%"></div>
          </div>
          <div style="display: flex; gap: 14px; font-size: 0.78em; margin-top: 8px; flex-wrap: wrap; color: var(--muted);">
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width: 8px; height: 8px; border-radius: 2px; background: #58a6ff;"></div> Caché (${cachePct}%)</div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width: 8px; height: 8px; border-radius: 2px; background: #d29922;"></div> Input Fresco (${freshPct}%)</div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width: 8px; height: 8px; border-radius: 2px; background: #bc8cff;"></div> Pensamiento (${thoughtsPct}%)</div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width: 8px; height: 8px; border-radius: 2px; background: #3fb950;"></div> Salida (${outputPct}%)</div>
          </div>
        </div>

        <!-- Composición Estimada -->
        <div style="margin-top: 14px; padding: 12px; background: rgba(128, 128, 128, 0.06); border: 1px solid var(--card-border); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.82em; color: var(--muted); margin-bottom: 6px;">
            <span>*Composición estimada del Prompt (chars/4 normalizado)</span>
            <span>${estUser}% Usuario / ${estTools}% Sistema</span>
          </div>
          <div style="height: 6px; border-radius: 3px; overflow: hidden; background: rgba(128, 128, 128, 0.2); display: flex;">
            <div style="background: #238636; width: ${estUser}%;" title="Usuario: ${estUser}%"></div>
            <div style="background: #8957e5; width: ${estTools}%;" title="Sistema / Herramientas: ${estTools}%"></div>
          </div>
        </div>
      </div>

      <!-- Botón de Snapshot de Migración -->
      <div style="display: flex; gap: 12px;">
        <button class="header-btn primary" onclick="sendMsg('copySnapshot')" style="flex: 1; padding: 10px 16px; font-size: 0.95em; justify-content: center;">
          📋 Copiar Snapshot de Migración
        </button>
      </div>
    </div>
  `;
}

export function getWebviewContent(data: PanelRenderData): string {
  const content = getContextTabContentHtml(data);
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
  </style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
}
