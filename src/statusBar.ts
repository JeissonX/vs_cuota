/**
 * AG Pro Quota — Barra de Estado (v1.1.0)
 *
 * Muestra todos los pools a la vez con sus dos ventanas (5h y semanal).
 * Opciones configurables:
 * - statusBar.showWindows: 'both' (5h/semanal) o 'binding' (solo la menor).
 * - statusBar.pools: lista de pools a mostrar (por defecto todos).
 * - statusBarFormat: los 6 modos existentes adaptados a múltiples pools.
 * - Tooltip con detalle completo por pool, hora de reinicio, ventana limitante,
 *   aviso específico cuando el límite de 5h llega a 0% y lista de modelos del pool.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig, QuotaGroup } from './types';
import { QuotaLevel } from './types';
import { t, getLanguage } from './i18n';
import {
  getQuotaLevel,
  get5hBucket,
  getWeeklyBucket,
  getBindingBucket,
  formatPoolShortName,
} from './quotaParser';
import { formatStatusBarPoolsText } from './statusBarFormatter';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'agPro.openDashboard';
    this.item.text = `$(sync~spin) ${t('statusBar.init')}`;
    this.item.tooltip = t('statusBar.tooltip');
    this.item.show();
    context.subscriptions.push(this.item);
  }

  /**
   * Actualiza el contenido visual de la barra de estado según el snapshot y la configuración.
   */
  update(snapshot: QuotaSnapshot, config: AgProConfig): void {
    if (!snapshot.isConnected) {
      this.item.text = `$(error) ${t('statusBar.offline')}`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.tooltip = snapshot.errorMessage || t('statusBar.offline');
      return;
    }

    const groupsToDisplay = this.resolveGroups(snapshot.groups, config);

    if (groupsToDisplay.length === 0) {
      this.item.text = '$(rocket) AG Pro';
      this.item.backgroundColor = undefined;
      this.item.tooltip = this.buildTooltip(snapshot, config);
      return;
    }

    // Calcular el porcentaje más bajo entre todos los pools mostrados
    const lowestOverall = Math.min(...groupsToDisplay.map((g) => g.lowestPercent));
    const overallLevel = getQuotaLevel(
      lowestOverall,
      config.warningThreshold,
      config.criticalThreshold,
    );

    // Ajustar color de fondo del StatusBarItem para situaciones críticas
    if (overallLevel === QuotaLevel.Depleted || overallLevel === QuotaLevel.Critical) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (overallLevel === QuotaLevel.Warning) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    // Formatear texto visible
    const text = formatStatusBarPoolsText(groupsToDisplay, config);
    if (!text) {
      this.item.text = '$(rocket) AG Pro';
    } else {
      const prefix = text.startsWith('$') || text.startsWith('🚀') ? '' : '$(rocket) ';
      this.item.text = `${prefix}${text}`;
    }
    this.item.tooltip = this.buildTooltip(snapshot, config);
  }

  /**
   * Muestra estado de conexión en curso.
   */
  setLoading(): void {
    this.item.text = `$(sync~spin) ${t('statusBar.connecting')}`;
    this.item.backgroundColor = undefined;
  }

  /**
   * Filtra los grupos según statusBar.poolView y statusBar.pools.
   */
  private resolveGroups(groups: QuotaGroup[], config: AgProConfig): QuotaGroup[] {
    const result = groups;

    if (config.statusBarPoolView && config.statusBarPoolView !== 'all') {
      if (config.statusBarPoolView === 'gemini') {
        const geminiGroups = result.filter(
          (g) =>
            g.displayName.toLowerCase().includes('gemini') ||
            g.displayName.toLowerCase().includes('argon') ||
            g.groupId.toLowerCase().includes('gemini'),
        );
        if (geminiGroups.length > 0) return geminiGroups;
      } else if (config.statusBarPoolView === 'claude') {
        const claudeGroups = result.filter(
          (g) =>
            g.displayName.toLowerCase().includes('claude') ||
            g.displayName.toLowerCase().includes('gpt') ||
            g.groupId.toLowerCase().includes('claude') ||
            g.groupId.toLowerCase().includes('3p'),
        );
        if (claudeGroups.length > 0) return claudeGroups;
      }
    }

    if (config.statusBarPools && config.statusBarPools.length > 0) {
      const filtered = result.filter((g) =>
        config.statusBarPools.some(
          (p) =>
            p.toLowerCase() === g.groupId.toLowerCase() ||
            p.toLowerCase() === g.displayName.toLowerCase() ||
            p.toLowerCase() === formatPoolShortName(g.displayName).toLowerCase(),
        ),
      );
      if (filtered.length > 0) return filtered;
    }
    return result;
  }

  /**
   * Construye el tooltip Markdown minimalista, compacto y estructurado.
   */
  private buildTooltip(snapshot: QuotaSnapshot, _config: AgProConfig): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true;

    const isEs = getLanguage() === 'es';
    const timeStr = snapshot.timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    md.appendMarkdown(`### 🚀 AG Pro — ${isEs ? 'Cuota de Modelos' : 'Model Quota'}\n`);
    md.appendMarkdown(`*${isEs ? 'Sincronizado' : 'Synced'}: ${timeStr}*\n\n`);

    for (const group of snapshot.groups) {
      const lower = group.displayName.toLowerCase();
      let poolHeader = group.displayName;
      if (lower.includes('gemini')) {
        poolHeader = 'Gemini (Flash)';
      } else if (lower.includes('claude') || lower.includes('gpt')) {
        poolHeader = 'Claude & GPT';
      }

      md.appendMarkdown(`**${poolHeader}**\n`);

      const b5h = get5hBucket(group);
      const bWeekly = getWeeklyBucket(group);
      const binding = getBindingBucket(group);

      if (b5h) {
        const isBinding = binding?.window === b5h.window;
        const bindingTag = isBinding ? ` *(${isEs ? 'limitante' : 'binding'})*` : '';
        const resetText =
          b5h.remainingPercent >= 100
            ? isEs
              ? 'liberado'
              : 'full'
            : `${isEs ? 'reinicia en' : 'resets in'} ${b5h.resetCountdown || '-'}`;
        md.appendMarkdown(`• 5h (Sprint): **${b5h.remainingPercent}%**${bindingTag} — ${resetText}\n`);
      }

      if (bWeekly) {
        const isBinding = binding?.window === bWeekly.window;
        const bindingTag = isBinding ? ` *(${isEs ? 'limitante' : 'binding'})*` : '';
        const resetText =
          bWeekly.remainingPercent >= 100
            ? isEs
              ? 'liberado'
              : 'full'
            : `${isEs ? 'reinicia en' : 'resets in'} ${bWeekly.resetCountdown || '-'}`;
        md.appendMarkdown(
          `• ${isEs ? 'Semanal' : 'Weekly'}: **${bWeekly.remainingPercent}%**${bindingTag} — ${resetText}\n`,
        );
      }

      md.appendMarkdown('\n');
    }

    md.appendMarkdown('---\n');
    md.appendMarkdown(
      `[🔄 ${t('dashboard.refresh')}](command:agPro.refresh) | [📊 Dashboard](command:agPro.openDashboard) | [⚙️ ${t('dashboard.settings')}](command:agPro.openSettings)\n`,
    );

    return md;
  }

  dispose(): void {
    this.item.dispose();
  }
}
