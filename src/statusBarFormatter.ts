/**
 * AG Pro Quota — Formateador de Barra de Estado (Pure logic, sin dependencia de vscode)
 */

import type { QuotaGroup, AgProConfig } from './types';
import { QuotaLevel } from './types';
import {
  getQuotaLevel,
  get5hBucket,
  getWeeklyBucket,
  formatPoolShortName,
} from './quotaParser';

/**
 * Formatea el texto visible para la lista de pools según el modo y configuración.
 */
export function formatStatusBarPoolsText(groups: QuotaGroup[], config: AgProConfig): string {
  if (config.statusBarFormat === 'icon') {
    return '$(rocket)';
  }

  const parts: string[] = [];

  for (const group of groups) {
    const shortName = formatPoolShortName(group.displayName);
    const b5h = get5hBucket(group);
    const bWeekly = getWeeklyBucket(group);
    const lowest = group.lowestPercent;
    const level = getQuotaLevel(lowest, config.warningThreshold, config.criticalThreshold);

    const dot =
      level === QuotaLevel.Depleted || level === QuotaLevel.Critical
        ? '🔴'
        : level === QuotaLevel.Warning
          ? '🟡'
          : '🟢';

    let valStr = '';
    if (config.statusBarShowWindows === 'both') {
      const p5h = b5h ? `${b5h.remainingPercent}%` : `${lowest}%`;
      const pWk = bWeekly ? `${bWeekly.remainingPercent}%` : `${lowest}%`;
      valStr = `${p5h}/${pWk}`;
    } else {
      valStr = `${lowest}%`;
    }

    switch (config.statusBarFormat) {
      case 'dot':
        parts.push(dot);
        break;
      case 'percent':
        parts.push(valStr);
        break;
      case 'compact':
        parts.push(`${dot} ${valStr}`);
        break;
      case 'namePercent':
        parts.push(
          config.statusBarPoolView && config.statusBarPoolView !== 'all'
            ? `${shortName}: ${valStr}`
            : `${shortName} ${valStr}`,
        );
        break;
      case 'standard':
      default:
        parts.push(
          config.statusBarPoolView && config.statusBarPoolView !== 'all'
            ? `${shortName}: ${valStr}`
            : `${dot} ${shortName} ${valStr}`,
        );
        break;
    }
  }

  return parts.join(' · ');
}
