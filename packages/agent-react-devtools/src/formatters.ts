import type {
  StatusInfo,
  InspectedElement,
  ComponentRenderReport,
  ChangedKeys,
} from './types.js';
import type { TreeNode } from './component-tree.js';
import type { ProfileSummary, TimelineEntry, CommitDetail } from './profiler.js';

// ── Abbreviations for component types ──
const TYPE_ABBREV: Record<string, string> = {
  function: 'fn',
  class: 'cls',
  host: 'host',
  memo: 'memo',
  forwardRef: 'fRef',
  profiler: 'prof',
  suspense: 'susp',
  context: 'ctx',
  other: '?',
};

function typeTag(type: string): string {
  return TYPE_ABBREV[type] || type;
}

/**
 * Format a consistent component reference: `@c1 [fn] Name` or `@c1 [fn] Name key=x`
 */
function formatRef(opts: { label?: string; type?: string; name: string; key?: string | null }): string {
  const ref = opts.label || '?';
  const tag = typeTag(opts.type || 'other');
  let s = `${ref} [${tag}] ${opts.name}`;
  if (opts.key) s += ` key=${opts.key}`;
  return s;
}

// ── Tree connector characters ──
const PIPE = '│  ';
const TEE = '├─ ';
const ELBOW = '└─ ';
const SPACE = '   ';

export function formatTree(nodes: TreeNode[], hint?: string): string {
  if (nodes.length === 0) {
    return hint ? `No components (${hint})` : 'No components (is a React app connected?)';
  }

  // Build tree structure from the flat list
  const childrenMap = new Map<number | null, TreeNode[]>();
  for (const node of nodes) {
    const parentId = node.parentId;
    let siblings = childrenMap.get(parentId);
    if (!siblings) {
      siblings = [];
      childrenMap.set(parentId, siblings);
    }
    siblings.push(node);
  }

  const lines: string[] = [];

  function walk(nodeId: number, prefix: string, isLast: boolean, isRoot: boolean): void {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const connector = isRoot ? '' : isLast ? ELBOW : TEE;
    const line = formatRef({ label: node.label, type: node.type, name: node.displayName, key: node.key });

    lines.push(`${prefix}${connector}${line}`);

    const children = childrenMap.get(node.id) || [];
    const childPrefix = isRoot ? '' : prefix + (isLast ? SPACE : PIPE);

    for (let i = 0; i < children.length; i++) {
      walk(children[i].id, childPrefix, i === children.length - 1, false);
    }
  }

  // Find root nodes
  const roots = childrenMap.get(null) || [];
  for (let i = 0; i < roots.length; i++) {
    walk(roots[i].id, '', i === roots.length - 1, true);
  }

  return lines.join('\n');
}

export function formatComponent(element: InspectedElement, label?: string): string {
  const lines: string[] = [];

  lines.push(formatRef({ label: label || `#${element.id}`, type: element.type, name: element.displayName, key: element.key }));

  // Props
  if (element.props && Object.keys(element.props).length > 0) {
    lines.push('props:');
    for (const [key, value] of Object.entries(element.props)) {
      lines.push(`  ${key}: ${formatCompactValue(value) ?? 'undefined'}`);
    }
  }

  // State
  if (element.state && Object.keys(element.state).length > 0) {
    lines.push('state:');
    for (const [key, value] of Object.entries(element.state)) {
      lines.push(`  ${key}: ${formatCompactValue(value) ?? 'undefined'}`);
    }
  }

  // Hooks
  if (element.hooks && element.hooks.length > 0) {
    lines.push('hooks:');
    for (const h of element.hooks) {
      const val = formatCompactValue(h.value);
      lines.push(val !== undefined ? `  ${h.name}: ${val}` : `  ${h.name}`);
      if (h.subHooks && h.subHooks.length > 0) {
        for (const sh of h.subHooks) {
          const sval = formatCompactValue(sh.value);
          lines.push(sval !== undefined ? `    ${sh.name}: ${sval}` : `    ${sh.name}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export function formatSearchResults(results: TreeNode[]): string {
  if (results.length === 0) return 'No components found';

  return results
    .map((n) => formatRef({ label: n.label, type: n.type, name: n.displayName, key: n.key }))
    .join('\n');
}

export function formatCount(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${typeTag(type)}:${count}`)
    .join(' ');
  return `${total} components (${parts})`;
}

export function formatStatus(status: StatusInfo): string {
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
  if (status.connection?.recentEvents?.length > 0) {
    const last = status.connection.recentEvents[status.connection.recentEvents.length - 1];
    const ago = formatAgo(Date.now() - last.timestamp);
    lines.push(`Last event: app ${last.type} ${ago}`);
  }
  return lines.join('\n');
}

export function formatAgo(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

export function formatProfileSummary(summary: ProfileSummary): string {
  const lines: string[] = [];
  const durSec = (summary.duration / 1000).toFixed(1);
  lines.push(
    `Profile "${summary.name}" (${durSec}s, ${summary.commitCount} commits)`,
  );

  if (summary.componentRenderCounts.length > 0) {
    lines.push('');
    lines.push('Top renders:');
    for (const c of summary.componentRenderCounts.slice(0, 10)) {
      const ref = formatRef({ label: c.label, type: c.type, name: c.displayName || `#${c.id}` });
      lines.push(`  ${ref}  ${c.count} renders`);
    }
  }

  return lines.join('\n');
}

export function formatProfileReport(report: ComponentRenderReport, label?: string): string {
  const lines: string[] = [];
  lines.push(formatRef({ label: label || report.label || `#${report.id}`, type: report.type, name: report.displayName }));
  lines.push(
    `renders:${report.renderCount}  avg:${report.avgDuration.toFixed(1)}ms  max:${report.maxDuration.toFixed(1)}ms  total:${report.totalDuration.toFixed(1)}ms`,
  );
  if (report.causes.length > 0) {
    lines.push(`causes: ${report.causes.join(', ')}`);
  }
  const keys = formatChangedKeys(report.changedKeys);
  if (keys) {
    lines.push(`changed: ${keys}`);
  }
  return lines.join('\n');
}

export function formatSlowest(reports: ComponentRenderReport[]): string {
  if (reports.length === 0) return 'No profiling data';

  const lines: string[] = ['Slowest (by avg render time):'];
  for (const r of reports) {
    const ref = formatRef({ label: r.label, type: r.type, name: r.displayName });
    const causes = r.causes.length > 0 ? r.causes.join(', ') : '?';
    let line = `  ${ref}  avg:${r.avgDuration.toFixed(1)}ms  max:${r.maxDuration.toFixed(1)}ms  renders:${r.renderCount}  causes:${causes}`;
    const keys = formatChangedKeys(r.changedKeys);
    if (keys) line += `  changed: ${keys}`;
    lines.push(line);
  }
  return lines.join('\n');
}

export function formatRerenders(reports: ComponentRenderReport[]): string {
  if (reports.length === 0) return 'No profiling data';

  const lines: string[] = ['Most re-renders:'];
  for (const r of reports) {
    const ref = formatRef({ label: r.label, type: r.type, name: r.displayName });
    const causes = r.causes.length > 0 ? r.causes.join(', ') : '?';
    let line = `  ${ref}  ${r.renderCount} renders  causes:${causes}`;
    const keys = formatChangedKeys(r.changedKeys);
    if (keys) line += `  changed: ${keys}`;
    lines.push(line);
  }
  return lines.join('\n');
}

export function formatTimeline(entries: TimelineEntry[]): string {
  if (entries.length === 0) return 'No profiling data';

  const lines: string[] = ['Commit timeline:'];
  for (const e of entries) {
    lines.push(
      `  #${e.index}  ${e.duration.toFixed(1)}ms  ${e.componentCount} components`,
    );
  }
  return lines.join('\n');
}

export function formatCommitDetail(detail: CommitDetail): string {
  const lines: string[] = [];
  lines.push(`Commit #${detail.index}  ${detail.duration.toFixed(1)}ms  ${detail.totalComponents} components`);
  lines.push('');
  for (const c of detail.components) {
    const ref = formatRef({ label: c.label, type: c.type, name: c.displayName });
    const causes = c.causes.length > 0 ? c.causes.join(', ') : '?';
    let line = `  ${ref}  self:${c.selfDuration.toFixed(1)}ms  total:${c.actualDuration.toFixed(1)}ms  causes:${causes}`;
    const keys = formatChangedKeys(c.changedKeys);
    if (keys) line += `  changed: ${keys}`;
    lines.push(line);
  }
  const hidden = detail.totalComponents - detail.components.length;
  if (hidden > 0) {
    lines.push(`  ... ${hidden} more (use --limit to show more)`);
  }
  return lines.join('\n');
}

// ── Changed-keys helper ──

export function formatChangedKeys(keys: ChangedKeys | undefined): string {
  if (!keys) return '';
  const parts: string[] = [];
  if (keys.props.length > 0) parts.push(`props: ${keys.props.join(', ')}`);
  if (keys.state.length > 0) parts.push(`state: ${keys.state.join(', ')}`);
  if (keys.hooks.length > 0) parts.push(`hooks: ${keys.hooks.map((h) => `#${h}`).join(', ')}`);
  return parts.join('  ');
}

// ── Helpers ──

function formatCompactValue(val: unknown): string | undefined {
  if (val === undefined) return undefined;
  if (val === null) return 'null';
  if (typeof val === 'function') return 'ƒ';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    const s = JSON.stringify(val, replacer, 0);
    if (s && s.length > 60) return s.slice(0, 57) + '...';
    return s || String(val);
  } catch {
    return String(val);
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'function') return 'ƒ';
  return value;
}
