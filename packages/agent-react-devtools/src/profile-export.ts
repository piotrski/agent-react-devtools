import type {
  ProfilingSession,
  ProfilingCommit,
  ComponentType,
  ProfilingDataExport,
  ProfilingDataForRootExport,
  CommitDataExport,
  SnapshotNodeExport,
} from './types.js';
import type { ComponentTree } from './component-tree.js';

/**
 * Build a React DevTools Profiler export (version 5) from a profiling session.
 *
 * When raw data from React DevTools is available (collected via
 * processProfilingData), it is passed through to ensure full fidelity —
 * including initialTreeBaseDurations that DevTools needs for correct
 * flame graph rendering. Snapshots are always built from the ComponentTree
 * since the protocol sends them empty.
 */
export function buildExportData(
  session: ProfilingSession,
  tree: ComponentTree,
): ProfilingDataExport | null {
  if (session.commits.length === 0) return null;

  if (session.rawRoots.length > 0) {
    return {
      version: 5,
      dataForRoots: session.rawRoots.map((raw) => {
        const subtreeIds = collectSubtreeIds(raw.rootID, tree);
        const snapshots = buildSnapshots(raw.rootID, subtreeIds, tree);
        const operations = raw.operations.length > 0
          ? raw.operations
          : session.commits.map(() => []);

        return {
          commitData: raw.commitData as CommitDataExport[],
          displayName: raw.displayName,
          initialTreeBaseDurations: raw.initialTreeBaseDurations,
          operations,
          rootID: raw.rootID,
          snapshots,
        };
      }),
    };
  }

  // Fallback: reconstruct from parsed commits (e.g. if data came via flat format)
  return buildFromParsedCommits(session, tree);
}

function buildFromParsedCommits(
  session: ProfilingSession,
  tree: ComponentTree,
): ProfilingDataExport {
  let rootIds = tree.getRootIds();
  if (rootIds.length === 0) {
    rootIds = [1];
  }

  const dataForRoots: ProfilingDataForRootExport[] = [];

  for (const rootId of rootIds) {
    const rootNode = tree.getNode(rootId);
    const subtreeIds = collectSubtreeIds(rootId, tree);
    const snapshots = buildSnapshots(rootId, subtreeIds, tree);

    const baseDurationMap = new Map<number, number>();
    for (const nodeId of subtreeIds) {
      baseDurationMap.set(nodeId, 0);
    }
    for (const commit of session.commits) {
      for (const [id, duration] of commit.fiberSelfDurations) {
        if (baseDurationMap.has(id)) {
          baseDurationMap.set(id, duration);
        }
      }
    }

    const commitData: CommitDataExport[] = session.commits.map(
      (commit) => convertCommit(commit),
    );

    dataForRoots.push({
      commitData,
      displayName: rootNode?.displayName || 'Root',
      initialTreeBaseDurations: Array.from(baseDurationMap.entries()),
      operations: session.commits.map(() => []),
      rootID: rootId,
      snapshots,
    });
  }

  return {
    version: 5,
    dataForRoots,
  };
}

function convertCommit(commit: ProfilingCommit): CommitDataExport {
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
    effectDuration: commit.effectDuration ?? 0,
    fiberActualDurations: Array.from(commit.fiberActualDurations.entries()),
    fiberSelfDurations: Array.from(commit.fiberSelfDurations.entries()),
    passiveEffectDuration: commit.passiveEffectDuration ?? 0,
    priorityLevel: commit.priorityLevel ?? null,
    timestamp: commit.timestamp,
    updaters: commit.updaters as CommitDataExport['updaters'],
  };
}

function buildSnapshots(
  rootId: number,
  subtreeIds: number[],
  tree: ComponentTree,
): Array<[number, SnapshotNodeExport]> {
  const snapshots: Array<[number, SnapshotNodeExport]> = [];
  for (const nodeId of subtreeIds) {
    const node = tree.getNode(nodeId);
    if (!node) continue;
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
  return snapshots;
}

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
