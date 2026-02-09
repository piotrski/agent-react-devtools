import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTempStateDir,
  getTestPort,
  startDaemon,
  waitForDaemon,
  stopDaemon,
  sendIpcCommand,
  sleep,
} from './helpers.js';
import type { ChildProcess } from 'node:child_process';

describe('Daemon lifecycle', () => {
  let stateDir: string;
  let port: number;
  let daemon: ChildProcess | null = null;

  beforeEach(() => {
    stateDir = createTempStateDir();
    port = getTestPort();
  });

  afterEach(async () => {
    await stopDaemon(daemon, stateDir);
    daemon = null;
  });

  it('should start and respond to ping', async () => {
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);

    const socketPath = path.join(stateDir, 'daemon.sock');
    const resp = await sendIpcCommand(socketPath, { type: 'ping' });
    expect(resp.ok).toBe(true);
    expect(resp.data).toBe('pong');
  });

  it('should write daemon.json on start', async () => {
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);

    const infoPath = path.join(stateDir, 'daemon.json');
    expect(fs.existsSync(infoPath)).toBe(true);

    const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    expect(info.pid).toBe(daemon!.pid);
    expect(info.port).toBe(port);
  });

  it('should report status', async () => {
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);

    const socketPath = path.join(stateDir, 'daemon.sock');
    const resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);

    const status = resp.data as {
      daemonRunning: boolean;
      port: number;
      connectedApps: number;
      componentCount: number;
      profilingActive: boolean;
    };
    expect(status.daemonRunning).toBe(true);
    expect(status.port).toBe(port);
    expect(status.connectedApps).toBe(0);
    expect(status.componentCount).toBe(0);
    expect(status.profilingActive).toBe(false);
  });

  it('should shut down cleanly on SIGTERM', async () => {
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);

    daemon.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      daemon!.on('exit', () => resolve());
    });

    // Socket should be cleaned up
    await sleep(200);
    const socketPath = path.join(stateDir, 'daemon.sock');
    expect(fs.existsSync(socketPath)).toBe(false);
  });
});
