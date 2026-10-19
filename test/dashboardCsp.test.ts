import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, buildLoadingHtml } from '../src/dashboard/dashboardProvider';
import { QuotaHistoryManager } from '../src/historyManager';
import type { QuotaSnapshot, AgProConfig } from '../src/types';
import type { TokenAuditSnapshot } from '../src/phase2/tokenAuditor';
import type { PanelRenderData } from '../src/context/panelHtml';

const mockSnapshot: QuotaSnapshot = {
  timestamp: new Date('2026-10-19T10:00:00Z'),
  isConnected: true,
  latencyMs: 120,
  groups: [
    {
      name: 'gemini-group',
      displayName: 'Gemini Pro',
      buckets: [
        {
          window: '5h',
          remainingFraction: 0.8,
          remainingPercent: 80,
          resetCountdown: '3h 12m',
          resetTime: new Date(Date.now() + 3 * 3600 * 1000),
        },
        {
          window: 'weekly',
          remainingFraction: 0.4,
          remainingPercent: 40,
          resetCountdown: '4d 2h',
          resetTime: new Date(Date.now() + 4 * 24 * 3600 * 1000),
        },
        {
          window: 'custom-window',
          remainingFraction: 0.1,
          remainingPercent: 10,
          resetCountdown: '1h',
          resetTime: new Date(Date.now() + 3600 * 1000),
        },
      ],
    },
  ],
  models: [
    {
      id: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro',
      poolName: 'Gemini Pro',
    },
  ],
};

const mockTokenSnapshot: TokenAuditSnapshot = {
  activeSession: {
    sessionId: 'session-mock-12345',
    userTurns: 5,
    modelTurns: 5,
    totalTokens: 15000,
    totalPromptTokens: 10000,
    totalOutputTokens: 3000,
    totalThoughtTokens: 2000,
    averageTokensPerRequest: 3000,
    isExpensiveSession: false,
    expensiveReason: '',
    requests: [
      {
        stepIndex: 1,
        modelName: 'gemini-1.5-pro',
        totalTokens: 3000,
        promptTokens: 2000,
        outputTokens: 600,
        thoughtTokens: 400,
        durationMs: 1200,
        speedTokensPerSec: 2500,
      },
    ],
  },
  globalMetrics: {
    totalTokens: 50000,
    totalPromptTokens: 35000,
    totalOutputTokens: 10000,
    totalThoughtTokens: 5000,
    totalSessions: 3,
    sessions: [
      {
        sessionId: 'session-mock-12345',
        lastModified: new Date('2026-10-19T09:30:00Z'),
        totalTokens: 15000,
      },
    ],
  },
};

const mockConfig: AgProConfig = {
  statusBarFormat: 'standard',
  statusBarPool: 'both',
  showWindows: 'both',
  criticalThreshold: 5,
  warningThreshold: 20,
  normalThreshold: 50,
  statusPollIntervalMs: 60000,
  debug: false,
  language: 'es',
};

const mockStorage = {
  data: {} as Record<string, unknown>,
  get<T>(key: string, def?: T): T {
    return (this.data[key] as T) ?? (def as T);
  },
  update(key: string, val: unknown) {
    this.data[key] = val;
  },
};
const mockHistoryManager = new QuotaHistoryManager(mockStorage);
mockHistoryManager.recordSnapshot(mockSnapshot);

const mockContextData: PanelRenderData = {
  session: {
    id: 'session-context-12345',
    path: 'C:/test/path',
    mtime: Date.now(),
    isPinned: true,
  },
  inference: {
    stepIndex: 2,
    timestamp: Date.now(),
    modelName: 'gemini-1.5-pro',
    usage: {
      input: 2000,
      output: 500,
      cacheRead: 200,
      thoughts: 100,
      inputNoCache: 1800,
    },
    latencyMs: 800,
  },
  health: {
    trafficLight: 'GREEN',
    badge: 'NORMAL',
    freshTokens: 1800,
    modelDisplayName: 'Gemini 1.5 Pro',
    trafficLightBasis: 'historial',
    badgeBasis: 'ventana',
  },
  estimatedComposition: {
    userPercent: 40,
    toolsSystemPercent: 60,
  },
  contentionNotice: true,
};

describe('Hito 2D: CSP estricta con nonce en Webview Dashboard', () => {
  const testCspSource = 'https://*.vscode-cdn.net';

  it('buildHtml contiene <meta Content-Security-Policy> con directivas exactas', () => {
    const html = buildHtml(
      mockSnapshot,
      mockTokenSnapshot,
      mockConfig,
      mockHistoryManager,
      null,
      false,
      mockContextData,
      'quota',
      testCspSource,
    );

    assert.ok(
      html.includes('<meta http-equiv="Content-Security-Policy"'),
      'Debe contener la etiqueta meta Content-Security-Policy',
    );
    assert.match(
      html,
      /style-src https:\/\/\*\.vscode-cdn\.net 'nonce-[A-Za-z0-9+/=]+';/,
      'style-src debe incluir cspSource y nonce separados por espacio',
    );
    assert.match(
      html,
      /script-src 'nonce-[A-Za-z0-9+/=]+';/,
      'script-src debe incluir nonce',
    );
    assert.ok(
      html.includes("default-src 'none';"),
      "default-src debe ser 'none'",
    );
    assert.ok(
      html.includes(`img-src ${testCspSource} data:;`),
      'img-src debe incluir cspSource y data:',
    );
    assert.ok(
      html.includes(`font-src ${testCspSource};`),
      'font-src debe incluir cspSource',
    );
  });

  it('Toda etiqueta <script> y <style> en buildHtml y buildLoadingHtml tiene nonce="<valor>"', () => {
    const htmlDash = buildHtml(
      mockSnapshot,
      mockTokenSnapshot,
      mockConfig,
      mockHistoryManager,
      null,
      false,
      mockContextData,
      'quota',
      testCspSource,
    );
    const htmlLoading = buildLoadingHtml(testCspSource);

    for (const [name, doc] of [
      ['buildHtml', htmlDash],
      ['buildLoadingHtml', htmlLoading],
    ] as const) {
      const tags = Array.from(doc.matchAll(/<(script|style)\b([^>]*)>/gi));
      assert.ok(tags.length > 0, `${name} debe contener al menos un tag script/style`);
      for (const match of tags) {
        const tagKind = match[1];
        const attributes = match[2];
        assert.match(
          attributes,
          /\bnonce="[A-Za-z0-9+/=]{20,}"/,
          `El tag <${tagKind}> en ${name} debe tener un atributo nonce no vacío`,
        );
      }
    }
  });

  it('Dos llamadas seguidas a buildHtml generan nonces criptográficos distintos', () => {
    const html1 = buildHtml(
      mockSnapshot,
      mockTokenSnapshot,
      mockConfig,
      mockHistoryManager,
      null,
      false,
      mockContextData,
      'quota',
      testCspSource,
    );
    const html2 = buildHtml(
      mockSnapshot,
      mockTokenSnapshot,
      mockConfig,
      mockHistoryManager,
      null,
      false,
      mockContextData,
      'quota',
      testCspSource,
    );

    const nonce1Match = html1.match(/nonce="([A-Za-z0-9+/=]+)"/);
    const nonce2Match = html2.match(/nonce="([A-Za-z0-9+/=]+)"/);

    assert.ok(nonce1Match, 'html1 debe tener un nonce');
    assert.ok(nonce2Match, 'html2 debe tener un nonce');
    assert.notStrictEqual(
      nonce1Match[1],
      nonce2Match[1],
      'Llamadas consecutivas deben generar nonces aleatorios distintos',
    );
  });

  it('El HTML completo generado NO contiene onclick=, style=", style=\', unsafe-inline ni vscode-resource', () => {
    const htmlDash = buildHtml(
      mockSnapshot,
      mockTokenSnapshot,
      mockConfig,
      mockHistoryManager,
      null,
      false,
      mockContextData,
      'quota',
      testCspSource,
    );
    const htmlLoading = buildLoadingHtml(testCspSource);

    for (const [name, doc] of [
      ['buildHtml', htmlDash],
      ['buildLoadingHtml', htmlLoading],
    ] as const) {
      assert.ok(!doc.includes('onclick='), `${name} no debe contener ningún atributo onclick=`);
      assert.ok(!doc.includes('style="'), `${name} no debe contener ningún atributo style="`);
      assert.ok(!doc.includes("style='"), `${name} no debe contener ningún atributo style='`);
      assert.ok(
        !doc.includes('unsafe-inline'),
        `${name} no debe contener unsafe-inline en ninguna parte`,
      );
      assert.ok(
        !doc.includes('vscode-resource:'),
        `${name} no debe contener el protocolo obsoleto vscode-resource:`,
      );
      assert.ok(
        !doc.includes('vscode-resource'),
        `${name} no debe contener vscode-resource cuando se usa cspSource moderno`,
      );
    }
  });
});
