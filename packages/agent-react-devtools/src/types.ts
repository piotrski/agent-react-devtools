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

// ── Profiling ──

export interface ProfilingSession {
  name: string;
  startedAt: number;
  stoppedAt: number | null;
  commits: ProfilingCommit[];
}

export interface ProfilingCommit {
  timestamp: number;
  duration: number;
  fiberActualDurations: Map<number, number>;
  fiberSelfDurations: Map<number, number>;
  changeDescriptions: Map<number, ChangeDescription>;
}

export interface ChangeDescription {
  didHooksChange: boolean;
  isFirstMount: boolean;
  props: string[] | null;
  state: string[] | null;
  hooks: number[] | null;
}

export interface ComponentRenderReport {
  id: number;
  displayName: string;
  label?: string;
  type?: ComponentType;
  renderCount: number;
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  causes: RenderCause[];
}

export type RenderCause =
  | 'props-changed'
  | 'state-changed'
  | 'hooks-changed'
  | 'parent-rendered'
  | 'force-update'
  | 'first-mount';

// ── Connection Health ──

export type ConnectionEventType = 'connected' | 'disconnected' | 'reconnected';

export interface ConnectionEvent {
  type: ConnectionEventType;
  timestamp: number;
}

export interface ConnectionHealth {
  connectedApps: number;
  hasEverConnected: boolean;
  lastDisconnectAt: number | null;
  recentEvents: ConnectionEvent[];
}

// ── IPC Commands ──

export type IpcCommand =
  | { type: 'ping' }
  | { type: 'status' }
  | { type: 'get-tree'; depth?: number }
  | { type: 'get-component'; id: number | string }
  | { type: 'find'; name: string; exact?: boolean }
  | { type: 'count' }
  | { type: 'profile-start'; name?: string }
  | { type: 'profile-stop' }
  | { type: 'profile-report'; componentId: number | string }
  | { type: 'profile-slow'; limit?: number }
  | { type: 'profile-rerenders'; limit?: number }
  | { type: 'profile-timeline'; limit?: number }
  | { type: 'profile-commit'; index: number; limit?: number }
  | { type: 'wait'; condition: 'connected'; timeout?: number }
  | { type: 'wait'; condition: 'component'; name: string; timeout?: number };

export interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** The @cN label, passed through when commands use label-based IDs */
  label?: string;
  /** Contextual hint for empty or stale results */
  hint?: string;
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
  connection: ConnectionHealth;
}
