import type {
  ProfilingSession,
  ProfilingCommit,
  ChangeDescription,
  ComponentRenderReport,
  RenderCause,
  ChangedKeys,
  ComponentType,
  ProfilingDataExport,
  ProfilingDataForRootExport,
  CommitDataExport,
  SnapshotNodeExport,
} from './types.js';
import type { ComponentTree } from './component-tree.js';

export interface ProfileSummary {
  name: string;
  duration: number;
  commitCount: number;
  componentRenderCounts: { id: number; displayName: string; label?: string; type?: string; count: number }[];
}

export interface TimelineEntry {
  index: number;
  timestamp: number;
  duration: number;
  componentCount: number;
}

export interface CommitDetail {
  index: number;
  timestamp: number;
  duration: number;
  components: Array<{
    id: number;
    displayName: string;
    label?: string;
    type?: string;
    actualDuration: number;
    selfDuration: number;
    causes: RenderCause[];
    changedKeys?: ChangedKeys;
  }>;
  totalComponents: number;
}

export class Profiler {
  private session: ProfilingSession | null = null;
  /** Display names captured during profiling (survives unmounts) */
  private displayNames = new Map<number, string>();

  isActive(): boolean {
    return this.session !== null && this.session.stoppedAt === null;
  }

  start(name?: string): void {
    this.displayNames.clear();
    this.session = {
      name: name || `session-${Date.now()}`,
      startedAt: Date.now(),
      stoppedAt: null,
      commits: [],
    };
  }

  /** Cache a component's display name (call during profiling to survive unmounts) */
  trackComponent(id: number, displayName: string): void {
    this.displayNames.set(id, displayName);
  }

  stop(tree?: ComponentTree): ProfileSummary | null {
    if (!this.session) return null;
    this.session.stoppedAt = Date.now();

    const duration = this.session.stoppedAt - this.session.startedAt;

    // Count renders per component
    const renderCounts = new Map<number, number>();
    for (const commit of this.session.commits) {
      for (const [id] of commit.fiberActualDurations) {
        renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
      }
    }

    const componentRenderCounts = Array.from(renderCounts.entries())
      .map(([id, count]) => ({
        id,
        displayName: tree?.getNode(id)?.displayName || this.displayNames.get(id) || '',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      name: this.session.name,
      duration,
      commitCount: this.session.commits.length,
      componentRenderCounts,
    };
  }

  /**
   * Process profiling data sent from React DevTools.
   *
   * The data format varies between React versions. We handle the common
   * format where each commit contains:
   * - commitTime
   * - duration
   * - fiberActualDurations: [id, duration, ...]
   * - fiberSelfDurations: [id, duration, ...]
   * - changeDescriptions: Map<id, description>
   */
  processProfilingData(payload: unknown): void {
    if (!this.session) return;

    const data = payload as {
      dataForRoots?: Array<{
        commitData?: Array<{
          changeDescriptions?: Array<[number, unknown]> | Map<number, unknown>;
          duration?: number;
          fiberActualDurations?: Array<[number, number]> | number[];
          fiberSelfDurations?: Array<[number, number]> | number[];
          timestamp?: number;
        }>;
        operations?: unknown[];
      }>;
      // Alternative flat format
      commitData?: Array<{
        changeDescriptions?: Array<[number, unknown]> | Map<number, unknown>;
        duration?: number;
        fiberActualDurations?: Array<[number, number]> | number[];
        fiberSelfDurations?: Array<[number, number]> | number[];
        timestamp?: number;
      }>;
    };

    // Handle nested format (dataForRoots)
    const roots = data?.dataForRoots;
    if (roots) {
      for (const root of roots) {
        if (root.commitData) {
          for (const commitData of root.commitData) {
            this.processCommitData(commitData);
          }
        }
      }
      return;
    }

    // Handle flat format
    if (data?.commitData) {
      for (const commitData of data.commitData) {
        this.processCommitData(commitData);
      }
    }
  }

  private processCommitData(commitData: {
    changeDescriptions?: Array<[number, unknown]> | Map<number, unknown>;
    duration?: number;
    fiberActualDurations?: Array<[number, number]> | number[];
    fiberSelfDurations?: Array<[number, number]> | number[];
    timestamp?: number;
  }): void {
    const commit: ProfilingCommit = {
      timestamp: commitData.timestamp || Date.now(),
      duration: commitData.duration || 0,
      fiberActualDurations: new Map(),
      fiberSelfDurations: new Map(),
      changeDescriptions: new Map(),
    };

    // Parse fiber durations (can be [id, duration, id, duration, ...] or [[id, duration], ...])
    if (commitData.fiberActualDurations) {
      parseDurations(commitData.fiberActualDurations, commit.fiberActualDurations);
    }
    if (commitData.fiberSelfDurations) {
      parseDurations(commitData.fiberSelfDurations, commit.fiberSelfDurations);
    }

    // Parse change descriptions
    if (commitData.changeDescriptions) {
      const entries =
        commitData.changeDescriptions instanceof Map
          ? commitData.changeDescriptions.entries()
          : commitData.changeDescriptions[Symbol.iterator]();
      for (const [id, desc] of entries) {
        const d = desc as {
          didHooksChange?: boolean;
          isFirstMount?: boolean;
          props?: string[] | null;
          state?: string[] | null;
          hooks?: number[] | null;
        };
        commit.changeDescriptions.set(id as number, {
          didHooksChange: d.didHooksChange || false,
          isFirstMount: d.isFirstMount || false,
          props: d.props || null,
          state: d.state || null,
          hooks: d.hooks || null,
        });
      }
    }

    this.session!.commits.push(commit);
  }

  getReport(
    componentId: number,
    tree: ComponentTree,
  ): ComponentRenderReport | null {
    if (!this.session) return null;

    const node = tree.getNode(componentId);
    let renderCount = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    const causeSet = new Set<RenderCause>();
    const propsSet = new Set<string>();
    const stateSet = new Set<string>();
    const hooksSet = new Set<number>();

    for (const commit of this.session.commits) {
      const duration = commit.fiberActualDurations.get(componentId);
      if (duration !== undefined) {
        renderCount++;
        totalDuration += duration;
        if (duration > maxDuration) maxDuration = duration;

        const desc = commit.changeDescriptions.get(componentId);
        if (desc) {
          for (const cause of describeCauses(desc)) {
            causeSet.add(cause);
          }
          const keys = extractChangedKeys(desc);
          for (const p of keys.props) propsSet.add(p);
          for (const s of keys.state) stateSet.add(s);
          for (const h of keys.hooks) hooksSet.add(h);
        }
      }
    }

    if (renderCount === 0) return null;

    return {
      id: componentId,
      displayName: node?.displayName || this.displayNames.get(componentId) || `Component#${componentId}`,
      renderCount,
      totalDuration,
      avgDuration: totalDuration / renderCount,
      maxDuration,
      causes: Array.from(causeSet),
      changedKeys: {
        props: Array.from(propsSet),
        state: Array.from(stateSet),
        hooks: Array.from(hooksSet),
      },
    };
  }

  getSlowest(
    tree: ComponentTree,
    limit = 10,
  ): ComponentRenderReport[] {
    return this.getAllReports(tree)
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  getMostRerenders(
    tree: ComponentTree,
    limit = 10,
  ): ComponentRenderReport[] {
    return this.getAllReports(tree)
      .sort((a, b) => b.renderCount - a.renderCount)
      .slice(0, limit);
  }

  getCommitDetails(index: number, tree: ComponentTree, limit = 10): CommitDetail | null {
    if (!this.session) return null;
    if (index < 0 || index >= this.session.commits.length) return null;

    const commit = this.session.commits[index];
    const components: CommitDetail['components'] = [];

    for (const [id, actualDuration] of commit.fiberActualDurations) {
      const selfDuration = commit.fiberSelfDurations.get(id) || 0;
      const desc = commit.changeDescriptions.get(id);
      components.push({
        id,
        displayName: tree.getNode(id)?.displayName || this.displayNames.get(id) || `Component#${id}`,
        actualDuration,
        selfDuration,
        causes: desc ? describeCauses(desc) : [],
        changedKeys: desc ? extractChangedKeys(desc) : { props: [], state: [], hooks: [] },
      });
    }

    components.sort((a, b) => b.selfDuration - a.selfDuration);

    const totalCount = components.length;

    return {
      index,
      timestamp: commit.timestamp,
      duration: commit.duration,
      components: limit > 0 ? components.slice(0, limit) : components,
      totalComponents: totalCount,
    };
  }

  getTimeline(limit?: number): TimelineEntry[] {
    if (!this.session) return [];

    const entries = this.session.commits.map((commit, index) => ({
      index,
      timestamp: commit.timestamp,
      duration: commit.duration,
      componentCount: commit.fiberActualDurations.size,
    }));

    if (limit) return entries.slice(0, limit);
    return entries;
  }

  /**
   * Export profiling data in React DevTools Profiler format (version 5).
   * The output can be imported into React DevTools via the Profiler tab.
   */
  getExportData(tree: ComponentTree): ProfilingDataExport | null {
    if (!this.session || this.session.commits.length === 0) return null;

    // Group commits by root ID (most apps have one root)
    let rootIds = tree.getRootIds();
    if (rootIds.length === 0) {
      // Fallback: use a synthetic root
      rootIds = [1];
    }

    const dataForRoots: ProfilingDataForRootExport[] = [];

    for (const rootId of rootIds) {
      const rootNode = tree.getNode(rootId);

      // Collect node IDs belonging to this root's subtree
      const subtreeIds = collectSubtreeIds(rootId, tree);

      // Build snapshots from this root's subtree only
      const snapshots: Array<[number, SnapshotNodeExport]> = [];
      for (const nodeId of subtreeIds) {
        const node = tree.getNode(nodeId);
        if (!node) continue;
        // Real ROOT nodes have type 'other' (mapped from ELEMENT_TYPE_ROOT=11).
        // Restore the original element type 11 for export so DevTools recognises them.
        const elementType =
          nodeId === rootId && node.type === 'other'
            ? 11
            : componentTypeToElementType(node.type);
        snapshots.push([nodeId, {
          id: nodeId,
          children: node.children,
          displayName: node.displayName || null,
          hocDisplayNames: null,
          key: node.key,
          type: elementType,
          compiledWithForget: false,
        }]);
      }

      // Build initial tree base durations for ALL nodes in the subtree.
      // Use the latest self duration seen across all commits (components that
      // never rendered during profiling default to 0).
      const baseDurationMap = new Map<number, number>();
      for (const nodeId of subtreeIds) {
        baseDurationMap.set(nodeId, 0);
      }
      for (const commit of this.session.commits) {
        for (const [id, duration] of commit.fiberSelfDurations) {
          if (baseDurationMap.has(id)) {
            baseDurationMap.set(id, duration);
          }
        }
      }
      const initialTreeBaseDurations = Array.from(baseDurationMap.entries());

      // Convert commits
      const commitData: CommitDataExport[] = this.session.commits.map(
        (commit) => this.convertCommit(commit),
      );

      dataForRoots.push({
        commitData,
        displayName: rootNode?.displayName || 'Root',
        initialTreeBaseDurations,
        operations: this.session.commits.map(() => []),
        rootID: rootId,
        snapshots,
      });
    }

    return {
      version: 5,
      dataForRoots,
    };
  }

  private convertCommit(commit: ProfilingCommit): CommitDataExport {
    const changeDescriptions: Array<[number, {
      context: null;
      didHooksChange: boolean;
      isFirstMount: boolean;
      props: string[] | null;
      state: string[] | null;
      hooks: number[] | null;
    }]> = [];

    for (const [id, desc] of commit.changeDescriptions) {
      changeDescriptions.push([id, {
        context: null,
        didHooksChange: desc.didHooksChange,
        isFirstMount: desc.isFirstMount,
        props: desc.props,
        state: desc.state,
        hooks: desc.hooks,
      }]);
    }

    return {
      changeDescriptions: changeDescriptions.length > 0 ? changeDescriptions : null,
      duration: commit.duration,
      effectDuration: null,
      fiberActualDurations: Array.from(commit.fiberActualDurations.entries()),
      fiberSelfDurations: Array.from(commit.fiberSelfDurations.entries()),
      passiveEffectDuration: null,
      priorityLevel: null,
      timestamp: commit.timestamp,
      updaters: null,
    };
  }

  private getAllReports(tree: ComponentTree): ComponentRenderReport[] {
    if (!this.session) return [];

    // Collect all component IDs that appear in profiling data
    const componentIds = new Set<number>();
    for (const commit of this.session.commits) {
      for (const id of commit.fiberActualDurations.keys()) {
        componentIds.add(id);
      }
    }

    const reports: ComponentRenderReport[] = [];
    for (const id of componentIds) {
      const report = this.getReport(id, tree);
      if (report) reports.push(report);
    }
    return reports;
  }
}

/** Collect all node IDs in a root's subtree (including the root itself). */
function collectSubtreeIds(rootId: number, tree: ComponentTree): number[] {
  const ids: number[] = [];
  const visit = (id: number) => {
    const node = tree.getNode(id);
    if (!node) return;
    ids.push(id);
    for (const childId of node.children) {
      visit(childId);
    }
  };
  visit(rootId);
  return ids;
}

function componentTypeToElementType(type: ComponentType): number {
  switch (type) {
    case 'class': return 1;
    case 'context': return 2;
    case 'function': return 5;
    case 'forwardRef': return 6;
    case 'host': return 7;
    case 'memo': return 8;
    case 'profiler': return 10;
    case 'suspense': return 12;
    case 'other': return 9;
    default: return 9;
  }
}

function parseDurations(
  raw: Array<[number, number]> | number[],
  target: Map<number, number>,
): void {
  if (raw.length === 0) return;

  // Check if it's array of tuples or flat array
  if (Array.isArray(raw[0])) {
    // [[id, duration], ...]
    for (const [id, duration] of raw as Array<[number, number]>) {
      target.set(id, duration);
    }
  } else {
    // [id, duration, id, duration, ...]
    const flat = raw as number[];
    for (let i = 0; i < flat.length; i += 2) {
      target.set(flat[i], flat[i + 1]);
    }
  }
}

function describeCauses(desc: ChangeDescription): RenderCause[] {
  const causes: RenderCause[] = [];
  if (desc.isFirstMount) {
    causes.push('first-mount');
    return causes;
  }
  if (desc.props && desc.props.length > 0) causes.push('props-changed');
  if (desc.state && desc.state.length > 0) causes.push('state-changed');
  if (desc.didHooksChange) causes.push('hooks-changed');
  // If no specific cause found, it was likely parent-triggered
  if (causes.length === 0) causes.push('parent-rendered');
  return causes;
}

function extractChangedKeys(desc: ChangeDescription): ChangedKeys {
  return {
    props: desc.props ?? [],
    state: desc.state ?? [],
    hooks: desc.hooks ?? [],
  };
}
