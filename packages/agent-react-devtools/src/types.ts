// ── IPC Commands ──

export type IpcCommand =
  | { type: 'ping' }
  | { type: 'status' };

export interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** The @cN label, passed through when commands use label-based IDs */
  label?: string;
}

// ── Daemon State ──

export interface DaemonInfo {
  pid: number;
  port: number;
  socketPath: string;
  startedAt: number;
}

export interface StatusInfo {
  daemonRunning: boolean;
  port: number;
  connectedApps: number;
  componentCount: number;
  profilingActive: boolean;
  uptime: number;
}
