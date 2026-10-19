import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, serializeForScript } from '../src/dashboard/htmlEscape';
import {
  getContextTabContentHtml,
  getWebviewContent,
  type PanelRenderData,
} from '../src/context/panelHtml';

describe('Sanitización y Escapado Anti-XSS (htmlEscape)', () => {
  it('escapa etiquetas script peligrosas', () => {
    const input = '<script>alert(1)</script>';
    const expected = '&lt;script&gt;alert(1)&lt;/script&gt;';
    assert.strictEqual(escapeHtml(input), expected);
  });

  it('escapa comillas simples y dobles', () => {
    assert.strictEqual(escapeHtml('"test"'), '&quot;test&quot;');
    assert.strictEqual(escapeHtml("'test'"), '&#39;test&#39;');
    assert.strictEqual(
      escapeHtml(`attr="val" and 'other'`),
      'attr=&quot;val&quot; and &#39;other&#39;',
    );
  });

  it('escapa & a &amp; y &amp; de entrada a &amp;amp; (una sola pasada)', () => {
    assert.strictEqual(escapeHtml('&'), '&amp;');
    assert.strictEqual(escapeHtml('A & B'), 'A &amp; B');
    assert.strictEqual(escapeHtml('&amp;'), '&amp;amp;');
    assert.strictEqual(escapeHtml('&lt;tag&gt;'), '&amp;lt;tag&amp;gt;');
  });

  it('maneja null, undefined, números y booleanos', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(0), '0');
    assert.strictEqual(escapeHtml(123.45), '123.45');
    assert.strictEqual(escapeHtml(true), 'true');
    assert.strictEqual(escapeHtml(false), 'false');
  });

  it('serializeForScript neutraliza secuencias de cierre de script en datos', () => {
    const input = '</script><script>';
    const serialized = serializeForScript(input);
    assert.strictEqual(serialized, '"\\u003c/script>\\u003cscript>"');
    assert.ok(!serialized.includes('<'), 'No debe contener el carácter < sin escapar');

    // Manejo de valores primitivos como literales JS válidos
    assert.strictEqual(serializeForScript('simple'), '"simple"');
    assert.strictEqual(serializeForScript(null), 'null');
    assert.strictEqual(serializeForScript(undefined), 'undefined');
    assert.strictEqual(serializeForScript(100), '100');
    assert.strictEqual(serializeForScript(false), 'false');
  });
});

describe('Integración Anti-XSS en plantillas Webview de Context Auditor', () => {
  const maliciousPayload = '<img src=x onerror=alert(1)>';

  const mockData: PanelRenderData = {
    session: {
      id: maliciousPayload,
      path: 'C:/fake/path/session.db',
      mtime: Date.now(),
    },
    inference: {
      stepIndex: 1,
      timestamp: Date.now(),
      modelName: maliciousPayload,
      modelSlug: maliciousPayload,
      usage: {
        input: 1000,
        output: 200,
        cacheRead: 0,
        thoughts: 50,
        inputNoCache: 1000,
      },
    },
    health: {
      trafficLight: 'GREEN',
      badge: 'NORMAL',
      freshTokens: 1000,
      modelDisplayName: maliciousPayload,
    },
  };

  it('getContextTabContentHtml neutraliza vectores de inyección en modelo y sesión', () => {
    const html = getContextTabContentHtml(mockData);

    assert.ok(
      !html.includes('<img src=x'),
      'El HTML de la pestaña no debe contener la etiqueta <img src=x sin escapar',
    );
    assert.ok(
      html.includes('&lt;img'),
      'El HTML de la pestaña debe contener &lt;img escapado',
    );
  });

  it('getWebviewContent neutraliza vectores de inyección en la plantilla autónoma completa', () => {
    const html = getWebviewContent(mockData);

    assert.ok(
      !html.includes('<img src=x'),
      'El documento HTML completo no debe contener la etiqueta <img src=x sin escapar',
    );
    assert.ok(
      html.includes('&lt;img'),
      'El documento HTML completo debe contener &lt;img escapado',
    );
  });
});
