/**
 * AG Pro Quota — Notificaciones al cruzar umbrales
 *
 * Envía avisos visuales en VS Code únicamente cuando un modelo desciende
 * bajo los umbrales configurados (warning/critical/depleted), evitando
 * alertas redundantes o spam continuo.
 */

import * as vscode from 'vscode';
import type { QuotaSnapshot, AgProConfig } from './types';
import { QuotaLevel } from './types';
import { getQuotaLevel } from './quotaParser';
import { t } from './i18n';
import { logger } from './logger';

type NotificationLevel = QuotaLevel.Warning | QuotaLevel.Critical | QuotaLevel.Depleted;

/** Registro de la última notificación enviada por modelo */
const notifiedLevels = new Map<string, NotificationLevel>();

/**
 * Revisa el snapshot y dispara notificaciones si se cruzan umbrales.
 */
export function checkAndNotify(snapshot: QuotaSnapshot, config: AgProConfig): void {
  if (!config.notificationsEnabled || !snapshot.isConnected) {
    return;
  }

  for (const model of snapshot.models) {
    const pct = model.remainingPercent;
    if (pct === null) continue;

    const level = getQuotaLevel(pct, config.warningThreshold, config.criticalThreshold);
    if (level === QuotaLevel.Normal) {
      // Si la cuota se recuperó al rango normal, reseteamos el modelo
      notifiedLevels.delete(model.modelId);
      continue;
    }

    const notifLevel = level as NotificationLevel;
    const previousLevel = notifiedLevels.get(model.modelId);

    // Evitar spam si ya se notificó el mismo nivel o uno más grave
    if (previousLevel === notifLevel) continue;
    if (previousLevel === QuotaLevel.Depleted) continue;
    if (previousLevel === QuotaLevel.Critical && notifLevel === QuotaLevel.Warning) continue;

    const message = buildNotificationMessage(model.label, pct, notifLevel, config);
    switch (notifLevel) {
      case QuotaLevel.Depleted:
        vscode.window.showErrorMessage(message);
        break;
      case QuotaLevel.Critical:
        vscode.window.showWarningMessage(message);
        break;
      case QuotaLevel.Warning:
      default:
        vscode.window.showWarningMessage(message);
        break;
    }

    notifiedLevels.set(model.modelId, notifLevel);
    logger.info(`Notificación enviada: ${model.label} → ${notifLevel} (${pct}%)`);
  }
}

function buildNotificationMessage(
  modelLabel: string,
  percent: number,
  level: NotificationLevel,
  config: AgProConfig,
): string {
  let title: string;
  let detail: string;

  switch (level) {
    case QuotaLevel.Depleted:
      title = t('notification.depleted');
      detail = t('notification.isDepleted');
      break;
    case QuotaLevel.Critical:
      title = t('notification.critical');
      detail = t('notification.belowCritical', {
        percent,
        threshold: config.criticalThreshold,
      });
      break;
    case QuotaLevel.Warning:
    default:
      title = t('notification.warning');
      detail = t('notification.belowWarning', {
        percent,
        threshold: config.warningThreshold,
      });
      break;
  }

  return `${title}: ${modelLabel} ${detail}`;
}

/**
 * Limpia el estado de notificaciones enviadas (útil para pruebas o re-activación).
 */
export function resetNotifications(): void {
  notifiedLevels.clear();
}
