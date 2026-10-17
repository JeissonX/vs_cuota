/**
 * AG Pro Quota — QuickPick Fallback
 *
 * Muestra una vista interactiva de cuota usando el selector nativo QuickPick de VS Code.
 * Proporciona un respaldo ligero y accesible cuando no se desea abrir el Webview completo.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig } from './types';
import { QuotaLevel } from './types';
import { getQuotaLevel } from './quotaParser';
import { t } from './i18n';

export async function showQuickOverview(
  snapshot: QuotaSnapshot,
  config: AgProConfig,
): Promise<void> {
  if (!snapshot.isConnected || snapshot.models.length === 0) {
    const action = await vscode.window.showInformationMessage(
      t('quickPick.noModels'),
      t('dashboard.refresh'),
    );
    if (action === t('dashboard.refresh')) {
      await vscode.commands.executeCommand('agPro.refresh');
    }
    return;
  }

  const items: vscode.QuickPickItem[] = [];

  // 1. Pools / Grupos de cuota
  for (const group of snapshot.groups) {
    items.push({
      label: `$(folder) ${group.displayName}`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const bucket of group.buckets) {
      const dot = quotaDot(bucket.remainingPercent, config);
      const windowLabel =
        bucket.window === 'weekly' ? '7d' : bucket.window === '5h' ? '5h' : bucket.window;
      items.push({
        label: `${dot} [${windowLabel}] ${bucket.remainingPercent}%`,
        description: bucket.resetCountdown ? `→ Reinicia en ${bucket.resetCountdown}` : '',
        detail: bucket.description || undefined,
      });
    }
  }

  // 2. Modelos individuales
  if (snapshot.models.length > 0) {
    items.push({
      label: `$(list-unordered) ${t('dashboard.model')}`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const m of snapshot.models) {
      const pct = m.remainingPercent !== null ? `${m.remainingPercent}%` : '--%';
      const dot = m.remainingPercent !== null ? quotaDot(m.remainingPercent, config) : '⚪';
      items.push({
        label: `${dot} ${m.label}: ${pct}`,
        description: m.resetCountdown ? `→ ${m.resetCountdown}` : '',
        detail: `Pool: ${m.poolName}`,
      });
    }
  }

  // 3. Acciones rápidas al final
  items.push({
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
  });
  items.push({
    label: `$(dashboard) ${t('quickPick.openDashboard')}`,
    alwaysShow: true,
  });
  items.push({
    label: `$(refresh) ${t('dashboard.refresh')}`,
    alwaysShow: true,
  });

  const selection = await vscode.window.showQuickPick(items, {
    title: t('quickPick.title'),
    placeHolder: `${t('dashboard.lastSync')}: ${snapshot.timestamp.toLocaleTimeString()}`,
  });

  if (!selection) return;

  if (selection.label.includes(t('quickPick.openDashboard'))) {
    await vscode.commands.executeCommand('agPro.openDashboard');
  } else if (selection.label.includes(t('dashboard.refresh'))) {
    await vscode.commands.executeCommand('agPro.refresh');
  }
}

function quotaDot(percent: number, config: AgProConfig): string {
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
