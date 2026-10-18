import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { SessionWatcher } from '../src/sessionWatcher';

class MockWorkspaceState {
  private readonly store = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
  }
}

test('SessionWatcher: detecta bases, ordena por mtime y considera WAL', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-'));

  const db1 = path.join(tmpDir, 'session-aaa.db');
  const db2 = path.join(tmpDir, 'session-bbb.db');
  const db2Wal = path.join(tmpDir, 'session-bbb.db-wal');

  // db1 creado primero
  fs.writeFileSync(db1, 'fake sqlite 1');
  const pastTime = (Date.now() - 50000) / 1000;
  fs.utimesSync(db1, pastTime, pastTime);

  // db2 creado después con WAL
  fs.writeFileSync(db2, 'fake sqlite 2');
  const midTime = (Date.now() - 20000) / 1000;
  fs.utimesSync(db2, midTime, midTime);

  fs.writeFileSync(db2Wal, 'fake wal buffer');
  const recentTime = Date.now() / 1000;
  fs.utimesSync(db2Wal, recentTime, recentTime);

  const mockContext = {
    workspaceState: new MockWorkspaceState(),
  } as any;

  const watcher = new SessionWatcher(mockContext, tmpDir);
  const state = watcher.scan();

  assert.equal(state.recentSessions.length, 2);
  assert.equal(state.activeSession?.id, 'session-bbb');
  assert.ok(state.activeSession.walSize > 0);

  // Limpiar
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SessionWatcher: detecta contención si múltiples DBs reciben escrituras en ventana de 2s', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-contention-'));

  const db1 = path.join(tmpDir, 'sess-1.db');
  const db2 = path.join(tmpDir, 'sess-2.db');

  fs.writeFileSync(db1, 'data 1');
  fs.writeFileSync(db2, 'data 2');

  const nowSec = Date.now() / 1000;
  fs.utimesSync(db1, nowSec, nowSec);
  fs.utimesSync(db2, nowSec, nowSec);

  const mockContext = {
    workspaceState: new MockWorkspaceState(),
  } as any;

  const watcher = new SessionWatcher(mockContext, tmpDir);
  const state = watcher.scan();

  // Ambas modificadas hace menos de 2s
  assert.equal(state.hasContention, true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SessionWatcher: sesión fijada (pinned) prevalece sobre la más reciente', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-pinned-'));

  const dbOlder = path.join(tmpDir, 'sess-older.db');
  const dbNewer = path.join(tmpDir, 'sess-newer.db');

  fs.writeFileSync(dbOlder, 'older');
  fs.writeFileSync(dbNewer, 'newer');

  const nowSec = Date.now() / 1000;
  fs.utimesSync(dbOlder, nowSec - 100, nowSec - 100);
  fs.utimesSync(dbNewer, nowSec, nowSec);

  const mockWs = new MockWorkspaceState();
  const mockContext = {
    workspaceState: mockWs,
  } as any;

  const watcher = new SessionWatcher(mockContext, tmpDir);
  let state = watcher.scan();
  assert.equal(state.activeSession?.id, 'sess-newer');

  // Fijar sesión más antigua manualmente
  await watcher.setPinnedSessionId('sess-older');
  state = watcher.state;
  assert.equal(state.activeSession?.id, 'sess-older');
  assert.equal(state.activeSession.isPinned, true);

  // Desfijar
  await watcher.setPinnedSessionId(null);
  state = watcher.state;
  assert.equal(state.activeSession?.id, 'sess-newer');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
