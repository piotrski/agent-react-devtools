import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { DevToolsBridge } from './devtools-bridge.js';
import { ComponentTree } from './component-tree.js';
import type { IpcCommand, IpcResponse, DaemonInfo, StatusInfo } from './types.js';

const DEFAULT_STATE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.agent-react-devtools',
);

let STATE_DIR = DEFAULT_STATE_DIR;

function getSocketPath(): string {
  return path.join(STATE_DIR, 'daemon.sock');
}

function getDaemonInfoPath(): string {
  return path.join(STATE_DIR, 'daemon.json');
}

class Daemon {
  private ipcServer: net.Server | null = null;
  private bridge: DevToolsBridge;
  private tree: ComponentTree;
  private port: number;
  private startedAt = Date.now();

  constructor(port: number) {
    this.port = port;
    this.tree = new ComponentTree();
    this.bridge = new DevToolsBridge(port, this.tree);
  }

  async start(): Promise<void> {
    // Ensure state directory exists
    fs.mkdirSync(STATE_DIR, { recursive: true });

    // Clean up stale socket
    const socketPath = getSocketPath();
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // ignore
      }
    }

    // Start WebSocket bridge
    await this.bridge.start();

    // Start IPC server
    await this.startIpc(socketPath);

    // Write daemon info
    const info: DaemonInfo = {
      pid: process.pid,
      port: this.port,
      socketPath,
      startedAt: this.startedAt,
    };
    fs.writeFileSync(getDaemonInfoPath(), JSON.stringify(info, null, 2));

    console.log(`Daemon started (pid=${process.pid}, port=${this.port})`);

    // Handle shutdown
    const shutdown = () => {
      this.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  private startIpc(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ipcServer = net.createServer((conn) => {
        let buffer = '';

        conn.on('data', (chunk) => {
          buffer += chunk.toString();

          // Process complete messages (newline-delimited JSON)
          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);

            try {
              const cmd: IpcCommand = JSON.parse(line);
              this.handleCommand(cmd).then((response) => {
                conn.write(JSON.stringify(response) + '\n');
              });
            } catch {
              const response: IpcResponse = {
                ok: false,
                error: 'Invalid JSON',
              };
              conn.write(JSON.stringify(response) + '\n');
            }
          }
        });
      });

      this.ipcServer.on('error', reject);

      this.ipcServer.listen(socketPath, () => {
        resolve();
      });
    });
  }

  private async handleCommand(cmd: IpcCommand): Promise<IpcResponse> {
    try {
      switch (cmd.type) {
        case 'ping':
          return { ok: true, data: 'pong' };

        case 'status':
          return {
            ok: true,
            data: {
              daemonRunning: true,
              port: this.port,
              connectedApps: this.bridge.getConnectedAppCount(),
              componentCount: this.tree.getComponentCount(),
              profilingActive: false,
              uptime: Date.now() - this.startedAt,
            } satisfies StatusInfo,
          };

        case 'get-tree':
          return {
            ok: true,
            data: this.tree.getTree(cmd.depth),
          };

        case 'get-component': {
          const resolvedId = this.tree.resolveId(cmd.id);
          if (resolvedId === undefined) {
            return { ok: false, error: `Component ${cmd.id} not found` };
          }
          const element = await this.bridge.inspectElement(resolvedId);
          if (!element) {
            return { ok: false, error: `Component ${cmd.id} not found` };
          }
          // Include the label if the request used one
          const label = typeof cmd.id === 'string' ? cmd.id : undefined;
          return { ok: true, data: element, label };
        }

        case 'find':
          return {
            ok: true,
            data: this.tree.findByName(cmd.name, cmd.exact),
          };

        case 'count':
          return {
            ok: true,
            data: this.tree.getCountByType(),
          };

        default:
          return { ok: false, error: `Unknown command: ${(cmd as any).type}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  stop(): void {
    this.bridge.stop();
    if (this.ipcServer) {
      this.ipcServer.close();
      this.ipcServer = null;
    }
    // Clean up files
    try {
      fs.unlinkSync(getSocketPath());
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(getDaemonInfoPath());
    } catch {
      // ignore
    }
    console.log('Daemon stopped');
  }
}

// ── Main ──

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 8097;

const stateDirArg = process.argv.find((a) => a.startsWith('--state-dir='));
if (stateDirArg) {
  STATE_DIR = stateDirArg.split('=')[1];
}

const daemon = new Daemon(port);
daemon.start().catch((err) => {
  console.error('Failed to start daemon:', err);
  process.exit(1);
});
