import { readFileSync } from 'node:fs';
import type { ProfilingDataExport } from './types.js';

export interface ComponentStats {
  displayName: string;
  renderCount: number;
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  avgSelfDuration: number;
}

export interface DiffEntry {
  displayName: string;
  before: ComponentStats | null;
  after: ComponentStats | null;
  avgDurationDelta: number;
  avgDurationDeltaPct: number | null;
  renderCountDelta: number;
}

export interface ProfileDiffResult {
  regressed: DiffEntry[];
  improved: DiffEntry[];
  added: DiffEntry[];
  removed: DiffEntry[];
  summary: {
    totalCommitsBefore: number;
    totalCommitsAfter: number;
    totalDurationBefore: number;
    totalDurationAfter: number;
  };
}

/**
 * Extract per-component stats from a profiling export.
 * Aggregates across all roots and commits, keyed by displayName.
 */
export function extractStats(data: ProfilingDataExport): Map<string, ComponentStats> {
  // Build a fiber ID -> displayName map from snapshots
  const nameMap = new Map<number, string>();
  for (const root of data.dataForRoots) {
    for (const [id, snap] of root.snapshots) {
      if (snap.displayName) {
        nameMap.set(id, snap.displayName);
      }
    }
  }

  // Accumulate per-displayName render data
  const acc = new Map<string, {
    totalActual: number;
    totalSelf: number;
    maxActual: number;
    count: number;
  }>();

  for (const root of data.dataForRoots) {
    for (const commit of root.commitData) {
      for (const [id, duration] of commit.fiberActualDurations) {
        const name = nameMap.get(id);
        if (!name) continue;

        let entry = acc.get(name);
        if (!entry) {
          entry = { totalActual: 0, totalSelf: 0, maxActual: 0, count: 0 };
          acc.set(name, entry);
        }
        entry.totalActual += duration;
        entry.count++;
        if (duration > entry.maxActual) entry.maxActual = duration;

        // Find matching self duration
        const selfEntry = commit.fiberSelfDurations.find(([sid]) => sid === id);
        if (selfEntry) {
          entry.totalSelf += selfEntry[1];
        }
      }
    }
  }

  const result = new Map<string, ComponentStats>();
  for (const [name, entry] of acc) {
    result.set(name, {
      displayName: name,
      renderCount: entry.count,
      totalDuration: entry.totalActual,
      avgDuration: entry.count > 0 ? entry.totalActual / entry.count : 0,
      maxDuration: entry.maxActual,
      avgSelfDuration: entry.count > 0 ? entry.totalSelf / entry.count : 0,
    });
  }
  return result;
}

function getTotalDuration(data: ProfilingDataExport): number {
  let total = 0;
  for (const root of data.dataForRoots) {
    for (const commit of root.commitData) {
      total += commit.duration;
    }
  }
  return total;
}

function getTotalCommits(data: ProfilingDataExport): number {
  let total = 0;
  for (const root of data.dataForRoots) {
    total += root.commitData.length;
  }
  return total;
}

const THRESHOLD_PCT = 5;

export function diffProfiles(
  before: ProfilingDataExport,
  after: ProfilingDataExport,
): ProfileDiffResult {
  const statsBefore = extractStats(before);
  const statsAfter = extractStats(after);

  const allNames = new Set([...statsBefore.keys(), ...statsAfter.keys()]);

  const regressed: DiffEntry[] = [];
  const improved: DiffEntry[] = [];
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];

  for (const name of allNames) {
    const b = statsBefore.get(name) ?? null;
    const a = statsAfter.get(name) ?? null;

    if (!b && a) {
      added.push({
        displayName: name,
        before: null,
        after: a,
        avgDurationDelta: a.avgDuration,
        avgDurationDeltaPct: null,
        renderCountDelta: a.renderCount,
      });
      continue;
    }

    if (b && !a) {
      removed.push({
        displayName: name,
        before: b,
        after: null,
        avgDurationDelta: -b.avgDuration,
        avgDurationDeltaPct: null,
        renderCountDelta: -b.renderCount,
      });
      continue;
    }

    if (b && a) {
      const delta = a.avgDuration - b.avgDuration;
      const pct = b.avgDuration > 0 ? (delta / b.avgDuration) * 100 : null;

      const entry: DiffEntry = {
        displayName: name,
        before: b,
        after: a,
        avgDurationDelta: delta,
        avgDurationDeltaPct: pct,
        renderCountDelta: a.renderCount - b.renderCount,
      };

      if (pct !== null && pct > THRESHOLD_PCT) {
        regressed.push(entry);
      } else if (pct !== null && pct < -THRESHOLD_PCT) {
        improved.push(entry);
      }
      // within threshold = unchanged, skip
    }
  }

  // Sort: regressed by biggest % increase, improved by biggest % decrease
  regressed.sort((a, b) => (b.avgDurationDeltaPct ?? 0) - (a.avgDurationDeltaPct ?? 0));
  improved.sort((a, b) => (a.avgDurationDeltaPct ?? 0) - (b.avgDurationDeltaPct ?? 0));
  added.sort((a, b) => b.avgDurationDelta - a.avgDurationDelta);
  removed.sort((a, b) => a.avgDurationDelta - b.avgDurationDelta);

  return {
    regressed,
    improved,
    added,
    removed,
    summary: {
      totalCommitsBefore: getTotalCommits(before),
      totalCommitsAfter: getTotalCommits(after),
      totalDurationBefore: getTotalDuration(before),
      totalDurationAfter: getTotalDuration(after),
    },
  };
}

export function loadExportFile(filePath: string): ProfilingDataExport {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as ProfilingDataExport;
  if (data.version !== 5) {
    throw new Error(`Unsupported export version: ${data.version} (expected 5)`);
  }
  if (!Array.isArray(data.dataForRoots)) {
    throw new Error('Invalid export file: missing dataForRoots');
  }
  return data;
}
