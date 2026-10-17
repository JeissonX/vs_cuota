/**
 * AG Pro Quota — Definiciones de tipos (v1.1.0)
 */

/** Resultado del descubrimiento del language server */
export interface ServerConnection {
  port: number;
  csrfToken: string;
  pid: number;
}

/** Información de cuota por bucket (ventana temporal) */
export interface QuotaBucket {
  bucketId?: string;
  displayName?: string;
  window: 'weekly' | '5h' | string;
  remainingFraction: number;
  remainingPercent: number;
  description: string;
  resetTime: Date | null;
  resetCountdown: string;
}

/** Grupo de cuota (pool compartido) */
export interface QuotaGroup {
  groupId: string;
  displayName: string;
  description?: string;
  buckets: QuotaBucket[];
  /** Porcentaje del bucket más restrictivo */
  lowestPercent: number;
}

/** Información de un modelo individual */
export interface ModelInfo {
  label: string;
  modelId: string;
  remainingFraction: number | null;
  remainingPercent: number | null;
  resetTime: Date | null;
  resetCountdown: string;
  isExhausted: boolean;
  /** A qué pool/grupo pertenece (inferido del displayName del grupo) */
  poolName: string;
}

/** Snapshot completo de cuota en un momento dado */
export interface QuotaSnapshot {
  timestamp: Date;
  isConnected: boolean;
  groups: QuotaGroup[];
  models: ModelInfo[];
  errorMessage?: string;
  latencyMs?: number;
}

/** Niveles de salud de cuota */
export enum QuotaLevel {
  Normal = 'normal',
  Warning = 'warning',
  Critical = 'critical',
  Depleted = 'depleted',
}

/** Formatos de barra de estado */
export type StatusBarFormat = 'icon' | 'dot' | 'percent' | 'compact' | 'namePercent' | 'standard';

/** Modo de visualización de ventanas en la barra de estado */
export type StatusBarWindowsMode = 'both' | 'binding';

/** Modo de selección de pools en la barra de estado */
export type StatusBarPoolView = 'all' | 'gemini' | 'claude';

/** Configuración leída de agPro.* */
export interface AgProConfig {
  refreshIntervalSeconds: number;
  statusBarFormat: StatusBarFormat;
  statusBarShowWindows: StatusBarWindowsMode;
  statusBarPools: string[];
  statusBarPoolView: StatusBarPoolView;
  warningThreshold: number;
  criticalThreshold: number;
  language: 'auto' | 'es' | 'en';
  pinnedModels: string[];
  notificationsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/** Respuesta cruda de RetrieveUserQuotaSummary */
export interface RawQuotaSummaryResponse {
  response?: {
    groups?: RawQuotaGroup[];
    description?: string;
  };
}

export interface RawQuotaGroup {
  displayName?: string;
  description?: string;
  buckets?: RawQuotaBucket[];
}

export interface RawQuotaBucket {
  bucketId?: string;
  displayName?: string;
  window?: string;
  remainingFraction?: number;
  description?: string;
  resetTime?: string;
}

/** Respuesta cruda de GetUserStatus */
export interface RawUserStatusResponse {
  userStatus?: {
    name?: string;
    email?: string;
    cascadeModelConfigData?: {
      clientModelConfigs?: RawClientModelConfig[];
    };
    userTier?: {
      id?: string;
      name?: string;
      description?: string;
    };
  };
}

export interface RawClientModelConfig {
  label?: string;
  modelId?: string;
  modelOrAlias?: { model?: string };
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
  };
}
