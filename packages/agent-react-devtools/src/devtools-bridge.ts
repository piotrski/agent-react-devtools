import { WebSocketServer, WebSocket } from 'ws';
import type { ComponentTree } from './component-tree.js';
import type { InspectedElement } from './types.js';

/**
 * React DevTools protocol bridge.
 *
 * Implements the "Wall" messaging pattern that React DevTools uses:
 * - The backend (inside React app) sends operations, profiling data, etc.
 * - The frontend (us) can request element inspection, start/stop profiling, etc.
 *
 * Message format over WebSocket:
 *   { event: string, payload: any }
 */

interface DevToolsMessage {
  event: string;
  payload: unknown;
}

interface PendingInspection {
  resolve: (value: InspectedElement | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DevToolsBridge {
  private wss: WebSocketServer | null = null;
  private connections = new Set<WebSocket>();
  private port: number;
  private tree: ComponentTree;
  private pendingInspections = new Map<number, PendingInspection>();
  private rendererIds = new Set<number>();
  /** Track which root fiber IDs belong to each WebSocket connection */
  private connectionRoots = new Map<WebSocket, Set<number>>();

  constructor(port: number, tree: ComponentTree) {
    this.port = port;
    this.tree = tree;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        resolve();
      });

      this.wss.on('error', (err) => {
        reject(err);
      });

      this.wss.on('connection', (ws) => {
        this.connections.add(ws);

        ws.on('message', (data) => {
          try {
            const msg: DevToolsMessage = JSON.parse(data.toString());
            this.handleMessage(ws, msg);
          } catch {
            // ignore parse errors
          }
        });

        ws.on('close', () => {
          this.cleanupConnection(ws);
        });

        ws.on('error', () => {
          this.cleanupConnection(ws);
        });
      });
    });
  }

  stop(): void {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  getConnectedAppCount(): number {
    return this.connections.size;
  }

  /**
   * Request detailed inspection of a specific element.
   * Sends a request to the React app and waits for the response.
   */
  inspectElement(id: number): Promise<InspectedElement | null> {
    const node = this.tree.getNode(id);
    if (!node) return Promise.resolve(null);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingInspections.delete(id);
        resolve(null);
      }, 5000);

      this.pendingInspections.set(id, { resolve, timer });

      this.sendToAll({
        event: 'inspectElement',
        payload: {
          id,
          rendererID: node.rendererId,
          forceFullData: true,
          requestID: id,
          path: null,
        },
      });
    });
  }

  private handleMessage(ws: WebSocket, msg: DevToolsMessage): void {
    switch (msg.event) {
      case 'backendInitialized':
        // Send the full frontend handshake sequence
        this.sendTo(ws, { event: 'getBridgeProtocol', payload: undefined });
        this.sendTo(ws, { event: 'getBackendVersion', payload: undefined });
        this.sendTo(ws, { event: 'getIfHasUnsupportedRendererVersion', payload: undefined });
        this.sendTo(ws, { event: 'getHookSettings', payload: undefined });
        this.sendTo(ws, { event: 'getProfilingStatus', payload: undefined });
        break;

      case 'bridgeProtocol':
      case 'backendVersion':
      case 'profilingStatus':
      case 'overrideComponentFilters':
        break;

      case 'operations':
        this.handleOperations(ws, msg.payload as number[]);
        break;

      case 'inspectedElement':
        this.handleInspectedElement(msg.payload);
        break;

      case 'renderer': {
        const payload = msg.payload as { id: number };
        this.rendererIds.add(payload.id);
        break;
      }

      case 'rendererAttached': {
        const payload = msg.payload as { id: number };
        this.rendererIds.add(payload.id);
        break;
      }

      case 'shutdown':
        ws.close();
        break;

      // Silently ignore known but unhandled events
      case 'hookSettings':
      case 'isBackendStorageAPISupported':
      case 'isReactNativeEnvironment':
      case 'isReloadAndProfileSupportedByBackend':
      case 'isSynchronousXHRSupported':
      case 'syncSelectionFromNativeElementsPanel':
      case 'unsupportedRendererVersion':
        break;

      default:
        break;
    }
  }

  private handleOperations(ws: WebSocket, operations: number[]): void {
    if (operations.length >= 2) {
      // Track renderer ID (first element of every operations array)
      this.rendererIds.add(operations[0]);

      // Track which root fiber IDs belong to this connection
      const rootFiberId = operations[1];
      let roots = this.connectionRoots.get(ws);
      if (!roots) {
        roots = new Set();
        this.connectionRoots.set(ws, roots);
      }
      roots.add(rootFiberId);
    }
    this.tree.applyOperations(operations);
  }

  private cleanupConnection(ws: WebSocket): void {
    this.connections.delete(ws);
    // Remove all root trees that belonged to this connection
    const roots = this.connectionRoots.get(ws);
    if (roots) {
      for (const rootId of roots) {
        this.tree.removeRoot(rootId);
      }
      this.connectionRoots.delete(ws);
    }
  }

  private handleInspectedElement(payload: unknown): void {
    const data = payload as {
      type: string;
      id: number;
      value?: {
        id: number;
        displayName: string;
        type: number;
        key: string | null;
        props: Record<string, unknown>;
        state: Record<string, unknown> | null;
        hooks: unknown[] | null;
      };
    };

    if (data.type !== 'full-data' && data.type !== 'hydrated-path') {
      // No data available
      const pending = this.pendingInspections.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingInspections.delete(data.id);
        pending.resolve(null);
      }
      return;
    }

    const pending = this.pendingInspections.get(data.id);
    if (!pending || !data.value) return;

    clearTimeout(pending.timer);
    this.pendingInspections.delete(data.id);

    const node = this.tree.getNode(data.id);
    const inspected: InspectedElement = {
      id: data.id,
      displayName: data.value.displayName || node?.displayName || 'Unknown',
      type: node?.type || 'other',
      key: data.value.key,
      props: cleanDehydrated(data.value.props) as Record<string, unknown>,
      state: data.value.state
        ? (cleanDehydrated(data.value.state) as Record<string, unknown>)
        : null,
      hooks: data.value.hooks
        ? parseHooks(data.value.hooks)
        : null,
      renderedAt: null,
    };

    pending.resolve(inspected);
  }

  private sendTo(ws: WebSocket, msg: DevToolsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendToAll(msg: DevToolsMessage): void {
    const raw = JSON.stringify(msg);
    for (const conn of this.connections) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(raw);
      }
    }
  }
}

/**
 * React DevTools uses "dehydrated" values for complex objects.
 * These appear as objects with `type: 'string'` and other metadata.
 * We simplify them for display.
 */
function cleanDehydrated(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanDehydrated);

  const record = obj as Record<string, unknown>;

  // Dehydrated value markers from React DevTools
  if ('type' in record && 'preview_short' in record) {
    return record['preview_short'];
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    cleaned[key] = cleanDehydrated(value);
  }
  return cleaned;
}

function parseHooks(hooks: unknown[]): { name: string; value: unknown; subHooks?: { name: string; value: unknown }[] }[] {
  return hooks.map((hook) => {
    const h = hook as {
      id: number | null;
      isStateEditable: boolean;
      name: string;
      value: unknown;
      subHooks?: unknown[];
    };
    const result: { name: string; value: unknown; subHooks?: { name: string; value: unknown }[] } = {
      name: h.name,
      value: cleanDehydrated(h.value),
    };
    if (h.subHooks && h.subHooks.length > 0) {
      result.subHooks = parseHooks(h.subHooks) as { name: string; value: unknown }[];
    }
    return result;
  });
}
