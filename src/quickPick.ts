/**
 * AG Pro Quota — QuickPick Fallback (v1.1.0)
 *
 * Muestra una vista interactiva de cuota usando el selector nativo QuickPick de VS Code.
 * Proporciona un respaldo ligero y accesible cuando no se desea abrir el Webview completo,
 * incluyendo información de ambas ventanas por pool y métricas de tokens de la sesión activa.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig } from './types';
import type { TokenAuditSnapshot } from './phase2/tokenAuditor';
import { QuotaLevel } from './types';
import { getQuotaLevel } from './quotaParser';
import { t } from './i18n';

export async function showQuickOverview(
  snapshot: QuotaSnapshot,
  config: AgProConfig,
  tokenSnapshot?: TokenAuditSnapshot | null,
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

  // 1. Pools / Grupos de cuota con ambas ventanas
  for (const group of snapshot.groups) {
    items.push({
      label: `$(folder) ${group.displayName}`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    let lowestPct = 101;
    for (const b of group.buckets) {
      if (b.remainingPercent < lowestPct) lowestPct = b.remainingPercent;
    }

    for (const bucket of group.buckets) {
      const dot = quotaDot(bucket.remainingPercent, config);
      const isBinding = bucket.remainingPercent === lowestPct;
      const windowLabel =
        bucket.window === 'weekly' ? '7d' : bucket.window === '5h' ? '5h' : bucket.window;

      const bindingTag = isBinding ? ` [★ ${t('dashboard.bindingBadge')}]` : '';
      const exhaustedNotice =
        bucket.window === '5h' && bucket.remainingPercent === 0
          ? ` ⚠️ ${t('statusBar.fiveHourExhausted').replace('{time}', bucket.resetTime ? bucket.resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '').replace('{countdown}', bucket.resetCountdown || '')}`
          : '';

      items.push({
        label: `${dot} [${windowLabel}] ${bucket.remainingPercent}%${bindingTag}`,
        description: bucket.resetCountdown ? `→ Reinicia en ${bucket.resetCountdown}` : '',
        detail: (bucket.description ? `${bucket.description}. ` : '') + exhaustedNotice,
      });
    }
  }

  // 2. Tokens de la sesión activa (si están disponibles)
  if (tokenSnapshot?.activeSession) {
    const s = tokenSnapshot.activeSession;
    items.push({
      label: `$(symbol-variable) ${t('tokens.sessionTitle')}`,
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push({
      label: `$(pulse) ${t('tokens.total')}: ${s.totalTokens.toLocaleString()}`,
      description: `${t('tokens.input')}: ${s.totalPromptTokens.toLocaleString()} · ${t('tokens.output')}: ${s.totalOutputTokens.toLocaleString()}`,
      detail: `${t('tokens.thought')}: ${s.totalThoughtTokens.toLocaleString()} · ${t('tokens.turns')}: ${s.userTurns} user / ${s.modelTurns} model · Promedio: ${s.averageTokensPerRequest.toLocaleString()} tokens/req`,
    });
  }

  // 3. Modelos individuales
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

  // 4. Acciones rápidas al final
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
  items.push({
    label: `$(eye) ${t('quickPick.togglePoolView')}`,
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
  } else if (selection.label.includes(t('quickPick.togglePoolView'))) {
    await vscode.commands.executeCommand('agPro.togglePoolView');
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
