import type {
  ProfilingSession,
  ProfilingCommit,
  ChangeDescription,
  ComponentRenderReport,
  RenderCause,
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
    if (!this.session || this.session.stoppedAt !== null) return;

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
