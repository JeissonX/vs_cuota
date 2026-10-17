/**
 * AG Pro Quota — Definiciones de tipos (Fase 1)
 */

/** Resultado del descubrimiento del language server */
export interface ServerConnection {
  port: number;
  csrfToken: string;
  pid: number;
}

/** Información de cuota por bucket (ventana temporal) */
export interface QuotaBucket {
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

/** Configuración leída de agPro.* */
export interface AgProConfig {
  refreshIntervalSeconds: number;
  statusBarFormat: StatusBarFormat;
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
  };
}

export interface RawQuotaGroup {
  displayName?: string;
  buckets?: RawQuotaBucket[];
}

export interface RawQuotaBucket {
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
  };
}

export interface RawClientModelConfig {
  label?: string;
  modelOrAlias?: { model?: string };
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
  };
}
