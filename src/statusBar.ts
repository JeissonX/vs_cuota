/**
 * AG Pro Quota — Barra de Estado
 *
 * Elemento de la barra de estado con 6 formatos configurables, colores por umbral,
 * tooltip detallado con Markdown, soporte para modelos fijados (pinned)
 * y modo automático (selecciona el modelo de menor cuota restante).
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig, ModelInfo } from './types';
import { QuotaLevel } from './types';
import { t } from './i18n';
import { getQuotaLevel } from './quotaParser';

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

    this.item.backgroundColor = undefined;

    // Determinar qué modelo(s) mostrar
    const displayModels = this.resolveDisplayModels(snapshot, config);

    if (displayModels.length === 0) {
      this.item.text = '$(rocket) AG Pro';
      this.item.tooltip = this.buildTooltip(snapshot, config);
      return;
    }

    // Formatear texto de la barra según el modo configurado
    const parts: string[] = [];
    for (const m of displayModels) {
      const pct = m.remainingPercent ?? 0;
      const text = this.formatText(m.label, pct, config);
      if (text) parts.push(text);
    }

    this.item.text = parts.length > 0 ? parts.join(' | ') : '$(rocket) AG Pro';
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
   * Resuelve qué modelos mostrar: los fijados en la configuración o el de menor cuota (modo auto).
   */
  private resolveDisplayModels(snapshot: QuotaSnapshot, config: AgProConfig): ModelInfo[] {
    const { pinnedModels } = config;

    if (pinnedModels.length > 0) {
      const pinned = snapshot.models.filter((m) =>
        pinnedModels.some(
          (p) =>
            p.toLowerCase() === m.modelId.toLowerCase() ||
            p.toLowerCase() === m.label.toLowerCase() ||
            m.label.toLowerCase().includes(p.toLowerCase()),
        ),
      );
      if (pinned.length > 0) return pinned;
    }

    // Modo automático: modelo con menor cuota
    if (snapshot.models.length === 0) return [];

    let lowest = snapshot.models[0];
    for (const m of snapshot.models) {
      const curr = m.remainingPercent ?? 100;
      const low = lowest.remainingPercent ?? 100;
      if (curr < low) {
        lowest = m;
      }
    }
    return [lowest];
  }

  /**
   * Formatea el texto visible según el formato configurado.
   */
  private formatText(label: string, percent: number, config: AgProConfig): string {
    const dot = this.statusDot(percent, config);
    const pct = `${Math.floor(percent)}%`;

    switch (config.statusBarFormat) {
      case 'icon':
        return '$(rocket)';
      case 'dot':
        return dot;
      case 'percent':
        return pct;
      case 'compact':
        return `${dot} ${pct}`;
      case 'namePercent':
        return `${label}: ${pct}`;
      case 'standard':
      default:
        return `${dot} ${label}: ${pct}`;
    }
  }

  /**
   * Devuelve un indicador de color (emoji) según el nivel de salud de la cuota.
   */
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

  /**
   * Construye el tooltip detallado con soporte para Markdown interactivo.
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

    // Grupos y buckets de cuota
    if (snapshot.groups.length > 0) {
      for (const group of snapshot.groups) {
        md.appendMarkdown(`**${group.displayName}**\n\n`);

        for (const bucket of group.buckets) {
          const dot = this.statusDot(bucket.remainingPercent, config);
          const bar = this.progressBar(bucket.remainingPercent);
          const windowLabel =
            bucket.window === 'weekly'
              ? t('dashboard.weekly')
              : bucket.window === '5h'
                ? t('dashboard.fiveHour')
                : bucket.window;

          md.appendMarkdown(
            `${dot} ${windowLabel}: **${bucket.remainingPercent}%** \`${bar}\` → ${bucket.resetCountdown || '-'}\n\n`,
          );
        }
      }
      md.appendMarkdown('---\n\n');
    }

    // Tabla de modelos individuales
    if (snapshot.models.length > 0) {
      md.appendMarkdown(
        `| ${t('dashboard.model')} | ${t('dashboard.remaining')} | ${t('dashboard.resetIn')} |\n`,
      );
      md.appendMarkdown('| :--- | :---: | :--- |\n');

      for (const m of snapshot.models) {
        const pct = m.remainingPercent !== null ? `${m.remainingPercent}%` : '--%';
        const dot = m.remainingPercent !== null ? this.statusDot(m.remainingPercent, config) : '⚪';
        md.appendMarkdown(`| ${dot} ${m.label} | ${pct} | ${m.resetCountdown || '-'} |\n`);
      }
    }

    md.appendMarkdown('\n---\n');
    md.appendMarkdown(
      `[$(refresh) ${t('dashboard.refresh')}](command:agPro.refresh) | [$(dashboard) Dashboard](command:agPro.openDashboard) | [$(settings-gear) ${t('dashboard.settings')}](command:agPro.openSettings)`,
    );

    return md;
  }

  /**
   * Genera una barra gráfica de texto ASCII.
   */
  private progressBar(percent: number): string {
    const total = 10;
    const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
    return '■'.repeat(filled) + '□'.repeat(total - filled);
  }

  dispose(): void {
    this.item.dispose();
  }
}
