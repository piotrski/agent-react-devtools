import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import {
  createTempStateDir,
  getTestPort,
  startDaemon,
  waitForDaemon,
  stopDaemon,
  connectMockApp,
  sendOperations,
  buildOperations,
  rootOp,
  addOp,
  ELEMENT_TYPE_FUNCTION,
  ELEMENT_TYPE_MEMO,
  ELEMENT_TYPE_HOST,
  runCli,
  sleep,
} from './helpers.js';

describe('CLI commands (e2e)', () => {
  let stateDir: string;
  let port: number;
  let daemon: ChildProcess | null = null;
  let ws: WebSocket | null = null;

  beforeEach(async () => {
    stateDir = createTempStateDir();
    port = getTestPort();
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);
    ws = await connectMockApp(port);

    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      addOp(2, ELEMENT_TYPE_MEMO, 1, s('Header')),
      addOp(3, ELEMENT_TYPE_FUNCTION, 1, s('UserProfile')),
      addOp(4, ELEMENT_TYPE_HOST, 1, s('div')),
    ]);
    sendOperations(ws!, ops);
    await sleep(300);
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await stopDaemon(daemon, stateDir);
    daemon = null;
    ws = null;
  });

  it('should display status', async () => {
    const result = await runCli(['status'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('running');
    expect(result.stdout).toContain(String(port));
  });

  it('should get component tree', async () => {
    const result = await runCli(['get', 'tree'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('App');
    expect(result.stdout).toContain('Header');
    expect(result.stdout).toContain('UserProfile');
  });

  it('should find components by name', async () => {
    const result = await runCli(['find', 'User'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('UserProfile');
  });

  it('should count components', async () => {
    const result = await runCli(['count'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('5 components');
  });

  it('should show help', async () => {
    const result = await runCli(['--help'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });
});
