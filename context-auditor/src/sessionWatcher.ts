/**
 * Context Auditor — Detector y Vigilante de Conversación Activa
 *
 * Combina fs.watch sobre .db-wal con debounce, sondeo de respaldo periódico
 * condicionado al foco de ventana (vscode.window.state.focused) y resolución
 * de conflictos con QuickPick persistido en workspaceState.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type * as vscode from 'vscode';

export interface WorkspaceStateStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface SessionInfo {
  readonly id: string;
  readonly dbPath: string;
  readonly lastModifiedMs: number;
  readonly walSize: number;
  readonly isPinned: boolean;
}

export interface WatcherState {
  readonly activeSession: SessionInfo | null;
  readonly hasContention: boolean;
  readonly recentSessions: SessionInfo[];
}

export type SessionChangeCallback = (state: WatcherState) => void;

function getVscode(): typeof import('vscode') | null {
  try {
    return require('vscode');
  } catch {
    return null;
  }
}

export class SessionWatcher {
  private readonly convDir: string;
  private readonly workspaceState?: WorkspaceStateStorage;
  private fsWatcher: fs.FSWatcher | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly listeners: Set<SessionChangeCallback> = new Set();

  private currentState: WatcherState = {
    activeSession: null,
    hasContention: false,
    recentSessions: [],
  };

  private readonly recentWriteTimestamps: Map<string, number> = new Map();

  constructor(
    contextOrStorage?: WorkspaceStateStorage | { workspaceState: WorkspaceStateStorage },
    customConvDir?: string
  ) {
    if (contextOrStorage && 'workspaceState' in contextOrStorage) {
      this.workspaceState = contextOrStorage.workspaceState;
    } else {
      this.workspaceState = contextOrStorage;
    }
    this.convDir = customConvDir ?? path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations');
  }

  public get state(): WatcherState {
    return this.currentState;
  }

  public onSessionChange(cb: SessionChangeCallback): { dispose: () => void } {
    this.listeners.add(cb);
    return {
      dispose: () => {
        this.listeners.delete(cb);
      },
    };
  }

  public start(): void {
    if (!fs.existsSync(this.convDir)) {
      return;
    }

    // 1. Escaneo inicial
    this.scan();

    // 2. fs.watch sobre el directorio de conversaciones
    try {
      this.fsWatcher = fs.watch(this.convDir, (_eventType, filename) => {
        if (!filename) return;
        const name = filename.toString();
        if (name.endsWith('.db') || name.endsWith('.db-wal')) {
          const id = name.replace('.db-wal', '').replace('.db', '');
          this.recentWriteTimestamps.set(id, Date.now());
          this.triggerDebouncedScan();
        }
      });
    } catch {
      // Si fs.watch falla (ej. permisos), el sondeo de respaldo toma el relevo
    }

    // 3. Sondeo de respaldo cada 3.5 segundos mientras la ventana tenga foco
    this.pollInterval = setInterval(() => {
      const vs = getVscode();
      const hasFocus = vs?.window?.state ? vs.window.state.focused : true;
      if (hasFocus) {
        this.scan();
      }
    }, 3500);
  }

  public stop(): void {
    if (this.fsWatcher) {
      try { this.fsWatcher.close(); } catch { /* ignore */ }
      this.fsWatcher = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.listeners.clear();
  }

  private triggerDebouncedScan(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.scan();
    }, 500);
  }

  public scan(): WatcherState {
    if (!fs.existsSync(this.convDir)) {
      return this.currentState;
    }

    let files: string[] = [];
    try {
      files = fs.readdirSync(this.convDir);
    } catch {
      return this.currentState;
    }

    const dbFiles = files.filter(f => f.endsWith('.db'));
    const sessions: SessionInfo[] = [];
    const now = Date.now();
    const pinnedId = this.getPinnedSessionId();

    for (const dbName of dbFiles) {
      const fullPath = path.join(this.convDir, dbName);
      const id = dbName.replace('.db', '');
      try {
        const dbStat = fs.statSync(fullPath);
        const walPath = fullPath + '-wal';
        let walMtime = 0;
        let walSize = 0;

        if (fs.existsSync(walPath)) {
          const walStat = fs.statSync(walPath);
          walMtime = walStat.mtimeMs;
          walSize = walStat.size;
        }

        const effectiveMtime = Math.max(dbStat.mtimeMs, walMtime);

        sessions.push({
          id,
          dbPath: fullPath,
          lastModifiedMs: effectiveMtime,
          walSize,
          isPinned: id === pinnedId,
        });
      } catch {
        // archivo bloqueado o borrado
      }
    }

    // Ordenar de más reciente a más antiguo
    sessions.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);

    // Detección de contención: más de una base modificada en ventana de 2 segundos (2000 ms)
    let contendingCount = 0;
    const contentionWindowMs = 2000;
    for (const s of sessions) {
      const recentWrite = this.recentWriteTimestamps.get(s.id) ?? 0;
      if (now - recentWrite <= contentionWindowMs || now - s.lastModifiedMs <= contentionWindowMs) {
        contendingCount++;
      }
    }
    const hasContention = contendingCount > 1;

    // Determinar sesión activa: si hay pinned y existe, tiene prioridad
    let activeSession: SessionInfo | null = null;
    if (pinnedId) {
      const foundPinned = sessions.find(s => s.id === pinnedId);
      if (foundPinned) {
        activeSession = foundPinned;
      }
    }

    if (!activeSession && sessions.length > 0) {
      activeSession = sessions[0] ?? null;
    }

    this.currentState = {
      activeSession,
      hasContention,
      recentSessions: sessions.slice(0, 10),
    };

    // Notificar listeners
    for (const listener of this.listeners) {
      try {
        listener(this.currentState);
      } catch {
        // ignore callback error
      }
    }

    return this.currentState;
  }

  public getPinnedSessionId(): string | null {
    if (!this.workspaceState) return null;
    return this.workspaceState.get<string>('contextAuditor.pinnedSessionId') ?? null;
  }

  public async setPinnedSessionId(id: string | null): Promise<void> {
    if (!this.workspaceState) return;
    await this.workspaceState.update('contextAuditor.pinnedSessionId', id ?? undefined);
    this.scan();
  }

  public async promptSessionSelection(): Promise<void> {
    const vs = getVscode();
    if (!vs) return;

    const sessions = this.currentState.recentSessions;
    const pinnedId = this.getPinnedSessionId();

    const items: (vscode.QuickPickItem & { sessionId?: string | null })[] = [];

    items.push({
      label: '$(sync) Detección automática',
      description: pinnedId ? 'Quitar fijado manual' : 'Activo actualmente',
      sessionId: null,
    });

    for (const s of sessions) {
      const isCurrent = s.id === this.currentState.activeSession?.id;
      const isPinned = s.id === pinnedId;
      const tag = isPinned ? ' [Fijada]' : isCurrent ? ' [Activa]' : '';
      const dateStr = new Date(s.lastModifiedMs).toLocaleTimeString();

      items.push({
        label: `$(database) ${s.id.slice(0, 8)}...${s.id.slice(-4)}${tag}`,
        description: `Modificada: ${dateStr}${s.walSize > 0 ? ` (WAL: ${(s.walSize / 1024).toFixed(0)} KB)` : ''}`,
        detail: s.dbPath,
        sessionId: s.id,
      });
    }

    const selected = await vs.window.showQuickPick(items, {
      placeHolder: 'Selecciona una conversación para Context Auditor',
      title: 'Context Auditor: Fijar Sesión Activa',
    });

    if (selected !== undefined) {
      await this.setPinnedSessionId(selected.sessionId ?? null);
      vs.window.showInformationMessage(
        selected.sessionId
          ? `Context Auditor: Sesión fijada en ${selected.sessionId.slice(0, 8)}...`
          : 'Context Auditor: Restaurada detección automática.'
      );
    }
  }
}
