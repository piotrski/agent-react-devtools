import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';

interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface TestContext {
  stateDir: string;
  port: number;
  daemon: ChildProcess | null;
  ws: WebSocket | null;
}

/**
 * Get a unique port for test isolation.
 * Uses random range to avoid conflicts between parallel workers.
 */
export function getTestPort(): number {
  return 20000 + Math.floor(Math.random() * 30000);
}

/**
 * Create an isolated temp directory for a test.
 */
export function createTempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ard-e2e-'));
}

/**
 * Path to the built daemon script.
 */
function getDaemonScript(): string {
  return path.resolve(
    import.meta.dirname,
    '../../agent-react-devtools/dist/daemon.js',
  );
}

/**
 * Path to the built CLI script.
 */
export function getCliScript(): string {
  return path.resolve(
    import.meta.dirname,
    '../../agent-react-devtools/dist/cli.js',
  );
}

/**
 * Start a daemon process with the given port and state directory.
 */
export function startDaemon(port: number, stateDir: string): ChildProcess {
  const daemonScript = getDaemonScript();
  const child = spawn(
    process.execPath,
    [daemonScript, `--port=${port}`, `--state-dir=${stateDir}`],
    { stdio: 'pipe' },
  );
  return child;
}

/**
 * Wait for the daemon to be ready by polling the IPC socket.
 */
export async function waitForDaemon(
  stateDir: string,
  timeoutMs = 10_000,
): Promise<void> {
  const socketPath = path.join(stateDir, 'daemon.sock');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const resp = await sendIpcCommand(socketPath, { type: 'ping' });
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(100);
  }
  throw new Error(`Daemon did not start within ${timeoutMs}ms`);
}

/**
 * Send a raw IPC command to the daemon socket.
 */
export function sendIpcCommand(
  socketPath: string,
  cmd: { type: string; [key: string]: unknown },
): Promise<IpcResponse> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath, () => {
      conn.write(JSON.stringify(cmd) + '\n');
    });

    let buffer = '';
    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        const line = buffer.slice(0, idx);
        conn.end();
        try {
          resolve(JSON.parse(line) as IpcResponse);
        } catch {
          reject(new Error('Invalid response from daemon'));
        }
      }
    });

    conn.on('error', reject);

    conn.setTimeout(10_000, () => {
      conn.destroy();
      reject(new Error('IPC command timed out'));
    });
  });
}

/**
 * Connect a WebSocket client that simulates a React app.
 */
export function connectMockApp(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Send a DevTools protocol message via WebSocket.
 */
export function wsSend(
  ws: WebSocket,
  event: string,
  payload: unknown,
): void {
  ws.send(JSON.stringify({ event, payload }));
}

/**
 * Encode a display name string as DevTools operations char codes.
 */
function encodeString(s: string): number[] {
  return [s.length, ...Array.from(s).map((c) => c.charCodeAt(0))];
}

/**
 * Build an ADD operation for the DevTools operations array.
 */
export function buildAddOp(
  id: number,
  elementType: number,
  parentId: number,
  displayName: string,
  key: string | null = null,
): number[] {
  const nameChars = encodeString(displayName);
  const keyChars = key ? encodeString(key) : [0];
  return [1, id, elementType, parentId, 0, ...nameChars, ...keyChars];
}

/**
 * Build a REMOVE operation.
 */
export function buildRemoveOp(...ids: number[]): number[] {
  return [2, ids.length, ...ids];
}

/**
 * Send operations to the daemon via a mock WebSocket app connection.
 * Wraps the raw operations array in the DevTools message format.
 */
export function sendOperations(ws: WebSocket, operations: number[]): void {
  wsSend(ws, 'operations', operations);
}

/**
 * Stop a daemon gracefully and clean up.
 */
export async function stopDaemon(
  daemon: ChildProcess | null,
  stateDir: string,
): Promise<void> {
  if (daemon && !daemon.killed) {
    daemon.kill('SIGTERM');
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        daemon.kill('SIGKILL');
        resolve();
      }, 3000);
      daemon.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // Clean up state dir
  try {
    fs.rmSync(stateDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run the CLI with given args, capturing stdout/stderr.
 */
export async function runCli(
  args: string[],
  stateDir: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const cliScript = getCliScript();
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [cliScript, ...args, `--state-dir=${stateDir}`],
      { stdio: 'pipe' },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    // Timeout safety
    setTimeout(() => {
      child.kill('SIGKILL');
    }, 15_000);
  });
}
