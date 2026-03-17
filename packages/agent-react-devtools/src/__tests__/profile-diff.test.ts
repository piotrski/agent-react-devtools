import { describe, it, expect } from 'vitest';
import { extractStats, diffProfiles } from '../profile-diff.js';
import type { ProfilingDataExport } from '../types.js';

function makeExport(overrides?: Partial<ProfilingDataExport>): ProfilingDataExport {
  return {
    version: 5,
    dataForRoots: [{
      commitData: [{
        changeDescriptions: null,
        duration: 10,
        effectDuration: null,
        fiberActualDurations: [[1, 8], [2, 3]],
        fiberSelfDurations: [[1, 5], [2, 3]],
        passiveEffectDuration: null,
        priorityLevel: null,
        timestamp: 1000,
        updaters: null,
      }],
      displayName: 'Root',
      initialTreeBaseDurations: [[1, 5], [2, 3]],
      operations: [[]],
      rootID: 100,
      snapshots: [
        [1, { id: 1, children: [2], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }],
        [2, { id: 2, children: [], displayName: 'Header', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }],
      ],
    }],
    ...overrides,
  };
}

describe('extractStats', () => {
  it('extracts per-component stats from export data', () => {
    const data = makeExport();
    const stats = extractStats(data);

    expect(stats.size).toBe(2);

    const app = stats.get('App');
    expect(app).toBeDefined();
    expect(app!.renderCount).toBe(1);
    expect(app!.avgDuration).toBe(8);
    expect(app!.avgSelfDuration).toBe(5);

    const header = stats.get('Header');
    expect(header).toBeDefined();
    expect(header!.renderCount).toBe(1);
    expect(header!.avgDuration).toBe(3);
  });

  it('aggregates across multiple commits', () => {
    const data = makeExport({
      dataForRoots: [{
        commitData: [
          {
            changeDescriptions: null,
            duration: 10,
            effectDuration: null,
            fiberActualDurations: [[1, 8]],
            fiberSelfDurations: [[1, 5]],
            passiveEffectDuration: null,
            priorityLevel: null,
            timestamp: 1000,
            updaters: null,
          },
          {
            changeDescriptions: null,
            duration: 6,
            effectDuration: null,
            fiberActualDurations: [[1, 4]],
            fiberSelfDurations: [[1, 2]],
            passiveEffectDuration: null,
            priorityLevel: null,
            timestamp: 2000,
            updaters: null,
          },
        ],
        displayName: 'Root',
        initialTreeBaseDurations: [],
        operations: [[], []],
        rootID: 100,
        snapshots: [
          [1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }],
        ],
      }],
    });

    const stats = extractStats(data);
    const app = stats.get('App')!;
    expect(app.renderCount).toBe(2);
    expect(app.avgDuration).toBe(6); // (8+4)/2
    expect(app.maxDuration).toBe(8);
    expect(app.totalDuration).toBe(12);
  });
});

describe('diffProfiles', () => {
  it('detects regressed components', () => {
    const before = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 10, effectDuration: null,
          fiberActualDurations: [[1, 5]], fiberSelfDurations: [[1, 5]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const after = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 20, effectDuration: null,
          fiberActualDurations: [[1, 15]], fiberSelfDurations: [[1, 15]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.regressed).toHaveLength(1);
    expect(diff.regressed[0].displayName).toBe('App');
    expect(diff.regressed[0].avgDurationDelta).toBe(10);
    expect(diff.regressed[0].avgDurationDeltaPct).toBe(200);
  });

  it('detects improved components', () => {
    const before = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 20, effectDuration: null,
          fiberActualDurations: [[1, 20]], fiberSelfDurations: [[1, 20]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const after = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 5, effectDuration: null,
          fiberActualDurations: [[1, 5]], fiberSelfDurations: [[1, 5]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.improved).toHaveLength(1);
    expect(diff.improved[0].displayName).toBe('App');
    expect(diff.improved[0].avgDurationDeltaPct).toBe(-75);
  });

  it('detects new components', () => {
    const before = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 10, effectDuration: null,
          fiberActualDurations: [[1, 10]], fiberSelfDurations: [[1, 10]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const after = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 15, effectDuration: null,
          fiberActualDurations: [[1, 10], [2, 5]], fiberSelfDurations: [[1, 10], [2, 5]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [
          [1, { id: 1, children: [2], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }],
          [2, { id: 2, children: [], displayName: 'NewFeature', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }],
        ],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].displayName).toBe('NewFeature');
  });

  it('detects removed components', () => {
    const before = makeExport();
    const after = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 8, effectDuration: null,
          fiberActualDurations: [[1, 8]], fiberSelfDurations: [[1, 5]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].displayName).toBe('Header');
  });

  it('ignores changes within 5% threshold', () => {
    const before = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 10, effectDuration: null,
          fiberActualDurations: [[1, 10]], fiberSelfDurations: [[1, 10]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const after = makeExport({
      dataForRoots: [{
        commitData: [{
          changeDescriptions: null, duration: 10.3, effectDuration: null,
          fiberActualDurations: [[1, 10.3]], fiberSelfDurations: [[1, 10.3]],
          passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
        }],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[]], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.regressed).toHaveLength(0);
    expect(diff.improved).toHaveLength(0);
  });

  it('computes correct summary totals', () => {
    const before = makeExport();
    const after = makeExport({
      dataForRoots: [{
        commitData: [
          {
            changeDescriptions: null, duration: 5, effectDuration: null,
            fiberActualDurations: [[1, 5]], fiberSelfDurations: [[1, 5]],
            passiveEffectDuration: null, priorityLevel: null, timestamp: 1000, updaters: null,
          },
          {
            changeDescriptions: null, duration: 3, effectDuration: null,
            fiberActualDurations: [[1, 3]], fiberSelfDurations: [[1, 3]],
            passiveEffectDuration: null, priorityLevel: null, timestamp: 2000, updaters: null,
          },
        ],
        displayName: 'Root', initialTreeBaseDurations: [], operations: [[], []], rootID: 100,
        snapshots: [[1, { id: 1, children: [], displayName: 'App', hocDisplayNames: null, key: null, type: 5, compiledWithForget: false }]],
      }],
    });

    const diff = diffProfiles(before, after);
    expect(diff.summary.totalCommitsBefore).toBe(1);
    expect(diff.summary.totalCommitsAfter).toBe(2);
    expect(diff.summary.totalDurationBefore).toBe(10);
    expect(diff.summary.totalDurationAfter).toBe(8);
  });
});
