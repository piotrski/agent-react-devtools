import {
  ensureDaemon,
  sendCommand,
  stopDaemon,
  readDaemonInfo,
  setStateDir,
} from './daemon-client.js';
import type { StatusInfo } from './types.js';

function usage(): string {
  return `Usage: devtools <command> [options]

Daemon:
  start [--port 8097]           Start daemon
  stop                          Stop daemon
  status                        Show daemon status`;
}

function parseArgs(argv: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const eqIdx = key.indexOf('=');
      if (eqIdx !== -1) {
        flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      } else {
        // Check if next arg is a value
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      command.push(arg);
    }
  }
  return { command, flags };
}

function formatStatus(status: StatusInfo): string {
  const lines: string[] = [];
  lines.push(`Daemon: running (port ${status.port})`);
  lines.push(
    `Apps: ${status.connectedApps} connected, ${status.componentCount} components`,
  );
  if (status.profilingActive) {
    lines.push('Profiling: active');
  }
  const upSec = Math.round(status.uptime / 1000);
  lines.push(`Uptime: ${upSec}s`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command.length === 0 || flags['help']) {
    console.log(usage());
    process.exit(0);
  }

  // Configure custom state directory (for test isolation)
  if (typeof flags['state-dir'] === 'string') {
    setStateDir(flags['state-dir']);
  }

  const cmd0 = command[0];

  try {
    // ── Daemon management ──
    if (cmd0 === 'start') {
      const port = flags['port'] ? parseInt(flags['port'] as string, 10) : undefined;
      await ensureDaemon(port);
      const resp = await sendCommand({ type: 'status' });
      if (resp.ok) {
        console.log(formatStatus(resp.data as StatusInfo));
      }
      return;
    }

    if (cmd0 === 'stop') {
      const stopped = stopDaemon();
      console.log(stopped ? 'Daemon stopped' : 'Daemon is not running');
      return;
    }

    if (cmd0 === 'status') {
      const info = readDaemonInfo();
      if (!info) {
        console.log('Daemon is not running');
        process.exit(1);
      }
      try {
        const resp = await sendCommand({ type: 'status' });
        if (resp.ok) {
          console.log(formatStatus(resp.data as StatusInfo));
        } else {
          console.error(resp.error);
          process.exit(1);
        }
      } catch {
        console.log('Daemon is not running (stale info)');
        process.exit(1);
      }
      return;
    }

    console.error(`Unknown command: ${command.join(' ')}`);
    console.log(usage());
    process.exit(1);
  } catch (err) {
    console.error(
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

main();
