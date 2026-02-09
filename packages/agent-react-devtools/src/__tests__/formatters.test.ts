import { describe, it, expect } from 'vitest';
import {
  formatTree,
  formatComponent,
  formatSearchResults,
  formatCount,
  formatStatus,
} from '../formatters.js';
import type { TreeNode } from '../component-tree.js';
import type { InspectedElement, StatusInfo } from '../types.js';

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
