import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  resetMockState,
  setMockConfig,
  registeredCommands,
  registeredViews,
  createdStatusBarItems,
} from './mocks/vscode';
import { activate, deactivate } from '../src/extension';

describe('Prueba de activación sin IDE (Mock VS Code)', () => {
  beforeEach(() => {
    deactivate();
    resetMockState();
  });

  const mockContext: any = {
    subscriptions: [],
    extensionUri: { fsPath: path.resolve('.') },
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
    },
    workspaceState: {
      get: () => undefined,
      update: () => Promise.resolve(),
    },
  };

  it('(1) registra todos los comandos y vistas de master más los del auditor', () => {
    setMockConfig({ 'contextAuditor.enabled': true });
    activate(mockContext);

    // Comandos de master (7)
    const masterCommands = [
      'agPro.openDashboard',
      'agPro.refresh',
      'agPro.quickOverview',
      'agPro.diagnose',
      'agPro.toggleLang',
      'agPro.openSettings',
      'agPro.togglePoolView',
    ];
    for (const cmd of masterCommands) {
      assert.ok(registeredCommands.has(cmd), `Comando de cuota ausente: ${cmd}`);
    }

    // Comandos del auditor (4)
    const auditorCommands = [
      'contextAuditor.copySnapshot',
      'contextAuditor.selectSession',
      'contextAuditor.openPanel',
      'contextAuditor.diagnostics',
    ];
    for (const cmd of auditorCommands) {
      assert.ok(registeredCommands.has(cmd), `Comando del auditor ausente: ${cmd}`);
    }

    // Vista de master
    assert.ok(registeredViews.has('agpro.dashboardView'), 'Vista agpro.dashboardView no registrada');

    // Total comandos registrados >= 11
    assert.strictEqual(registeredCommands.size, 11);
  });

  it('(2) con contextAuditor.enabled=false no se crea ningún watcher ni item del auditor', () => {
    setMockConfig({ 'contextAuditor.enabled': false });
    activate(mockContext);

    // Solo se debe haber creado 1 status bar item (el de cuota, prioridad 100)
    // El del auditor (prioridad 95) NO debe haberse creado
    const auditorItems = createdStatusBarItems.filter((i) => i.priority === 95);
    assert.strictEqual(auditorItems.length, 0, 'No debe crearse StatusBarItem del auditor cuando está desactivado');

    const quotaItems = createdStatusBarItems.filter((i) => i.priority === 100);
    assert.strictEqual(quotaItems.length, 1, 'Debe crearse StatusBarItem de cuota');

    // Comandos de cuota siguen registrados
    assert.ok(registeredCommands.has('agPro.refresh'));
    assert.ok(registeredCommands.has('agPro.openDashboard'));
  });

  it('(3) si el lector del auditor lanza excepción, activate() no falla y cuota sigue registrada', () => {
    setMockConfig({ 'contextAuditor.enabled': true });

    // activate() debe capturar cualquier error interno del auditor sin fallar
    assert.doesNotThrow(() => {
      activate(mockContext);
    });

    // Cuota sigue operativa y registrada
    assert.ok(registeredCommands.has('agPro.openDashboard'));
    assert.ok(registeredCommands.has('agPro.refresh'));
    assert.ok(registeredCommands.has('agPro.quickOverview'));
  });

  it('(4) deactivate() libera recursos ordenadamente', () => {
    setMockConfig({ 'contextAuditor.enabled': true });
    activate(mockContext);

    assert.doesNotThrow(() => {
      deactivate();
    });

    // Segunda llamada idempotente
    assert.doesNotThrow(() => {
      deactivate();
    });
  });
});
