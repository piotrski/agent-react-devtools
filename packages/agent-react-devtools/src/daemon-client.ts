import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { IpcCommand, IpcResponse, DaemonInfo } from './types.js';

const DEFAULT_STATE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.agent-react-devtools',
);

let stateDir = DEFAULT_STATE_DIR;

export function setStateDir(dir: string): void {
  stateDir = dir;
}

function getDaemonInfoPath(): string {
  return path.join(stateDir, 'daemon.json');
}

function getSocketPath(): string {
  return path.join(stateDir, 'daemon.sock');
}

export function readDaemonInfo(): DaemonInfo | null {
  try {
    const raw = fs.readFileSync(getDaemonInfoPath(), 'utf-8');
    return JSON.parse(raw) as DaemonInfo;
  } catch {
    return null;
  }
}

function isDaemonAlive(info: DaemonInfo): boolean {
  try {
    // Signal 0 doesn't kill, just checks if process exists
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDaemon(port?: number): Promise<void> {
  const info = readDaemonInfo();
  if (info && isDaemonAlive(info)) {
    return; // Already running
  }

  // Clean up stale files
  try {
    fs.unlinkSync(getDaemonInfoPath());
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(getSocketPath());
  } catch {
    // ignore
  }

  // Start daemon as detached child process
  const daemonScript = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'daemon.js',
  );

  const args = [];
  if (port) args.push(`--port=${port}`);
  if (stateDir !== DEFAULT_STATE_DIR) args.push(`--state-dir=${stateDir}`);

  const child = spawn(process.execPath, [daemonScript, ...args], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait for daemon to be ready (up to 5 seconds)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      await sendCommand({ type: 'ping' });
      return;
    } catch {
      // not ready yet
    }
  }
  throw new Error('Daemon failed to start within 5 seconds');
}

export function stopDaemon(): boolean {
  const info = readDaemonInfo();
  if (!info) return false;

  try {
    process.kill(info.pid, 'SIGTERM');
    // Clean up files
    try {
      fs.unlinkSync(getDaemonInfoPath());
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

export function sendCommand(cmd: IpcCommand, socketTimeout = 30_000): Promise<IpcResponse> {
  return new Promise((resolve, reject) => {
    const socketPath = getSocketPath();

    const conn = net.createConnection(socketPath, () => {
      conn.write(JSON.stringify(cmd) + '\n');
    });

    let buffer = '';
    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        conn.end();
        try {
          resolve(JSON.parse(line) as IpcResponse);
        } catch {
          reject(new Error('Invalid response from daemon'));
        }
      }
    });

    conn.on('error', (err) => {
      reject(new Error(`Cannot connect to daemon: ${err.message}`));
    });

    conn.setTimeout(socketTimeout, () => {
      conn.destroy();
      reject(new Error('Command timed out'));
    });
  });
}
