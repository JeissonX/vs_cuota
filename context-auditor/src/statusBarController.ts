/**
 * Context Auditor — Controlador de Barra de Estado
 *
 * Muestra el semáforo (color/icono), insignia de ocupación y tokens frescos.
 */

import * as vscode from 'vscode';
import type { HealthAssessment, InferenceStep } from './types';
import type { SessionInfo } from './sessionWatcher';

export class StatusBarController {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      95
    );
    this.item.command = 'contextAuditor.openPanel';
    this.item.name = 'Context Auditor';
    this.setInactive();
    this.item.show();
  }

  public setInactive(message = 'Auditor: Inactivo'): void {
    this.item.text = `$(pulse) ${message}`;
    this.item.tooltip = 'Context Auditor: Esperando actividad en conversaciones locales.';
    this.item.color = undefined;
  }

  public update(
    session: SessionInfo | null,
    inference: InferenceStep | null,
    health: HealthAssessment | null,
    hasContention = false
  ): void {
    if (!session || !inference || !health) {
      this.setInactive('Auditor: Sin datos');
      return;
    }

    const shortId = `${session.id.slice(0, 6)}...`;
    const freshK = (health.freshTokens / 1000).toFixed(1);

    // Icono y color según semáforo
    let icon = '$(circle-filled)';
    let color: string = '#3fb950'; // verde
    if (health.trafficLight === 'YELLOW') {
      icon = '$(warning)';
      color = '#d29922'; // amarillo
    } else if (health.trafficLight === 'RED') {
      icon = '$(error)';
      color = '#f85149'; // rojo
    }

    // Insignia
    const badgeStr = `[${health.badge}]`;

    // Si hay contención, advertir sesión
    const contentionPrefix = hasContention && !session.isPinned ? `Sesión: ${shortId} ` : '';

    this.item.text = `${contentionPrefix}${icon} ${badgeStr} ${freshK}k`;
    this.item.color = color;

    // Tooltip enriquecido en Markdown
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`### Context Auditor — Salud de Contexto\n\n`);
    md.appendMarkdown(`- **Sesión Activa**: \`${session.id}\`${session.isPinned ? ' *(Fijada manualmente)*' : ''}\n`);
    md.appendMarkdown(`- **Semáforo**: **${health.trafficLight}** (${health.freshTokens.toLocaleString()} tokens frescos)\n`);
    md.appendMarkdown(`- **Insignia**: **${health.badge}** (${health.occupancyPercent}% de ventana)\n\n`);
    md.appendMarkdown(`---\n`);
    md.appendMarkdown(`**Último Paso de Inferencia:**\n`);
    md.appendMarkdown(`- Entrada total: \`${inference.usage.input.toLocaleString()}\`\n`);
    md.appendMarkdown(`- Leído de caché: \`No disponible localmente\` *(k_cache sin efecto)*\n`);
    md.appendMarkdown(`- Pensamiento: \`${inference.usage.thoughts.toLocaleString()}\`\n`);
    md.appendMarkdown(`- Salida: \`${inference.usage.output.toLocaleString()}\`\n\n`);
    if (inference.latencyMs) {
      md.appendMarkdown(`- Latencia: \`${(inference.latencyMs / 1000).toFixed(2)}s\`\n\n`);
    }
    md.appendMarkdown(`*Haz clic para abrir el panel completo o copiar el Snapshot.*`);

    this.item.tooltip = md;
  }

  public dispose(): void {
    this.item.dispose();
  }
}
