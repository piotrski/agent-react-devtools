import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  FakeReactBackend,
  buildOps,
  addOp,
  rootOp,
  ELEMENT_TYPE_FUNCTION,
  ELEMENT_TYPE_HOST,
  ELEMENT_TYPE_MEMO,
} from './helpers/fake-backend.js';
import { startTestDaemon, stopTestDaemon, sendCommand } from './helpers/daemon.js';

const PORT = 8199;

describe('protocol e2e', () => {
  let backend: FakeReactBackend;

  beforeAll(async () => {
    await startTestDaemon(PORT);
    backend = new FakeReactBackend(PORT);
    await backend.connect();

    // Small delay for handshake to complete
    await new Promise((r) => setTimeout(r, 300));

    // Send a component tree:
    //   Root (100)
    //     App (1) [function]
    //       Header (2) [memo]
    //       TodoList (3) [function]
    //         TodoItem (4) [function] key="item-1"
    //         TodoItem (5) [function] key="item-2"
    //       Footer (6) [host]
    const ops = buildOps(1, 100, ['Root', 'App', 'Header', 'TodoList', 'TodoItem', 'Footer', 'item-1', 'item-2'], (s) => [
      ...rootOp(100),
      ...addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      ...addOp(2, ELEMENT_TYPE_MEMO, 1, s('Header')),
      ...addOp(3, ELEMENT_TYPE_FUNCTION, 1, s('TodoList')),
      ...addOp(4, ELEMENT_TYPE_FUNCTION, 3, s('TodoItem'), s('item-1')),
      ...addOp(5, ELEMENT_TYPE_FUNCTION, 3, s('TodoItem'), s('item-2')),
      ...addOp(6, ELEMENT_TYPE_HOST, 1, s('Footer')),
    ]);
    backend.sendOperations(ops);

    // Let the daemon process the operations
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(async () => {
    await backend.close();
    stopTestDaemon();
  });

  it('status shows connected app and components', async () => {
    const resp = await sendCommand({ type: 'status' });
    expect(resp.ok).toBe(true);
    const data = resp.data as { connectedApps: number; componentCount: number };
    expect(data.connectedApps).toBe(1);
    expect(data.componentCount).toBeGreaterThan(0);
  });

  it('get-tree returns full component hierarchy', async () => {
    const resp = await sendCommand({ type: 'get-tree' });
    expect(resp.ok).toBe(true);
    const nodes = resp.data as Array<{ id: number; label: string; displayName: string; type: string; key: string | null; children: number[] }>;

    // Should have Root + 6 components = 7 nodes
    expect(nodes.length).toBe(7);

    // Check labels are sequential
    const labels = nodes.map((n) => n.label);
    expect(labels).toEqual(['@c1', '@c2', '@c3', '@c4', '@c5', '@c6', '@c7']);

    // Check structure
    const app = nodes.find((n) => n.displayName === 'App');
    expect(app).toBeDefined();
    expect(app!.type).toBe('function');

    const header = nodes.find((n) => n.displayName === 'Header');
    expect(header).toBeDefined();
    expect(header!.type).toBe('memo');

    const items = nodes.filter((n) => n.displayName === 'TodoItem');
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe('item-1');
    expect(items[1].key).toBe('item-2');

    const footer = nodes.find((n) => n.displayName === 'Footer');
    expect(footer).toBeDefined();
    expect(footer!.type).toBe('host');
  });

  it('get-tree respects depth limit', async () => {
    const resp = await sendCommand({ type: 'get-tree', depth: 1 });
    expect(resp.ok).toBe(true);
    const nodes = resp.data as Array<{ displayName: string }>;

    // Depth 0 = Root, depth 1 = App — so only Root and App
    expect(nodes.length).toBe(2);
    expect(nodes.map((n) => n.displayName)).toEqual(['Root', 'App']);
  });

  it('find by name (fuzzy)', async () => {
    const resp = await sendCommand({ type: 'find', name: 'todo' });
    expect(resp.ok).toBe(true);
    const results = resp.data as Array<{ displayName: string }>;

    // Should match TodoList + 2x TodoItem
    expect(results.length).toBe(3);
    const names = results.map((r) => r.displayName);
    expect(names).toContain('TodoList');
    expect(names).toContain('TodoItem');
  });

  it('find by name (exact)', async () => {
    const resp = await sendCommand({ type: 'find', name: 'TodoList', exact: true });
    expect(resp.ok).toBe(true);
    const results = resp.data as Array<{ displayName: string }>;
    expect(results.length).toBe(1);
    expect(results[0].displayName).toBe('TodoList');
  });

  it('count by type', async () => {
    const resp = await sendCommand({ type: 'count' });
    expect(resp.ok).toBe(true);
    const counts = resp.data as Record<string, number>;
    expect(counts['function']).toBe(4); // App, TodoList, TodoItem x2
    expect(counts['memo']).toBe(1);     // Header
    expect(counts['host']).toBe(1);     // Footer
    expect(counts['other']).toBe(1);    // Root
  });

  it('get-component with label resolves and inspects', async () => {
    // First get tree to establish labels
    await sendCommand({ type: 'get-tree' });

    // Set up inspect response handler — when bridge sends inspectElement,
    // we respond with mock data
    backend.onMessage((msg) => {
      if (msg.event === 'inspectElement') {
        const payload = msg.payload as { id: number };
        backend.respondToInspect(payload.id, {
          displayName: 'App',
          type: 5, // FUNCTION
          key: null,
          props: { title: 'My App' },
          state: null,
          hooks: [
            { id: 0, isStateEditable: true, name: 'useState', value: 'light', subHooks: [] },
          ],
        });
      }
    });

    // @c2 should be App (first non-root component)
    const resp = await sendCommand({ type: 'get-component', id: '@c2' });
    expect(resp.ok).toBe(true);
    const element = resp.data as {
      displayName: string;
      props: Record<string, unknown>;
      hooks: Array<{ name: string; value: unknown }> | null;
    };
    expect(element.displayName).toBe('App');
    expect(element.props.title).toBe('My App');
    expect(element.hooks).toBeDefined();
    expect(element.hooks![0].name).toBe('useState');
  });

  it('profiling flow: start, collect data, stop, query results', async () => {
    // Set up handler for profiling protocol
    backend.onMessage((msg) => {
      if (msg.event === 'getProfilingData') {
        // Respond with profiling data containing one commit
        backend.sendProfilingData({
          dataForRoots: [{
            commitData: [{
              timestamp: Date.now(),
              duration: 15.5,
              fiberActualDurations: [[1, 10.0], [3, 5.5]],
              fiberSelfDurations: [[1, 4.5], [3, 5.5]],
              changeDescriptions: [
                [1, { didHooksChange: false, isFirstMount: false, props: ['title'], state: null, hooks: null }],
                [3, { didHooksChange: false, isFirstMount: false, props: null, state: ['filter'], hooks: null }],
              ],
            }],
          }],
        });
      }
    });

    // Start profiling
    const startResp = await sendCommand({ type: 'profile-start', name: 'e2e-test' });
    expect(startResp.ok).toBe(true);

    // Stop and collect
    const stopResp = await sendCommand({ type: 'profile-stop' });
    expect(stopResp.ok).toBe(true);
    const summary = stopResp.data as {
      name: string;
      commitCount: number;
      componentRenderCounts: Array<{ displayName: string; count: number }>;
    };
    expect(summary.name).toBe('e2e-test');
    expect(summary.commitCount).toBe(1);
    expect(summary.componentRenderCounts.length).toBeGreaterThan(0);

    // Query slowest
    const slowResp = await sendCommand({ type: 'profile-slow' });
    expect(slowResp.ok).toBe(true);
    const slowest = slowResp.data as Array<{
      displayName: string;
      avgDuration: number;
      causes: string[];
    }>;
    expect(slowest.length).toBeGreaterThan(0);
    // App should have props-changed cause
    const appReport = slowest.find((r) => r.displayName === 'App');
    expect(appReport).toBeDefined();
    expect(appReport!.causes).toContain('props-changed');

    // Query rerenders
    const rerendersResp = await sendCommand({ type: 'profile-rerenders' });
    expect(rerendersResp.ok).toBe(true);
    const rerenders = rerendersResp.data as Array<{ displayName: string; renderCount: number }>;
    expect(rerenders.length).toBeGreaterThan(0);
  });

  it('disconnect cleans up tree', async () => {
    // Close the backend connection
    await backend.close();

    // Give daemon time to handle disconnect
    await new Promise((r) => setTimeout(r, 300));

    const resp = await sendCommand({ type: 'status' });
    expect(resp.ok).toBe(true);
    const data = resp.data as { connectedApps: number; componentCount: number };
    expect(data.connectedApps).toBe(0);
    expect(data.componentCount).toBe(0);
  });
});
