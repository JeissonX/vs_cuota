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
import { t } from './i18n';
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
    this.item.text = text || '$(rocket) AG Pro';
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
   * Filtra los grupos según la configuración statusBar.pools.
   */
  private resolveGroups(groups: QuotaGroup[], config: AgProConfig): QuotaGroup[] {
    if (config.statusBarPools && config.statusBarPools.length > 0) {
      const filtered = groups.filter((g) =>
        config.statusBarPools.some(
          (p) =>
            p.toLowerCase() === g.groupId.toLowerCase() ||
            p.toLowerCase() === g.displayName.toLowerCase() ||
            p.toLowerCase() === formatPoolShortName(g.displayName).toLowerCase(),
        ),
      );
      if (filtered.length > 0) return filtered;
    }
    return groups;
  }

  /**
   * Construye el tooltip interactivo detallado con ambas ventanas, horas de reinicio,
   * aviso de 0% de 5h y modelos del pool.
   */
  private buildTooltip(snapshot: QuotaSnapshot, config: AgProConfig): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const timeStr = snapshot.timestamp.toLocaleTimeString();
    const statusIcon = snapshot.isConnected ? '🟢' : '🔴';

    md.appendMarkdown(`**$(rocket) ${t('dashboard.title')}**\n\n`);
    md.appendMarkdown(`*${t('dashboard.lastSync')}: ${timeStr} • ${statusIcon}*\n\n`);
    md.appendMarkdown('---\n\n');

    for (const group of snapshot.groups) {
      const shortName = formatPoolShortName(group.displayName);
      const dot = this.statusDot(group.lowestPercent, config);

      md.appendMarkdown(`### ${dot} **${group.displayName}** (${shortName})\n\n`);

      const b5h = get5hBucket(group);
      const bWeekly = getWeeklyBucket(group);
      const binding = getBindingBucket(group);

      // Si el pool está en 0% en la ventana de 5h, avisar expresamente cuándo se libera
      if (b5h && b5h.remainingPercent <= 0) {
        const resetAt = b5h.resetTime ? b5h.resetTime.toLocaleTimeString() : '-';
        md.appendMarkdown(
          `> ⚠️ **${t('statusBar.fiveHourExhausted', { time: resetAt, countdown: b5h.resetCountdown || 'en breve' })}**\n\n`,
        );
      }

      // Detalle de ambas ventanas
      if (b5h) {
        const isBinding = binding?.window === b5h.window;
        const bDot = this.statusDot(b5h.remainingPercent, config);
        const bar = this.progressBar(b5h.remainingPercent);
        const resetAt = b5h.resetTime ? `(${b5h.resetTime.toLocaleTimeString()})` : '';
        const tag = isBinding ? ` *[${t('statusBar.bindingNotice')}]*` : '';
        md.appendMarkdown(
          `- ${bDot} **${t('dashboard.fiveHour')}**: **${b5h.remainingPercent}%** \`${bar}\` → ${b5h.resetCountdown || '-'} ${resetAt}${tag}\n`,
        );
      }

      if (bWeekly) {
        const isBinding = binding?.window === bWeekly.window;
        const bDot = this.statusDot(bWeekly.remainingPercent, config);
        const bar = this.progressBar(bWeekly.remainingPercent);
        const resetAt = bWeekly.resetTime
          ? `(${bWeekly.resetTime.toLocaleDateString()} ${bWeekly.resetTime.toLocaleTimeString()})`
          : '';
        const tag = isBinding ? ` *[${t('statusBar.bindingNotice')}]*` : '';
        md.appendMarkdown(
          `- ${bDot} **${t('dashboard.weekly')}**: **${bWeekly.remainingPercent}%** \`${bar}\` → ${bWeekly.resetCountdown || '-'} ${resetAt}${tag}\n`,
        );
      }

      // Modelos del pool
      const poolModels = snapshot.models.filter(
        (m) =>
          m.poolName.toLowerCase() === group.displayName.toLowerCase() ||
          group.displayName.toLowerCase().includes(m.poolName.toLowerCase()),
      );
      if (poolModels.length > 0) {
        const modelNames = poolModels.map((m) => m.label).join(', ');
        md.appendMarkdown(`\n*${t('statusBar.poolModels')}: ${modelNames}*\n\n`);
      } else {
        md.appendMarkdown('\n');
      }

      md.appendMarkdown('---\n\n');
    }

    md.appendMarkdown(
      `[$(refresh) ${t('dashboard.refresh')}](command:agPro.refresh) | [$(dashboard) Dashboard](command:agPro.openDashboard) | [$(settings-gear) ${t('dashboard.settings')}](command:agPro.openSettings)`,
    );

    return md;
  }

  private statusDot(percent: number, config: AgProConfig): string {
    const level = getQuotaLevel(percent, config.warningThreshold, config.criticalThreshold);
    switch (level) {
      case QuotaLevel.Depleted:
      case QuotaLevel.Critical:
        return '🔴';
      case QuotaLevel.Warning:
        return '🟡';
      case QuotaLevel.Normal:
      default:
        return '🟢';
    }
  }

  private progressBar(percent: number): string {
    const total = 10;
    const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
    return '■'.repeat(filled) + '□'.repeat(total - filled);
  }

  dispose(): void {
    this.item.dispose();
  }
}
