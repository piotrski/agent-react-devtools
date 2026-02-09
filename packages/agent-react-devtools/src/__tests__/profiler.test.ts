import { describe, it, expect, beforeEach } from 'vitest';
import { Profiler } from '../profiler.js';
import { ComponentTree } from '../component-tree.js';

/**
 * Operations encoding reference (protocol v2):
 * [rendererID, rootFiberID, stringTableSize, ...stringTable, ...ops]
 *
 * String table: for each string, [length, ...charCodes]. String ID 0 = null.
 *
 * TREE_OPERATION_ADD (1):
 *   1, id, elementType, parentId, ownerID, displayNameStringID, keyStringID
 */

/** Build a string table and return [tableData, stringIdMap] */
function buildStringTable(strings: string[]): [number[], Map<string, number>] {
  const idMap = new Map<string, number>();
  const data: number[] = [];
  for (const s of strings) {
    const id = idMap.size + 1; // 0 is reserved for null
    if (!idMap.has(s)) {
      idMap.set(s, id);
      data.push(s.length, ...Array.from(s).map((c) => c.charCodeAt(0)));
    }
  }
  return [data, idMap];
}

/** Build a complete operations array with string table */
function buildOps(
  rendererID: number,
  rootID: number,
  strings: string[],
  opsFn: (strId: (s: string) => number) => number[],
): number[] {
  const [tableData, idMap] = buildStringTable(strings);
  const strId = (s: string) => idMap.get(s) || 0;
  const ops = opsFn(strId);
  return [rendererID, rootID, tableData.length, ...tableData, ...ops];
}

function addOp(
  id: number,
  elementType: number,
  parentId: number,
  displayNameStrId: number,
  keyStrId: number = 0,
): number[] {
  return [1, id, elementType, parentId, 0, displayNameStrId, keyStrId];
}

describe('Profiler', () => {
  let profiler: Profiler;
  let tree: ComponentTree;

  beforeEach(() => {
    profiler = new Profiler();
    tree = new ComponentTree();

    // Set up a basic tree (FUNCTION=5 in protocol v2)
    const ops = buildOps(1, 100, ['App', 'Header', 'Content'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('Header')),
      ...addOp(3, 5, 1, s('Content')),
    ]);
    tree.applyOperations(ops);
  });

  it('should track active state', () => {
    expect(profiler.isActive()).toBe(false);
    profiler.start('test');
    expect(profiler.isActive()).toBe(true);
    profiler.stop();
    expect(profiler.isActive()).toBe(false);
  });

  it('should return null when stopping without starting', () => {
    expect(profiler.stop()).toBeNull();
  });

  it('should process flat profiling data', () => {
    profiler.start('test');

    profiler.processProfilingData({
      commitData: [
        {
          timestamp: 1000,
          duration: 15,
          fiberActualDurations: [1, 10, 2, 3, 3, 2],
          fiberSelfDurations: [1, 5, 2, 3, 3, 2],
        },
        {
          timestamp: 2000,
          duration: 8,
          fiberActualDurations: [1, 5, 3, 3],
          fiberSelfDurations: [1, 2, 3, 3],
        },
      ],
    });

    const summary = profiler.stop();
    expect(summary).not.toBeNull();
    expect(summary!.commitCount).toBe(2);
    expect(summary!.componentRenderCounts.length).toBeGreaterThan(0);
  });

  it('should generate render reports', () => {
    profiler.start('test');

    profiler.processProfilingData({
      commitData: [
        {
          timestamp: 1000,
          duration: 15,
          fiberActualDurations: [1, 10, 2, 3],
          fiberSelfDurations: [1, 5, 2, 3],
          changeDescriptions: [
            [1, { props: ['theme'], isFirstMount: false }],
            [2, { isFirstMount: true }],
          ],
        },
        {
          timestamp: 2000,
          duration: 8,
          fiberActualDurations: [1, 20],
          fiberSelfDurations: [1, 15],
          changeDescriptions: [
            [1, { didHooksChange: true, isFirstMount: false }],
          ],
        },
      ],
    });

    const report = profiler.getReport(1, tree);
    expect(report).not.toBeNull();
    expect(report!.displayName).toBe('App');
    expect(report!.renderCount).toBe(2);
    expect(report!.totalDuration).toBe(30);
    expect(report!.avgDuration).toBe(15);
    expect(report!.maxDuration).toBe(20);
    expect(report!.causes).toContain('props-changed');
    expect(report!.causes).toContain('hooks-changed');
  });

  it('should find slowest components', () => {
    profiler.start('test');

    profiler.processProfilingData({
      commitData: [
        {
          timestamp: 1000,
          duration: 15,
          fiberActualDurations: [1, 50, 2, 5, 3, 30],
          fiberSelfDurations: [1, 15, 2, 5, 3, 30],
        },
      ],
    });

    const slowest = profiler.getSlowest(tree, 2);
    expect(slowest).toHaveLength(2);
    expect(slowest[0].displayName).toBe('App');
    expect(slowest[1].displayName).toBe('Content');
  });

  it('should find most rerenders', () => {
    profiler.start('test');

    profiler.processProfilingData({
      commitData: [
        {
          timestamp: 1000,
          duration: 5,
          fiberActualDurations: [1, 1, 2, 1, 3, 1],
          fiberSelfDurations: [1, 1, 2, 1, 3, 1],
        },
        {
          timestamp: 2000,
          duration: 5,
          fiberActualDurations: [2, 1, 3, 1],
          fiberSelfDurations: [2, 1, 3, 1],
        },
        {
          timestamp: 3000,
          duration: 5,
          fiberActualDurations: [3, 1],
          fiberSelfDurations: [3, 1],
        },
      ],
    });

    const rerenders = profiler.getMostRerenders(tree, 3);
    expect(rerenders[0].displayName).toBe('Content');
    expect(rerenders[0].renderCount).toBe(3);
  });

  it('should process dataForRoots nested format', () => {
    profiler.start('test');

    profiler.processProfilingData({
      dataForRoots: [
        {
          commitData: [
            {
              timestamp: 1000,
              duration: 12,
              fiberActualDurations: [1, 8, 2, 4],
              fiberSelfDurations: [1, 4, 2, 4],
              changeDescriptions: [
                [1, { props: ['count'], isFirstMount: false }],
                [2, { state: ['value'], isFirstMount: false }],
              ],
            },
          ],
        },
      ],
    });

    const summary = profiler.stop();
    expect(summary).not.toBeNull();
    expect(summary!.commitCount).toBe(1);

    // Verify the state change was captured correctly
    profiler.start('test2');
    profiler.processProfilingData({
      dataForRoots: [
        {
          commitData: [
            {
              timestamp: 2000,
              duration: 5,
              fiberActualDurations: [2, 3],
              fiberSelfDurations: [2, 3],
              changeDescriptions: [
                [2, { state: ['value', 'count'], isFirstMount: false }],
              ],
            },
          ],
        },
      ],
    });

    const report = profiler.getReport(2, tree);
    expect(report).not.toBeNull();
    expect(report!.causes).toContain('state-changed');
  });

  it('should generate timeline', () => {
    profiler.start('test');

    profiler.processProfilingData({
      commitData: [
        { timestamp: 1000, duration: 10, fiberActualDurations: [1, 5], fiberSelfDurations: [] },
        { timestamp: 2000, duration: 20, fiberActualDurations: [1, 10, 2, 5], fiberSelfDurations: [] },
      ],
    });

    const timeline = profiler.getTimeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0].duration).toBe(10);
    expect(timeline[0].componentCount).toBe(1);
    expect(timeline[1].duration).toBe(20);
    expect(timeline[1].componentCount).toBe(2);
  });
});
