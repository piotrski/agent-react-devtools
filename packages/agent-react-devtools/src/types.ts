// ── Component Tree ──

export type ComponentType =
  | 'function'
  | 'class'
  | 'host'
  | 'memo'
  | 'forwardRef'
  | 'profiler'
  | 'suspense'
  | 'context'
  | 'other';

export interface ComponentNode {
  id: number;
  displayName: string;
  type: ComponentType;
  key: string | null;
  parentId: number | null;
  children: number[];
  /** Renderer that owns this node */
  rendererId: number;
}

export interface InspectedElement {
  id: number;
  displayName: string;
  type: ComponentType;
  key: string | null;
  props: Record<string, unknown>;
  state: Record<string, unknown> | null;
  hooks: HookInfo[] | null;
  renderedAt: number | null;
}

export interface HookInfo {
  name: string;
  value: unknown;
  subHooks?: HookInfo[];
}

// ── IPC Commands ──

export type IpcCommand =
  | { type: 'ping' }
  | { type: 'status' }
  | { type: 'get-tree'; depth?: number }
  | { type: 'get-component'; id: number | string }
  | { type: 'find'; name: string; exact?: boolean }
  | { type: 'count' };

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
