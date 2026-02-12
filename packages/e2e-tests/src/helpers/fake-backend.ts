import WebSocket from 'ws';

/**
 * Simulates a React DevTools backend that connects to the daemon's
 * WebSocket server and speaks the "Wall" protocol.
 */
export class FakeReactBackend {
  private ws: WebSocket | null = null;
  private port: number;
  private rendererID: number;
  private messageHandlers: Array<(msg: { event: string; payload: unknown }) => void> = [];

  constructor(port: number, rendererID = 1) {
    this.port = port;
    this.rendererID = rendererID;
  }

  /**
   * Connect to the daemon and perform the DevTools handshake.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);

      this.ws.on('open', () => {
        // Mimic what react-devtools-core does on connect
        this.send('backendInitialized', undefined);
        this.send('renderer', { id: this.rendererID });
        this.send('rendererAttached', { id: this.rendererID });
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { event: string; payload: unknown };
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch {
          // ignore parse errors
        }
      });

      this.ws.on('error', reject);

      setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    });
  }

  /**
   * Listen for messages from the daemon/bridge.
   */
  onMessage(handler: (msg: { event: string; payload: unknown }) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Send a component tree operations array.
   */
  sendOperations(ops: number[]): void {
    this.send('operations', ops);
  }

  /**
   * Respond to an inspectElement request with full element data.
   */
  respondToInspect(id: number, value: {
    displayName: string;
    type: number;
    key: string | null;
    props: Record<string, unknown>;
    state: Record<string, unknown> | null;
    hooks: unknown[] | null;
  }): void {
    this.send('inspectedElement', {
      type: 'full-data',
      id,
      value: { id, ...value },
    });
  }

  /**
   * Send profiling data (as if the React renderer is responding to getProfilingData).
   */
  sendProfilingData(data: unknown): void {
    this.send('profilingData', data);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.on('close', () => resolve());
      this.ws.close();
    });
  }

  private send(event: string, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }
}

// ── Operations array builders ──
// Copied from component-tree.test.ts (not exported from the main package)

export function buildStringTable(strings: string[]): [number[], Map<string, number>] {
  const idMap = new Map<string, number>();
  const data: number[] = [];
  for (const s of strings) {
    if (!idMap.has(s)) {
      const id = idMap.size + 1;
      idMap.set(s, id);
      data.push(s.length, ...Array.from(s).map((c) => c.charCodeAt(0)));
    }
  }
  return [data, idMap];
}

export function buildOps(
  rendererID: number,
  rootID: number,
  strings: string[],
  opsFn: (strId: (s: string) => number) => number[],
): number[] {
  const [tableData, idMap] = buildStringTable(strings);
  const strId = (s: string) => idMap.get(s) || 0;
  const ops = opsFn(strId);
  return [rendererID, rootID, tableData.length, ...tableData, ...ops];
}

/** ADD operation: type=1, id, elementType, parentId, ownerID=0, displayNameStrId, keyStrId */
export function addOp(
  id: number,
  elementType: number,
  parentId: number,
  displayNameStrId: number,
  keyStrId = 0,
): number[] {
  return [1, id, elementType, parentId, 0, displayNameStrId, keyStrId];
}

/** ROOT ADD operation: type=1, id, ROOT(11), isStrictMode, supportsProfiling, supportsStrictMode, hasOwnerMetadata */
export function rootOp(id: number): number[] {
  return [1, id, 11, 0, 1, 0, 0];
}

// Element type constants
export const ELEMENT_TYPE_FUNCTION = 5;
export const ELEMENT_TYPE_HOST = 7;
export const ELEMENT_TYPE_MEMO = 8;
export const ELEMENT_TYPE_ROOT = 11;
