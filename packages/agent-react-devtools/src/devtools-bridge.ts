import { WebSocketServer, WebSocket } from 'ws';

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

export class DevToolsBridge {
  private wss: WebSocketServer | null = null;
  private connections = new Set<WebSocket>();
  private port: number;
  private rendererIds = new Set<number>();

  constructor(port: number) {
    this.port = port;
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
          this.connections.delete(ws);
        });

        ws.on('error', () => {
          this.connections.delete(ws);
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
