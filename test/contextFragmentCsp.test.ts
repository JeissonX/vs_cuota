import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getContextTabContentHtml,
  CONTEXT_TAB_JS,
  type PanelRenderData,
} from '../src/context/panelHtml';

const baseMockData: PanelRenderData = {
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

describe('Hito 2C: Fragmento de Contexto sin Inline Handlers ni Estilos Inline (CSP)', () => {
  it('getContextTabContentHtml: no contiene onclick= ni style="', () => {
    const html = getContextTabContentHtml(baseMockData);

    assert.ok(!html.includes('onclick='), 'No debe contener ningún atributo onclick=');
    assert.ok(!html.includes('style="'), 'No debe contener ningún atributo style="');
    assert.ok(!html.includes("style='"), "No debe contener ningún atributo style='");
  });

  it('getContextTabContentHtml: contiene data-action="selectSession" y data-action="copySnapshot"', () => {
    const html = getContextTabContentHtml(baseMockData);

    assert.ok(
      html.includes('data-action="selectSession"'),
      'Debe contener botón con data-action="selectSession"',
    );
    assert.ok(
      html.includes('data-action="copySnapshot"'),
      'Debe contener botón con data-action="copySnapshot"',
    );
  });

  it('todo data-percent es un número entre 0 y 100 con datos normales', () => {
    const html = getContextTabContentHtml(baseMockData);
    const matches = Array.from(html.matchAll(/data-percent="([^"]*)"/g));

    assert.ok(matches.length > 0, 'Debe haber elementos con data-percent');
    for (const match of matches) {
      const valStr = match[1];
      const valNum = Number(valStr);
      assert.ok(
        Number.isInteger(valNum),
        `El valor de data-percent="${valStr}" debe ser un entero`,
      );
      assert.ok(
        valNum >= 0 && valNum <= 100,
        `El valor ${valNum} debe estar acotado entre 0 y 100`,
      );
    }
  });

  it('todo data-percent es un número entre 0 y 100 con datos extremos (>100 y NaN)', () => {
    const extremeMockData: PanelRenderData = {
      session: null,
      inference: {
        stepIndex: 99,
        timestamp: Date.now(),
        modelName: 'test-extreme',
        usage: {
          input: 9999999,
          output: 9999999,
          cacheRead: 9999999,
          thoughts: 9999999,
          inputNoCache: 9999999,
        },
      },
      health: {
        trafficLight: 'RED',
        badge: 'CRITICO',
        freshTokens: 9999999,
      },
      estimatedComposition: {
        userPercent: 250, // > 100
        toolsSystemPercent: NaN, // NaN
      },
    };

    const html = getContextTabContentHtml(extremeMockData);
    assert.ok(!html.includes('onclick='), 'No debe contener onclick= con datos extremos');
    assert.ok(!html.includes('style="'), 'No debe contener style=" con datos extremos');

    const matches = Array.from(html.matchAll(/data-percent="([^"]*)"/g));
    assert.ok(matches.length > 0, 'Debe haber elementos con data-percent con datos extremos');
    for (const match of matches) {
      const valStr = match[1];
      const valNum = Number(valStr);
      assert.ok(
        !Number.isNaN(valNum),
        `El valor de data-percent="${valStr}" no debe ser NaN`,
      );
      assert.ok(
        valNum >= 0 && valNum <= 100,
        `El valor ${valNum} debe estar entre 0 y 100 incluso con datos extremos`,
      );
    }

    // Verificar explícitamente que 250 fue acotado a 100 y NaN a 0
    assert.ok(
      html.includes('data-percent="100"'),
      'userPercent 250 debe acotarse a data-percent="100"',
    );
    assert.ok(
      html.includes('data-percent="0"'),
      'toolsSystemPercent NaN debe acotarse a data-percent="0"',
    );
  });

  it('CONTEXT_TAB_JS no contiene setAttribute(\'style\'', () => {
    assert.ok(
      !CONTEXT_TAB_JS.includes("setAttribute('style'"),
      'CONTEXT_TAB_JS no debe usar setAttribute(\'style\')',
    );
    assert.ok(
      !CONTEXT_TAB_JS.includes('setAttribute("style"'),
      'CONTEXT_TAB_JS no debe usar setAttribute("style")',
    );
  });
});
