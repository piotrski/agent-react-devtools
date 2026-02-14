import { describe, it, expect } from 'vitest';
import {
  formatTree,
  formatComponent,
  formatSearchResults,
  formatCount,
  formatStatus,
  formatAgo,
  formatProfileSummary,
  formatProfileReport,
  formatSlowest,
  formatRerenders,
  formatTimeline,
  formatCommitDetail,
} from '../formatters.js';
import type { TreeNode } from '../component-tree.js';
import type { InspectedElement, StatusInfo, ComponentRenderReport, ConnectionHealth } from '../types.js';
import type { ProfileSummary, TimelineEntry, CommitDetail } from '../profiler.js';

describe('formatTree', () => {
  it('should format empty tree', () => {
    expect(formatTree([])).toContain('No components');
    expect(formatTree([])).toContain('is a React app connected?');
  });

  it('should show hint when provided for empty tree', () => {
    const result = formatTree([], 'app disconnected 5s ago, waiting for reconnect...');
    expect(result).toBe('No components (app disconnected 5s ago, waiting for reconnect...)');
  });

  it('should format a simple tree', () => {
    const nodes: TreeNode[] = [
      { id: 1, label: '@c1', displayName: 'App', type: 'function', key: null, parentId: null, children: [2, 3], depth: 0 },
      { id: 2, label: '@c2', displayName: 'Header', type: 'memo', key: null, parentId: 1, children: [], depth: 1 },
      { id: 3, label: '@c3', displayName: 'Footer', type: 'host', key: null, parentId: 1, children: [], depth: 1 },
    ];

    const result = formatTree(nodes);
    expect(result).toContain('@c1 [fn] App');
    expect(result).toContain('@c2 [memo] Header');
    expect(result).toContain('@c3 [host] Footer');
    expect(result).toContain('├─');
    expect(result).toContain('└─');
  });

  it('should show keys', () => {
    const nodes: TreeNode[] = [
      { id: 1, label: '@c1', displayName: 'List', type: 'function', key: null, parentId: null, children: [2], depth: 0 },
      { id: 2, label: '@c2', displayName: 'Item', type: 'function', key: 'item-1', parentId: 1, children: [], depth: 1 },
    ];

    const result = formatTree(nodes);
    expect(result).toContain('key=item-1');
  });
});

describe('formatComponent', () => {
  it('should format an inspected element', () => {
    const element: InspectedElement = {
      id: 5,
      displayName: 'UserProfile',
      type: 'function',
      key: null,
      props: { userId: 42, theme: 'dark' },
      state: { isEditing: false },
      hooks: [
        { name: 'useState', value: false },
        { name: 'useEffect', value: undefined },
        { name: 'useCallback', value: 'ƒ' },
      ],
      renderedAt: null,
    };

    const result = formatComponent(element, '@c5');
    expect(result).toContain('@c5 [fn] UserProfile');
    expect(result).toContain('props:');
    expect(result).toContain('  userId: 42');
    expect(result).toContain('  theme: "dark"');
    expect(result).toContain('state:');
    expect(result).toContain('  isEditing: false');
    expect(result).toContain('hooks:');
    expect(result).toContain('  useState: false');
  });

  it('should show key without quotes', () => {
    const element: InspectedElement = {
      id: 5,
      displayName: 'Item',
      type: 'function',
      key: 'abc',
      props: {},
      state: null,
      hooks: null,
      renderedAt: null,
    };

    const result = formatComponent(element, '@c5');
    expect(result).toContain('key=abc');
    expect(result).not.toContain('key="abc"');
  });
});

describe('formatSearchResults', () => {
  it('should format empty results', () => {
    expect(formatSearchResults([])).toContain('No components found');
  });

  it('should format results', () => {
    const results: TreeNode[] = [
      { id: 2, label: '@c2', displayName: 'UserProfile', type: 'function', key: null, parentId: 1, children: [], depth: 1 },
      { id: 3, label: '@c3', displayName: 'UserCard', type: 'memo', key: 'bob', parentId: 1, children: [], depth: 1 },
    ];

    const result = formatSearchResults(results);
    expect(result).toContain('@c2 [fn] UserProfile');
    expect(result).toContain('@c3 [memo] UserCard');
    expect(result).toContain('key=bob');
  });
});

describe('formatCount', () => {
  it('should format component counts', () => {
    const counts = { function: 10, memo: 3, host: 25 };
    const result = formatCount(counts);
    expect(result).toContain('38 components');
    expect(result).toContain('host:25');
    expect(result).toContain('fn:10');
    expect(result).toContain('memo:3');
  });
});

describe('formatStatus', () => {
  const baseConnection: ConnectionHealth = {
    connectedApps: 1,
    hasEverConnected: true,
    lastDisconnectAt: null,
    recentEvents: [],
  };

  it('should format status info', () => {
    const status: StatusInfo = {
      daemonRunning: true,
      port: 8097,
      connectedApps: 1,
      componentCount: 47,
      profilingActive: false,
      uptime: 12000,
      connection: baseConnection,
    };

    const result = formatStatus(status);
    expect(result).toContain('running');
    expect(result).toContain('8097');
    expect(result).toContain('1 connected');
    expect(result).toContain('47 components');
  });

  it('should show last connection event', () => {
    const now = Date.now();
    const status: StatusInfo = {
      daemonRunning: true,
      port: 8097,
      connectedApps: 1,
      componentCount: 10,
      profilingActive: false,
      uptime: 5000,
      connection: {
        ...baseConnection,
        recentEvents: [
          { type: 'connected', timestamp: now - 3000 },
        ],
      },
    };

    const result = formatStatus(status);
    expect(result).toContain('Last event: app connected 3s ago');
  });

  it('should show reconnected event', () => {
    const now = Date.now();
    const status: StatusInfo = {
      daemonRunning: true,
      port: 8097,
      connectedApps: 1,
      componentCount: 10,
      profilingActive: false,
      uptime: 5000,
      connection: {
        ...baseConnection,
        recentEvents: [
          { type: 'disconnected', timestamp: now - 4000 },
          { type: 'reconnected', timestamp: now - 2000 },
        ],
      },
    };

    const result = formatStatus(status);
    expect(result).toContain('Last event: app reconnected 2s ago');
  });

  it('should not show events line when no events', () => {
    const status: StatusInfo = {
      daemonRunning: true,
      port: 8097,
      connectedApps: 0,
      componentCount: 0,
      profilingActive: false,
      uptime: 1000,
      connection: baseConnection,
    };

    const result = formatStatus(status);
    expect(result).not.toContain('Last event');
  });
});

describe('formatProfileSummary', () => {
  it('should format summary with labels and types', () => {
    const summary: ProfileSummary = {
      name: 'test-session',
      duration: 5000,
      commitCount: 3,
      componentRenderCounts: [
        { id: 1, displayName: 'App', label: '@c1', type: 'function', count: 10 },
        { id: 2, displayName: 'Header', label: '@c2', type: 'memo', count: 5 },
      ],
    };

    const result = formatProfileSummary(summary);
    expect(result).toContain('test-session');
    expect(result).toContain('5.0s');
    expect(result).toContain('3 commits');
    expect(result).toContain('@c1 [fn] App');
    expect(result).toContain('10 renders');
    expect(result).toContain('@c2 [memo] Header');
    expect(result).toContain('5 renders');
  });

  it('should fallback for missing labels', () => {
    const summary: ProfileSummary = {
      name: 'sess',
      duration: 1000,
      commitCount: 1,
      componentRenderCounts: [
        { id: 1, displayName: 'App', count: 3 },
      ],
    };

    const result = formatProfileSummary(summary);
    expect(result).toContain('? [?] App');
  });
});

describe('formatProfileReport', () => {
  it('should format a render report with type tag', () => {
    const report: ComponentRenderReport = {
      id: 5,
      displayName: 'UserProfile',
      label: '@c5',
      type: 'function',
      renderCount: 12,
      totalDuration: 540,
      avgDuration: 45,
      maxDuration: 120,
      causes: ['props-changed', 'state-changed'],
    };

    const result = formatProfileReport(report);
    expect(result).toContain('@c5 [fn] UserProfile');
    expect(result).toContain('renders:12');
    expect(result).toContain('avg:45.0ms');
    expect(result).toContain('max:120.0ms');
    expect(result).toContain('props-changed');
  });

  it('should prefer explicit label param over report.label', () => {
    const report: ComponentRenderReport = {
      id: 5,
      displayName: 'UserProfile',
      label: '@c5',
      type: 'function',
      renderCount: 1,
      totalDuration: 10,
      avgDuration: 10,
      maxDuration: 10,
      causes: [],
    };

    const result = formatProfileReport(report, '@c99');
    expect(result).toContain('@c99 [fn] UserProfile');
  });
});

describe('formatSlowest', () => {
  it('should format empty data', () => {
    expect(formatSlowest([])).toContain('No profiling data');
  });

  it('should format slowest components with labels and all causes', () => {
    const reports: ComponentRenderReport[] = [
      { id: 1, displayName: 'SlowComp', label: '@c1', type: 'function', renderCount: 5, totalDuration: 250, avgDuration: 50, maxDuration: 100, causes: ['props-changed', 'state-changed'] },
      { id: 2, displayName: 'FastComp', label: '@c2', type: 'memo', renderCount: 10, totalDuration: 100, avgDuration: 10, maxDuration: 20, causes: ['state-changed'] },
    ];

    const result = formatSlowest(reports);
    expect(result).toContain('Slowest');
    expect(result).toContain('@c1 [fn] SlowComp');
    expect(result).toContain('@c2 [memo] FastComp');
    expect(result).toContain('causes:props-changed, state-changed');
    expect(result).toContain('causes:state-changed');
  });
});

describe('formatRerenders', () => {
  it('should format rerender data with labels and all causes', () => {
    const reports: ComponentRenderReport[] = [
      { id: 1, displayName: 'Chatty', label: '@c1', type: 'function', renderCount: 50, totalDuration: 100, avgDuration: 2, maxDuration: 5, causes: ['parent-rendered', 'props-changed'] },
    ];

    const result = formatRerenders(reports);
    expect(result).toContain('50 renders');
    expect(result).toContain('@c1 [fn] Chatty');
    expect(result).toContain('causes:parent-rendered, props-changed');
  });
});

describe('formatTimeline', () => {
  it('should format timeline entries', () => {
    const entries: TimelineEntry[] = [
      { index: 0, timestamp: 1000, duration: 12.5, componentCount: 5 },
      { index: 1, timestamp: 2000, duration: 8.3, componentCount: 3 },
    ];

    const result = formatTimeline(entries);
    expect(result).toContain('#0');
    expect(result).toContain('12.5ms');
    expect(result).toContain('#1');
    expect(result).toContain('8.3ms');
  });
});

describe('formatCommitDetail', () => {
  it('should format commit detail with labels and types', () => {
    const detail: CommitDetail = {
      index: 0,
      timestamp: 1000,
      duration: 15.5,
      components: [
        { id: 1, displayName: 'App', label: '@c1', type: 'function', actualDuration: 15.5, selfDuration: 5.2, causes: ['state-changed'] },
        { id: 2, displayName: 'Header', label: '@c2', type: 'memo', actualDuration: 10.3, selfDuration: 10.3, causes: ['props-changed', 'hooks-changed'] },
      ],
      totalComponents: 2,
    };

    const result = formatCommitDetail(detail);
    expect(result).toContain('Commit #0');
    expect(result).toContain('15.5ms');
    expect(result).toContain('2 components');
    expect(result).toContain('@c1 [fn] App');
    expect(result).toContain('self:5.2ms');
    expect(result).toContain('total:15.5ms');
    expect(result).toContain('causes:state-changed');
    expect(result).toContain('@c2 [memo] Header');
    expect(result).toContain('causes:props-changed, hooks-changed');
  });

  it('should show hidden count', () => {
    const detail: CommitDetail = {
      index: 1,
      timestamp: 2000,
      duration: 10,
      components: [
        { id: 1, displayName: 'App', label: '@c1', type: 'function', actualDuration: 10, selfDuration: 10, causes: [] },
      ],
      totalComponents: 5,
    };

    const result = formatCommitDetail(detail);
    expect(result).toContain('... 4 more');
  });
});
