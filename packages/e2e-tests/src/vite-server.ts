import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const VITE_APP_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/vite-app',
);

/**
 * Resolve the vite binary from the example app's node_modules.
 * Falls back to the monorepo root's node_modules.
 */
function getViteBin(): string {
  const localBin = path.join(VITE_APP_DIR, 'node_modules', '.bin', 'vite');
  const rootBin = path.resolve(VITE_APP_DIR, '../../node_modules/.bin/vite');
  try {
    require('fs').accessSync(localBin);
    return localBin;
  } catch {
    return rootBin;
  }
}

/**
 * Start a Vite dev server for the example app with a custom devtools port.
 * Uses AGENT_DEVTOOLS_PORT env var read by the example app's vite config.
 */
export async function startViteServer(
  vitePort: number,
  daemonPort: number,
): Promise<ChildProcess> {
  const viteBin = getViteBin();
  const viteProcess = spawn(
    viteBin,
    ['--port', String(vitePort)],
    {
      cwd: VITE_APP_DIR,
      env: { ...process.env, AGENT_DEVTOOLS_PORT: String(daemonPort) },
      stdio: 'pipe',
    },
  );

  // Capture output for debugging if Vite fails
  let stdoutOutput = '';
  let stderrOutput = '';
  viteProcess.stdout?.on('data', (chunk: Buffer) => {
    stdoutOutput += chunk.toString();
  });
  viteProcess.stderr?.on('data', (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Vite failed to start within 30s. stdout:\n${stdoutOutput}\nstderr:\n${stderrOutput}`));
    }, 30_000);

    const onOutput = (chunk: Buffer) => {
      // Strip ANSI escape codes so detection works in CI
      const output = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
      if (output.includes('Local:') || output.includes(`localhost:${vitePort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };

    viteProcess.stdout?.on('data', onOutput);
    viteProcess.stderr?.on('data', onOutput);

    viteProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    viteProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Vite exited with code ${code}. stderr:\n${stderrOutput}`));
      }
    });
  });

  return viteProcess;
}

export async function stopViteServer(viteProcess: ChildProcess): Promise<void> {
  viteProcess.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    viteProcess.on('exit', () => resolve());
    setTimeout(resolve, 3000);
  });
}
