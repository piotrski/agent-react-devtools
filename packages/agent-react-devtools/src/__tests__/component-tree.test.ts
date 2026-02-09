import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentTree } from '../component-tree.js';

/**
 * Operations encoding reference (protocol v2):
 * [rendererID, rootFiberID, stringTableSize, ...stringTable, ...ops]
 *
 * String table: for each string, [length, ...charCodes]. String ID 0 = null.
 *
 * TREE_OPERATION_ADD (1):
 *   1, id, elementType, parentId, ownerID, displayNameStringID, keyStringID
 *
 * Element types (from react-devtools-shared/src/frontend/types.js):
 *   CLASS=1, FUNCTION=5, FORWARD_REF=6, HOST=7, MEMO=8, PROFILER=10, ROOT=11, SUSPENSE=12
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

function removeOp(...ids: number[]): number[] {
  return [2, ids.length, ...ids];
}

function reorderOp(id: number, children: number[]): number[] {
  return [3, id, children.length, ...children];
}

describe('ComponentTree', () => {
  let tree: ComponentTree;

  beforeEach(() => {
    tree = new ComponentTree();
  });

  it('should add nodes from operations', () => {
    const ops = buildOps(1, 100, ['App', 'Header', 'Footer'], (s) => [
      ...addOp(1, 5, 0, s('App')),     // Function component at root
      ...addOp(2, 8, 1, s('Header')),   // Memo child
      ...addOp(3, 5, 1, s('Footer')),   // Function child
    ]);

    tree.applyOperations(ops);

    expect(tree.getComponentCount()).toBe(3);

    const node1 = tree.getNode(1);
    expect(node1).toBeDefined();
    expect(node1!.displayName).toBe('App');
    expect(node1!.type).toBe('function');
    expect(node1!.children).toEqual([2, 3]);

    const node2 = tree.getNode(2);
    expect(node2!.displayName).toBe('Header');
    expect(node2!.type).toBe('memo');
    expect(node2!.parentId).toBe(1);
  });

  it('should handle keys', () => {
    const ops = buildOps(1, 100, ['List', 'Item', 'item-1', 'item-2'], (s) => [
      ...addOp(1, 5, 0, s('List')),
      ...addOp(2, 5, 1, s('Item'), s('item-1')),
      ...addOp(3, 5, 1, s('Item'), s('item-2')),
    ]);

    tree.applyOperations(ops);

    expect(tree.getNode(2)!.key).toBe('item-1');
    expect(tree.getNode(3)!.key).toBe('item-2');
  });

  it('should remove nodes', () => {
    const addOps = buildOps(1, 100, ['App', 'Child'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('Child')),
    ]);
    tree.applyOperations(addOps);
    expect(tree.getComponentCount()).toBe(2);

    // Remove ops still need a string table (can be empty)
    const rmOps = [1, 100, 0, ...removeOp(2)];
    tree.applyOperations(rmOps);
    expect(tree.getComponentCount()).toBe(1);
    expect(tree.getNode(1)!.children).toEqual([]);
  });

  it('should reorder children', () => {
    const ops = buildOps(1, 100, ['App', 'A', 'B', 'C'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('A')),
      ...addOp(3, 5, 1, s('B')),
      ...addOp(4, 5, 1, s('C')),
    ]);
    tree.applyOperations(ops);
    expect(tree.getNode(1)!.children).toEqual([2, 3, 4]);

    const reorderOps = [1, 100, 0, ...reorderOp(1, [4, 2, 3])];
    tree.applyOperations(reorderOps);
    expect(tree.getNode(1)!.children).toEqual([4, 2, 3]);
  });

  it('should find by name (partial match)', () => {
    const ops = buildOps(1, 100, ['App', 'UserProfile', 'UserCard', 'Footer'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('UserProfile')),
      ...addOp(3, 5, 1, s('UserCard')),
      ...addOp(4, 5, 1, s('Footer')),
    ]);
    tree.applyOperations(ops);

    const results = tree.findByName('user');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.displayName).sort()).toEqual([
      'UserCard',
      'UserProfile',
    ]);
  });

  it('should find by name (exact match)', () => {
    const ops = buildOps(1, 100, ['App', 'UserProfile', 'UserCard'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('UserProfile')),
      ...addOp(3, 5, 1, s('UserCard')),
    ]);
    tree.applyOperations(ops);

    const results = tree.findByName('UserProfile', true);
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('UserProfile');
  });

  it('should get count by type', () => {
    const ops = buildOps(1, 100, ['App', 'MemoComp', 'FuncComp', 'div'], (s) => [
      ...addOp(1, 5, 0, s('App')),       // function
      ...addOp(2, 8, 1, s('MemoComp')),   // memo
      ...addOp(3, 5, 1, s('FuncComp')),   // function
      ...addOp(4, 7, 1, s('div')),        // host
    ]);
    tree.applyOperations(ops);

    const counts = tree.getCountByType();
    expect(counts['function']).toBe(2);
    expect(counts['memo']).toBe(1);
    expect(counts['host']).toBe(1);
  });

  it('should get tree with depth limit', () => {
    const ops = buildOps(1, 100, ['App', 'Level1', 'Level2', 'Level3'], (s) => [
      ...addOp(1, 5, 0, s('App')),
      ...addOp(2, 5, 1, s('Level1')),
      ...addOp(3, 5, 2, s('Level2')),
      ...addOp(4, 5, 3, s('Level3')),
    ]);
    tree.applyOperations(ops);

    const fullTree = tree.getTree();
    expect(fullTree).toHaveLength(4);

    const shallow = tree.getTree(1);
    expect(shallow).toHaveLength(2);
    expect(shallow.map((n) => n.displayName)).toEqual(['App', 'Level1']);
  });

  it('should handle empty operations', () => {
    tree.applyOperations([]);
    expect(tree.getComponentCount()).toBe(0);

    tree.applyOperations([1]);
    expect(tree.getComponentCount()).toBe(0);
  });

  it('should handle all element types', () => {
    const ops = buildOps(
      1, 100,
      ['ClassComp', 'FuncComp', 'ForwardRefComp', 'HostComp', 'MemoComp', 'ProfilerComp', 'SuspenseComp'],
      (s) => [
        ...addOp(1, 1, 0, s('ClassComp')),       // class = 1
        ...addOp(2, 5, 1, s('FuncComp')),         // function = 5
        ...addOp(3, 6, 1, s('ForwardRefComp')),   // forwardRef = 6
        ...addOp(4, 7, 1, s('HostComp')),         // host = 7
        ...addOp(5, 8, 1, s('MemoComp')),         // memo = 8
        ...addOp(6, 10, 1, s('ProfilerComp')),    // profiler = 10
        ...addOp(7, 12, 1, s('SuspenseComp')),    // suspense = 12
      ],
    );
    tree.applyOperations(ops);

    expect(tree.getNode(1)!.type).toBe('class');
    expect(tree.getNode(2)!.type).toBe('function');
    expect(tree.getNode(3)!.type).toBe('forwardRef');
    expect(tree.getNode(4)!.type).toBe('host');
    expect(tree.getNode(5)!.type).toBe('memo');
    expect(tree.getNode(6)!.type).toBe('profiler');
    expect(tree.getNode(7)!.type).toBe('suspense');
  });
});
