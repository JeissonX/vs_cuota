/**
 * Context Auditor — Definiciones de Tipos
 */

export interface TokenUsage {
  readonly input: number; // total, incluye caché (campo 9.5)
  readonly inputNoCache: number; // max(0, input - cacheRead)
  readonly cacheRead: number; // campo 9.6
  readonly output: number; // campo 9.3
  readonly thoughts: number; // campo 9.2
}

export interface InferenceStep {
  readonly idx: number;
  readonly stepType: number;
  readonly modelId?: number;
  readonly modelSlug?: string;
  readonly modelName?: string;
  readonly usage: TokenUsage;
  readonly startTimestamp?: { sec: number; ns: number } | null;
  readonly endTimestamp?: { sec: number; ns: number } | null;
  readonly latencyMs?: number | null;
}

export type SchemaGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly statusMessage: string; readonly missingColumns: string[] };

export type TrafficLightState = 'GREEN' | 'YELLOW' | 'RED';

export type ContextBadgeState = 'NORMAL' | 'DENSO' | 'CRITICO';

export interface HealthAssessment {
  readonly freshTokens: number;
  readonly trafficLight: TrafficLightState;
  readonly badge: ContextBadgeState;
  readonly occupancyPercent: number;
  readonly windowLimit: number;
  readonly latencyInputMs?: number | null;
  readonly trafficLightBasis?: string;
  readonly badgeBasis?: string;
  readonly detectedFamily?: 'gemini' | 'claude' | 'unknown';
  readonly modelDisplayName?: string;
}

export interface ToolCallRecord {
  readonly toolName: string;
  readonly args: Record<string, unknown> | null;
  readonly exitCode?: number | null;
  readonly output?: string | null;
  readonly targetUri?: string | null;
}

export interface ConversationTurn {
  readonly idx: number;
  readonly role: 'user' | 'assistant' | 'tool';
  readonly text: string;
  readonly toolName?: string;
}

export interface MigrationSnapshot {
  readonly environment: {
    readonly workspace: string;
    readonly gitBranch: string;
    readonly gitSummary: string;
  };
  readonly lastInteraction: {
    readonly lastAssistant: string;
    readonly lastUser: string;
  };
  readonly boundedHistory: {
    readonly firstUser: string;
    readonly intermediates: string[];
  };
  readonly modifiedFiles: string[];
  readonly lastCommands?: { command: string; exitCode: number | null }[];
  readonly resumeDirective: string;
}
