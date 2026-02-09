import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import {
  createTempStateDir,
  getTestPort,
  startDaemon,
  waitForDaemon,
  stopDaemon,
  sendIpcCommand,
  connectMockApp,
  sendOperations,
  buildAddOp,
  wsSend,
  sleep,
} from './helpers.js';

describe('Profiling (e2e)', () => {
  let stateDir: string;
  let port: number;
  let daemon: ChildProcess | null = null;
  let ws: WebSocket | null = null;
  let socketPath: string;

  beforeEach(async () => {
    stateDir = createTempStateDir();
    port = getTestPort();
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);
    socketPath = path.join(stateDir, 'daemon.sock');
    ws = await connectMockApp(port);

    // Set up a basic component tree
    const ops = [
      1, 100,
      ...buildAddOp(1, 2, 0, 'App'),
      ...buildAddOp(2, 2, 1, 'Header'),
      ...buildAddOp(3, 2, 1, 'Content'),
    ];
    sendOperations(ws!, ops);
    await sleep(200);
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await stopDaemon(daemon, stateDir);
    daemon = null;
    ws = null;
  });

  it('should start and stop profiling', async () => {
    // Start profiling
    let resp = await sendIpcCommand(socketPath, {
      type: 'profile-start',
      name: 'test-session',
    });
    expect(resp.ok).toBe(true);

    // Verify profiling is active
    resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);
    expect((resp.data as { profilingActive: boolean }).profilingActive).toBe(
      true,
    );

    // Send profiling data via WebSocket
    wsSend(ws!, 'profilingData', {
      commitData: [
        {
          timestamp: 1000,
          duration: 15,
          fiberActualDurations: [1, 10, 2, 3, 3, 2],
          fiberSelfDurations: [1, 5, 2, 3, 3, 2],
        },
      ],
    });
    await sleep(200);

    // Stop profiling
    resp = await sendIpcCommand(socketPath, { type: 'profile-stop' });
    expect(resp.ok).toBe(true);

    const summary = resp.data as {
      name: string;
      commitCount: number;
      componentRenderCounts: Array<{ id: number; count: number }>;
    };
    expect(summary.name).toBe('test-session');
    expect(summary.commitCount).toBe(1);
    expect(summary.componentRenderCounts.length).toBeGreaterThan(0);
  });

  it('should generate render reports', async () => {
    let resp = await sendIpcCommand(socketPath, { type: 'profile-start' });
    expect(resp.ok).toBe(true);

    wsSend(ws!, 'profilingData', {
      commitData: [
        {
          timestamp: 1000,
          duration: 15,
          fiberActualDurations: [1, 10, 2, 5],
          fiberSelfDurations: [1, 5, 2, 5],
          changeDescriptions: [
            [1, { props: ['theme'], isFirstMount: false }],
            [2, { isFirstMount: true }],
          ],
        },
        {
          timestamp: 2000,
          duration: 8,
          fiberActualDurations: [1, 20],
          fiberSelfDurations: [1, 15],
          changeDescriptions: [
            [1, { didHooksChange: true, isFirstMount: false }],
          ],
        },
      ],
    });
    await sleep(200);

    resp = await sendIpcCommand(socketPath, {
      type: 'profile-report',
      componentId: 1,
    });
    expect(resp.ok).toBe(true);

    const report = resp.data as {
      displayName: string;
      renderCount: number;
      totalDuration: number;
      causes: string[];
    };
    expect(report.displayName).toBe('App');
    expect(report.renderCount).toBe(2);
    expect(report.totalDuration).toBe(30);
    expect(report.causes).toContain('props-changed');
    expect(report.causes).toContain('hooks-changed');
  });

  it('should find slowest components', async () => {
    let resp = await sendIpcCommand(socketPath, { type: 'profile-start' });
    expect(resp.ok).toBe(true);

    wsSend(ws!, 'profilingData', {
      commitData: [
        {
          timestamp: 1000,
          duration: 50,
          fiberActualDurations: [1, 50, 2, 5, 3, 30],
          fiberSelfDurations: [1, 15, 2, 5, 3, 30],
        },
      ],
    });
    await sleep(200);

    resp = await sendIpcCommand(socketPath, {
      type: 'profile-slow',
      limit: 2,
    });
    expect(resp.ok).toBe(true);

    const reports = resp.data as Array<{
      displayName: string;
      avgDuration: number;
    }>;
    expect(reports).toHaveLength(2);
    // Sorted by avg duration desc
    expect(reports[0].avgDuration).toBeGreaterThanOrEqual(
      reports[1].avgDuration,
    );
  });

  it('should return error when stopping without starting', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'profile-stop' });
    expect(resp.ok).toBe(false);
    expect(resp.error).toContain('No active profiling session');
  });
});
