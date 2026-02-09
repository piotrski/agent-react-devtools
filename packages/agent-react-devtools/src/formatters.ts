import type {
  StatusInfo,
  InspectedElement,
} from './types.js';
import type { TreeNode } from './component-tree.js';

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

// ── Tree connector characters ──
const PIPE = '│  ';
const TEE = '├─ ';
const ELBOW = '└─ ';
const SPACE = '   ';

export function formatTree(nodes: TreeNode[]): string {
  if (nodes.length === 0) return 'No components (is a React app connected?)';

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
    let line = `${node.label} [${typeTag(node.type)}] "${node.displayName}"`;
    if (node.key) line += ` key="${node.key}"`;

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

  const ref = label || `#${element.id}`;
  let header = `${ref} [${typeTag(element.type)}] "${element.displayName}"`;
  if (element.key) header += ` key="${element.key}"`;
  lines.push(header);

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
    .map((n) => {
      let line = `${n.label} [${typeTag(n.type)}] "${n.displayName}"`;
      if (n.key) line += ` key="${n.key}"`;
      return line;
    })
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
  return lines.join('\n');
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

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}
