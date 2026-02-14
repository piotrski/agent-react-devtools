import {
  ensureDaemon,
  sendCommand,
  stopDaemon,
  readDaemonInfo,
  setStateDir,
} from './daemon-client.js';
import {
  formatTree,
  formatComponent,
  formatSearchResults,
  formatCount,
  formatStatus,
  formatProfileSummary,
  formatProfileReport,
  formatSlowest,
  formatRerenders,
  formatTimeline,
  formatCommitDetail,
} from './formatters.js';
import type { IpcCommand } from './types.js';

function usage(): string {
  return `Usage: devtools <command> [options]

Setup:
  init [--dry-run]              Auto-configure your React app

Daemon:
  start [--port 8097]           Start daemon
  stop                          Stop daemon
  status                        Show daemon status

Components:
  get tree [--depth N]          Component hierarchy
  get component <@c1 | id>     Props, state, hooks
  find <name> [--exact]         Search by display name
  count                         Component count by type

Wait:
  wait --connected [--timeout S]       Block until an app connects
  wait --component <name> [--timeout S]  Block until a component appears

Profiling:
  profile start [name]          Start profiling session
  profile stop                  Stop profiling, collect data
  profile report <@c1 | id>    Render report for component
  profile slow [--limit N]      Slowest components (by avg)
  profile rerenders [--limit N] Most re-rendered components
  profile timeline [--limit N]  Commit timeline
  profile commit <N | #N> [--limit N]  Detail for specific commit`;
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
  const cmd1 = command[1];

  try {
    // ── Init ──
    if (cmd0 === 'init') {
      const { runInit } = await import('./init.js');
      await runInit(process.cwd(), flags['dry-run'] === true);
      return;
    }

    // ── Daemon management ──
    if (cmd0 === 'start') {
      const port = flags['port'] ? parseInt(flags['port'] as string, 10) : undefined;
      await ensureDaemon(port);
      const resp = await sendCommand({ type: 'status' });
      if (resp.ok) {
        console.log(formatStatus(resp.data as any));
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
          console.log(formatStatus(resp.data as any));
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

    // ── All other commands require the daemon ──
    await ensureDaemon();

    // ── Component inspection ──
    if (cmd0 === 'get' && cmd1 === 'tree') {
      const depth = flags['depth']
        ? parseInt(flags['depth'] as string, 10)
        : undefined;
      const ipcCmd: IpcCommand = { type: 'get-tree', depth };
      const resp = await sendCommand(ipcCmd);
      if (resp.ok) {
        console.log(formatTree(resp.data as any, resp.hint));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'get' && cmd1 === 'component') {
      const raw = command[2];
      if (!raw) {
        console.error('Usage: devtools get component <@c1 | id>');
        process.exit(1);
      }
      const id: number | string = raw.startsWith('@') ? raw : parseInt(raw, 10);
      if (typeof id === 'number' && isNaN(id)) {
        console.error('Usage: devtools get component <@c1 | id>');
        process.exit(1);
      }
      const resp = await sendCommand({ type: 'get-component', id });
      if (resp.ok) {
        console.log(formatComponent(resp.data as any, resp.label));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'find') {
      const name = command[1];
      if (!name) {
        console.error('Usage: devtools find <name> [--exact]');
        process.exit(1);
      }
      const exact = flags['exact'] === true;
      const resp = await sendCommand({ type: 'find', name, exact });
      if (resp.ok) {
        console.log(formatSearchResults(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'count') {
      const resp = await sendCommand({ type: 'count' });
      if (resp.ok) {
        console.log(formatCount(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    // ── Wait ──
    if (cmd0 === 'wait') {
      const timeoutSec = flags['timeout'] ? parseInt(flags['timeout'] as string, 10) : 30;
      const timeoutMs = timeoutSec * 1000;
      const socketTimeout = timeoutMs + 5000;

      let ipcCmd: IpcCommand;
      if (flags['connected'] !== undefined) {
        ipcCmd = { type: 'wait', condition: 'connected', timeout: timeoutMs };
      } else if (flags['component'] !== undefined) {
        if (typeof flags['component'] !== 'string') {
          console.error('Usage: devtools wait --component <name> [--timeout S]');
          process.exit(1);
        }
        ipcCmd = { type: 'wait', condition: 'component', name: flags['component'], timeout: timeoutMs };
      } else {
        console.error('Usage: devtools wait --connected|--component <name> [--timeout S]');
        process.exit(1);
      }

      const resp = await sendCommand(ipcCmd, socketTimeout);
      if (resp.ok) {
        const result = resp.data as { met: boolean; condition: string; timeout?: boolean };
        if (result.met) {
          console.log(`Condition met: ${result.condition}`);
        } else {
          console.error(`Timed out waiting for: ${result.condition}`);
          process.exit(1);
        }
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    // ── Profiling ──
    if (cmd0 === 'profile' && cmd1 === 'start') {
      const name = command[2];
      const resp = await sendCommand({ type: 'profile-start', name });
      if (resp.ok) {
        console.log(resp.data);
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'stop') {
      const resp = await sendCommand({ type: 'profile-stop' });
      if (resp.ok) {
        console.log(formatProfileSummary(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'report') {
      const raw = command[2];
      if (!raw) {
        console.error('Usage: devtools profile report <@c1 | id>');
        process.exit(1);
      }
      const componentId: number | string = raw.startsWith('@') ? raw : parseInt(raw, 10);
      if (typeof componentId === 'number' && isNaN(componentId)) {
        console.error('Usage: devtools profile report <@c1 | id>');
        process.exit(1);
      }
      const resp = await sendCommand({ type: 'profile-report', componentId });
      if (resp.ok) {
        console.log(formatProfileReport(resp.data as any, resp.label));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'slow') {
      const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : undefined;
      const resp = await sendCommand({ type: 'profile-slow', limit });
      if (resp.ok) {
        console.log(formatSlowest(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'rerenders') {
      const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : undefined;
      const resp = await sendCommand({ type: 'profile-rerenders', limit });
      if (resp.ok) {
        console.log(formatRerenders(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'commit') {
      const raw = command[2];
      if (!raw) {
        console.error('Usage: devtools profile commit <N | #N>');
        process.exit(1);
      }
      const index = parseInt(raw.replace(/^#/, ''), 10);
      if (isNaN(index)) {
        console.error('Usage: devtools profile commit <N | #N>');
        process.exit(1);
      }
      const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : undefined;
      const resp = await sendCommand({ type: 'profile-commit', index, limit });
      if (resp.ok) {
        console.log(formatCommitDetail(resp.data as any));
      } else {
        console.error(resp.error);
        process.exit(1);
      }
      return;
    }

    if (cmd0 === 'profile' && cmd1 === 'timeline') {
      const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : undefined;
      const resp = await sendCommand({ type: 'profile-timeline', limit });
      if (resp.ok) {
        console.log(formatTimeline(resp.data as any));
      } else {
        console.error(resp.error);
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
