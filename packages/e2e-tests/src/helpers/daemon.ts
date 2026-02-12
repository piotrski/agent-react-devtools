import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '../../../agent-react-devtools');

let tempDir: string | null = null;
let daemonPid: number | null = null;

export async function startTestDaemon(port: number): Promise<void> {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ard-e2e-'));

  const daemonScript = path.join(PACKAGE_ROOT, 'dist', 'daemon.js');
  const child = spawn(process.execPath, [
    daemonScript,
    `--port=${port}`,
    `--state-dir=${tempDir}`,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  daemonPid = child.pid ?? null;

  // Wait for daemon to be ready
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const resp = await sendCommand({ type: 'ping' });
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
  }
  throw new Error('Daemon failed to start within 10 seconds');
}

export function stopTestDaemon(): void {
  if (daemonPid) {
    try {
      process.kill(daemonPid, 'SIGTERM');
    } catch {
      // ignore
    }
    daemonPid = null;
  }
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
    tempDir = null;
  }
}

export function sendCommand(cmd: { type: string; [key: string]: unknown }): Promise<{ ok: boolean; data?: unknown; error?: string; label?: string }> {
  return new Promise((resolve, reject) => {
    if (!tempDir) return reject(new Error('Daemon not started'));
    const socketPath = path.join(tempDir, 'daemon.sock');

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
          resolve(JSON.parse(line));
        } catch {
          reject(new Error('Invalid response from daemon'));
        }
      }
    });

    conn.on('error', (err) => {
      reject(new Error(`Cannot connect to daemon: ${err.message}`));
    });

    conn.setTimeout(10_000, () => {
      conn.destroy();
      reject(new Error('Command timed out'));
    });
  });
}
