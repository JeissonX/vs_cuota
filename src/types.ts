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

// ============================================================================
// Tipos de Calibración y Protobuf (v1.2.0)
// ============================================================================

export type PoolId = 'gemini' | 'claude';
export type WindowId = '5h' | 'weekly';
export const POOLS: readonly PoolId[] = ['gemini', 'claude'];

/** Columnas que se leen de `steps`. `content` NUNCA se selecciona. */
export interface StepRowMeta {
  readonly id: number;
  readonly conversationId: string;
  readonly stepIndex: number;
  readonly stepType: number; // 14 = turno usuario, 15 = inferencia
  readonly status: number; // 3 = completado en Antigravity IDE (o 2)
  readonly createdAt: number; // epoch ms UTC
  readonly updatedAt: number; // epoch ms UTC
  readonly metadata: Uint8Array | null;
}

/**
 * Query de lectura segura. En Antigravity IDE la columna PK es idx.
 */
export const STEP_QUERY =
  'SELECT idx, step_type, status, metadata FROM steps WHERE idx > ? AND step_type = 15 ORDER BY idx ASC';

export const FEATURES = ['inputNoCache', 'cacheRead', 'output', 'thoughts'] as const;
export type Feature = (typeof FEATURES)[number];
export type FeatureVector = Readonly<Record<Feature, number>>;

/** Contadores decodificados del campo 9 del protobuf. */
export interface TokenUsage {
  readonly input: number; // total, incluye caché
  readonly inputNoCache: number; // max(0, input - cacheRead)
  readonly cacheRead: number;
  readonly output: number;
  readonly thoughts: number;
}

/** Paso ya decodificado y con el instante de referencia elegido. */
export interface StepUsage {
  readonly id: number;
  readonly conversationId: string;
  readonly ts: number; // epoch ms (createdAt o updatedAt según config)
  readonly usage: TokenUsage;
}

export interface WindowReading {
  readonly remainingFraction: number; // 0..1
  readonly resetAtMs: number; // epoch ms (parseado de resetTime ISO)
}

/** Snapshot para calibración matemática (delta de cuota entre polls) */
export interface CalibrationQuotaSnapshot {
  readonly takenAt: number; // epoch ms local, momento del poll
  readonly pools: Readonly<Record<PoolId, Partial<Record<WindowId, WindowReading>>>>;
}

export interface CalibrationSample {
  readonly pool: PoolId;
  readonly window: WindowId;
  readonly t0: number;
  readonly t1: number;
  readonly deltaPct: number; // puntos porcentuales consumidos (>0)
  readonly x: FeatureVector; // tokens sumados en la ventana alineada
  readonly stepCount: number;
}

export interface CalibrationFit {
  readonly pool: PoolId;
  readonly window: WindowId;
  readonly n: number;
  readonly coefPctPerToken: FeatureVector;
  readonly pctPer1MTokens: FeatureVector;
  readonly r2: number;
  readonly rmsePct: number;
}

