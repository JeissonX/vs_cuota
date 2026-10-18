import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  // Context Auditor Extension Activator (Scaffold)
  const disposable = vscode.commands.registerCommand('contextAuditor.openPanel', () => {
    vscode.window.showInformationMessage('Context Auditor: Inicializado correctamente.');
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Clean up
}
