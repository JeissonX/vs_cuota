import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWebviewContent, type PanelRenderData } from '../src/context/panelHtml';

const mockData: PanelRenderData = {
  session: {
    id: 'test-session-1234567890abcdef',
    path: 'C:/fake/path/session.db',
    mtime: Date.now(),
    isPinned: true,
  },
  inference: {
    stepIndex: 1,
    timestamp: Date.now(),
    modelName: 'claude-3-5-sonnet',
    modelSlug: 'claude-3-5-sonnet',
    usage: {
      input: 1000,
      output: 200,
      cacheRead: 500,
      thoughts: 50,
      inputNoCache: 500,
    },
    latencyMs: 1200,
  },
  health: {
    trafficLight: 'GREEN',
    badge: 'NORMAL',
    freshTokens: 500,
    modelDisplayName: 'Claude 3.5 Sonnet',
    trafficLightBasis: 'carga relativa a tu historial',
    badgeBasis: 'ocupación de la ventana del modelo',
  },
  estimatedComposition: {
    userPercent: 35,
    toolsSystemPercent: 65,
  },
  contentionNotice: true,
};

describe('Hito 2E: CSP estricta con nonce en Panel Context Auditor Standalone', () => {
  const testCspSource = 'https://*.vscode-cdn.net';

  it('contiene <meta Content-Security-Policy> con directivas exactas y style-src / script-src con nonce', () => {
    const html = getWebviewContent(mockData, testCspSource);

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

  it('toda etiqueta <script> y <style> tiene el atributo nonce="<valor>"', () => {
    const html = getWebviewContent(mockData, testCspSource);

    const tags = Array.from(html.matchAll(/<(script|style)\b([^>]*)>/gi));
    assert.ok(tags.length >= 2, 'Debe contener al menos una etiqueta style y una script');
    for (const match of tags) {
      const tagKind = match[1];
      const attributes = match[2];
      assert.match(
        attributes,
        /\bnonce="[A-Za-z0-9+/=]{20,}"/,
        `La etiqueta <${tagKind}> debe tener un atributo nonce no vacío`,
      );
    }
  });

  it('dos llamadas consecutivas a getWebviewContent generan nonces distintos', () => {
    const html1 = getWebviewContent(mockData, testCspSource);
    const html2 = getWebviewContent(mockData, testCspSource);

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

  it('el HTML completo retornado NO contiene onclick=, style=", style=\', unsafe-inline ni vscode-resource:', () => {
    const html = getWebviewContent(mockData, testCspSource);

    assert.ok(!html.includes('onclick='), 'No debe contener ningún atributo onclick=');
    assert.ok(!html.includes('style="'), 'No debe contener ningún atributo style="');
    assert.ok(!html.includes("style='"), "No debe contener ningún atributo style='");
    assert.ok(
      !html.includes('unsafe-inline'),
      'No debe contener unsafe-inline en ninguna parte',
    );
    assert.ok(
      !html.includes('vscode-resource:'),
      'No debe contener el esquema de protocolo obsoleto vscode-resource:',
    );
  });

  it('soporta invocación con cspSource por defecto y genera CSP válida', () => {
    const htmlDefault = getWebviewContent(mockData);

    assert.ok(
      htmlDefault.includes('<meta http-equiv="Content-Security-Policy"'),
      'Debe contener la etiqueta meta Content-Security-Policy con el default',
    );
    assert.ok(
      htmlDefault.includes('https://file+.vscode-resource.vscode-cdn.net'),
      'Debe incluir el cspSource por defecto',
    );
    assert.ok(!htmlDefault.includes('onclick='), 'No debe contener onclick=');
    assert.ok(!htmlDefault.includes('style="'), 'No debe contener style="');
    assert.ok(!htmlDefault.includes("style='"), "No debe contener style='");
    assert.ok(!htmlDefault.includes('unsafe-inline'), 'No debe contener unsafe-inline');
    assert.ok(!htmlDefault.includes('vscode-resource:'), 'No debe contener vscode-resource:');
  });
});
