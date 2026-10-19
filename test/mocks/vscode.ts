/**
 * Mock completo de la API de VS Code para pruebas de activación en Node.js
 */

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

export interface MockCommand {
  command: string;
  callback: (...args: any[]) => any;
  thisArg?: any;
}

export const registeredCommands = new Map<string, (...args: any[]) => any>();
export const registeredViews = new Map<string, any>();
export const createdStatusBarItems: any[] = [];
export const outputChannels: string[] = [];

export const commands = {
  registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any) {
    registeredCommands.set(command, thisArg ? callback.bind(thisArg) : callback);
    return {
      dispose: () => {
        registeredCommands.delete(command);
      },
    };
  },
  executeCommand(command: string, ...args: any[]) {
    const fn = registeredCommands.get(command);
    if (fn) return Promise.resolve(fn(...args));
    return Promise.resolve();
  },
};

export const window = {
  state: {
    focused: true,
  },
  createOutputChannel(name: string) {
    outputChannels.push(name);
    return {
      name,
      append: () => {},
      appendLine: () => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    };
  },
  createStatusBarItem(alignment?: StatusBarAlignment, priority?: number) {
    const item = {
      alignment,
      priority,
      text: '',
      tooltip: '',
      command: '',
      color: undefined as any,
      name: '',
      visible: false,
      show() {
        this.visible = true;
      },
      hide() {
        this.visible = false;
      },
      dispose() {
        this.visible = false;
      },
    };
    createdStatusBarItems.push(item);
    return item;
  },
  registerWebviewViewProvider(viewId: string, provider: any) {
    registeredViews.set(viewId, provider);
    return {
      dispose: () => {
        registeredViews.delete(viewId);
      },
    };
  },
  createWebviewPanel() {
    return {
      reveal: () => {},
      dispose: () => {},
      onDidDispose: () => ({ dispose: () => {} }),
      webview: {
        html: '',
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => Promise.resolve(true),
      },
    };
  },
  showInformationMessage: () => Promise.resolve(),
  showWarningMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  showQuickPick: () => Promise.resolve(undefined),
  withProgress: async (_options: any, task: any) => {
    return task({ report: () => {} });
  },
};

let mockConfigValues: Record<string, any> = {};

export function setMockConfig(values: Record<string, any>) {
  mockConfigValues = { ...values };
}

export function resetMockState() {
  registeredCommands.clear();
  registeredViews.clear();
  createdStatusBarItems.length = 0;
  outputChannels.length = 0;
  mockConfigValues = {};
}

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration(section?: string) {
    return {
      get<T>(key: string, defaultValue?: T): T {
        const fullKey = section ? `${section}.${key}` : key;
        if (fullKey in mockConfigValues) return mockConfigValues[fullKey];
        if (key in mockConfigValues) return mockConfigValues[key];
        return defaultValue as T;
      },
      update: () => Promise.resolve(),
    };
  },
  onDidChangeConfiguration(_cb: (e: { affectsConfiguration: (s: string) => boolean }) => void) {
    return { dispose: () => {} };
  },
};

export const env = {
  clipboard: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  },
};

export class MarkdownString {
  public value: string = '';
  public isTrusted: boolean = false;
  constructor(value = '') {
    this.value = value;
  }
  appendMarkdown(str: string) {
    this.value += str;
    return this;
  }
}
