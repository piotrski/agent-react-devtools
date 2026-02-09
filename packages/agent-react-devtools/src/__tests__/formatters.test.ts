import { describe, it, expect } from 'vitest';
import {
  formatTree,
  formatComponent,
  formatSearchResults,
  formatCount,
  formatStatus,
  formatProfileReport,
  formatSlowest,
  formatRerenders,
  formatTimeline,
} from '../formatters.js';
import type { TreeNode } from '../component-tree.js';
import type { InspectedElement, StatusInfo, ComponentRenderReport } from '../types.js';
import type { TimelineEntry } from '../profiler.js';

describe('formatTree', () => {
  it('should format empty tree', () => {
    expect(formatTree([])).toContain('No components');
  });

  it('should format a simple tree', () => {
    const nodes: TreeNode[] = [
      { id: 1, label: '@c1', displayName: 'App', type: 'function', key: null, parentId: null, children: [2, 3], depth: 0 },
      { id: 2, label: '@c2', displayName: 'Header', type: 'memo', key: null, parentId: 1, children: [], depth: 1 },
      { id: 3, label: '@c3', displayName: 'Footer', type: 'host', key: null, parentId: 1, children: [], depth: 1 },
    ];

    const result = formatTree(nodes);
    expect(result).toContain('@c1 [fn] "App"');
    expect(result).toContain('@c2 [memo] "Header"');
    expect(result).toContain('@c3 [host] "Footer"');
    expect(result).toContain('├─');
    expect(result).toContain('└─');
  });

  it('should show keys', () => {
    const nodes: TreeNode[] = [
      { id: 1, label: '@c1', displayName: 'List', type: 'function', key: null, parentId: null, children: [2], depth: 0 },
      { id: 2, label: '@c2', displayName: 'Item', type: 'function', key: 'item-1', parentId: 1, children: [], depth: 1 },
    ];

    const result = formatTree(nodes);
    expect(result).toContain('key="item-1"');
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
    expect(result).toContain('@c5 [fn] "UserProfile"');
    expect(result).toContain('props:');
    expect(result).toContain('  userId: 42');
    expect(result).toContain('  theme: "dark"');
    expect(result).toContain('state:');
    expect(result).toContain('  isEditing: false');
    expect(result).toContain('hooks:');
    expect(result).toContain('  useState: false');
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
    expect(result).toContain('@c2 [fn] "UserProfile"');
    expect(result).toContain('@c3 [memo] "UserCard"');
    expect(result).toContain('key="bob"');
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
  it('should format status info', () => {
    const status: StatusInfo = {
      daemonRunning: true,
      port: 8097,
      connectedApps: 1,
      componentCount: 47,
      profilingActive: false,
      uptime: 12000,
    };

    const result = formatStatus(status);
    expect(result).toContain('running');
    expect(result).toContain('8097');
    expect(result).toContain('1 connected');
    expect(result).toContain('47 components');
  });
});

describe('formatProfileReport', () => {
  it('should format a render report', () => {
    const report: ComponentRenderReport = {
      id: 5,
      displayName: 'UserProfile',
      renderCount: 12,
      totalDuration: 540,
      avgDuration: 45,
      maxDuration: 120,
      causes: ['props-changed', 'state-changed'],
    };

    const result = formatProfileReport(report, '@c5');
    expect(result).toContain('@c5 "UserProfile"');
    expect(result).toContain('renders:12');
    expect(result).toContain('avg:45.0ms');
    expect(result).toContain('max:120.0ms');
    expect(result).toContain('props-changed');
  });
});

describe('formatSlowest', () => {
  it('should format empty data', () => {
    expect(formatSlowest([])).toContain('No profiling data');
  });

  it('should format slowest components', () => {
    const reports: ComponentRenderReport[] = [
      { id: 1, displayName: 'SlowComp', renderCount: 5, totalDuration: 250, avgDuration: 50, maxDuration: 100, causes: ['props-changed'] },
      { id: 2, displayName: 'FastComp', renderCount: 10, totalDuration: 100, avgDuration: 10, maxDuration: 20, causes: ['state-changed'] },
    ];

    const result = formatSlowest(reports);
    expect(result).toContain('Slowest');
    expect(result).toContain('SlowComp');
    expect(result).toContain('FastComp');
  });
});

describe('formatRerenders', () => {
  it('should format rerender data', () => {
    const reports: ComponentRenderReport[] = [
      { id: 1, displayName: 'Chatty', renderCount: 50, totalDuration: 100, avgDuration: 2, maxDuration: 5, causes: ['parent-rendered'] },
    ];

    const result = formatRerenders(reports);
    expect(result).toContain('50 renders');
    expect(result).toContain('parent-rendered');
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
