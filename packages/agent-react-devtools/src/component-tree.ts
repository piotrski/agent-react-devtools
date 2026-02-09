import type { ComponentNode, ComponentType } from './types.js';

/**
 * React DevTools operations encoding (protocol v2):
 * Operations is a flat array of numbers representing tree mutations.
 *
 * Format: [rendererID, rootFiberID, stringTableSize, ...stringTable, ...ops]
 *
 * The string table encodes display names and keys. Each entry is:
 *   [length, ...charCodes]
 * String ID 0 = null. String ID 1 = first entry, etc.
 *
 * Operation types (from React DevTools source):
 */
const TREE_OPERATION_ADD = 1;
const TREE_OPERATION_REMOVE = 2;
const TREE_OPERATION_REORDER_CHILDREN = 3;
const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
const TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS = 5;
const TREE_OPERATION_REMOVE_ROOT = 6;
const TREE_OPERATION_SET_SUBTREE_MODE = 7;

/**
 * Suspense tree operations (newer React DevTools backends, e.g. browser extension):
 */
const SUSPENSE_TREE_OPERATION_ADD = 8;
const SUSPENSE_TREE_OPERATION_REMOVE = 9;
const SUSPENSE_TREE_OPERATION_REORDER_CHILDREN = 10;
const SUSPENSE_TREE_OPERATION_RESIZE = 11;
const SUSPENSE_TREE_OPERATION_SUSPENDERS = 12;
const TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE = 13;

/**
 * Element types from React DevTools (react-devtools-shared/src/frontend/types.js)
 */
const ELEMENT_TYPE_CLASS = 1;
// const ELEMENT_TYPE_CONTEXT = 2;
const ELEMENT_TYPE_FUNCTION = 5;
const ELEMENT_TYPE_FORWARD_REF = 6;
const ELEMENT_TYPE_HOST = 7;
const ELEMENT_TYPE_MEMO = 8;
// const ELEMENT_TYPE_OTHER = 9;
const ELEMENT_TYPE_PROFILER = 10;
const ELEMENT_TYPE_ROOT = 11;
const ELEMENT_TYPE_SUSPENSE = 12;

function toComponentType(elementType: number): ComponentType {
  switch (elementType) {
    case ELEMENT_TYPE_CLASS:
      return 'class';
    case ELEMENT_TYPE_FUNCTION:
      return 'function';
    case ELEMENT_TYPE_FORWARD_REF:
      return 'forwardRef';
    case ELEMENT_TYPE_HOST:
      return 'host';
    case ELEMENT_TYPE_MEMO:
      return 'memo';
    case ELEMENT_TYPE_PROFILER:
      return 'profiler';
    case ELEMENT_TYPE_SUSPENSE:
      return 'suspense';
    case ELEMENT_TYPE_ROOT:
      return 'other'; // roots are internal, map to 'other'
    default:
      return 'other';
  }
}

/**
 * Skip a variable-length rect encoding in the operations array.
 * Rects are encoded as: count, then count * 4 values (x, y, w, h each × 1000).
 * A count of -1 means null (no rects).
 * Returns the new index after skipping.
 */
function skipRects(operations: number[], i: number): number {
  const count = operations[i++];
  if (count === -1) return i;
  return i + count * 4;
}

export interface TreeNode {
  id: number;
  label: string;
  displayName: string;
  type: ComponentType;
  key: string | null;
  parentId: number | null;
  children: number[];
  depth: number;
}

export class ComponentTree {
  private nodes = new Map<number, ComponentNode>();
  private roots: number[] = [];
  /** Index: lowercase display name → set of node ids */
  private nameIndex = new Map<string, Set<number>>();
  /** Label → real node ID (e.g., "@c1" → 10) */
  private labelToId = new Map<string, number>();
  /** Real node ID → label */
  private idToLabel = new Map<number, string>();
  /**
   * Whether the backend uses the extended ADD format (8 fields with namePropStringID).
   * Auto-detected from the presence of SUSPENSE_TREE_OPERATION opcodes.
   */
  private extendedAddFormat = false;

  applyOperations(operations: number[]): Array<{ id: number; displayName: string }> {
    if (operations.length < 2) return [];

    const added: Array<{ id: number; displayName: string }> = [];
    const rendererId = operations[0];
    // operations[1] is the root fiber ID
    let i = 2;

    // Parse the string table (protocol v2)
    const stringTable: Array<string | null> = [null]; // ID 0 = null
    const stringTableSize = operations[i++];
    const stringTableEnd = i + stringTableSize;
    while (i < stringTableEnd) {
      const strLen = operations[i++];
      let str = '';
      for (let j = 0; j < strLen; j++) {
        str += String.fromCodePoint(operations[i++]);
      }
      stringTable.push(str);
    }

    // Parse operations
    while (i < operations.length) {
      const op = operations[i];

      switch (op) {
        case TREE_OPERATION_ADD: {
          const id = operations[i + 1];
          const elementType = operations[i + 2];
          i += 3;

          if (elementType === ELEMENT_TYPE_ROOT) {
            // Root node: isStrictModeCompliant, supportsProfiling,
            // supportsStrictMode, hasOwnerMetadata
            i += 4;

            const node: ComponentNode = {
              id,
              displayName: 'Root',
              type: 'other',
              key: null,
              parentId: null,
              children: [],
              rendererId,
            };
            this.nodes.set(id, node);
            added.push({ id, displayName: node.displayName });
            if (!this.roots.includes(id)) {
              this.roots.push(id);
            }
          } else {
            const parentId = operations[i++];
            i++; // ownerID
            const displayNameStringId = operations[i++];
            const keyStringId = operations[i++];
            if (this.extendedAddFormat) {
              i++; // namePropStringID (added in newer backends)
            }

            const displayName =
              (displayNameStringId > 0 ? stringTable[displayNameStringId] : null) ||
              (elementType === ELEMENT_TYPE_HOST ? 'HostComponent' : 'Anonymous');
            const key = keyStringId > 0 ? stringTable[keyStringId] || null : null;

            const node: ComponentNode = {
              id,
              displayName,
              type: toComponentType(elementType),
              key,
              parentId: parentId === 0 ? null : parentId,
              children: [],
              rendererId,
            };

            this.nodes.set(id, node);
            added.push({ id, displayName });

            // Add to parent's children
            if (parentId === 0) {
              if (!this.roots.includes(id)) {
                this.roots.push(id);
              }
            } else {
              const parent = this.nodes.get(parentId);
              if (parent) {
                parent.children.push(id);
              }
            }

            // Update name index
            if (displayName) {
              const lower = displayName.toLowerCase();
              let set = this.nameIndex.get(lower);
              if (!set) {
                set = new Set();
                this.nameIndex.set(lower, set);
              }
              set.add(id);
            }
          }
          break;
        }

        case TREE_OPERATION_REMOVE: {
          const numRemoved = operations[i + 1];
          for (let j = 0; j < numRemoved; j++) {
            const id = operations[i + 2 + j];
            this.removeNode(id);
          }
          i += 2 + numRemoved;
          break;
        }

        case TREE_OPERATION_REORDER_CHILDREN: {
          const id = operations[i + 1];
          const numChildren = operations[i + 2];
          const newChildren: number[] = [];
          for (let j = 0; j < numChildren; j++) {
            newChildren.push(operations[i + 3 + j]);
          }
          const node = this.nodes.get(id);
          if (node) {
            node.children = newChildren;
          }
          i += 3 + numChildren;
          break;
        }

        case TREE_OPERATION_UPDATE_TREE_BASE_DURATION: {
          // id, baseDuration — skip
          i += 3;
          break;
        }

        case TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS: {
          // id, numErrors, numWarnings
          i += 4;
          break;
        }

        case TREE_OPERATION_REMOVE_ROOT: {
          i += 1;
          break;
        }

        case TREE_OPERATION_SET_SUBTREE_MODE: {
          // id, mode
          i += 3;
          break;
        }

        // ── Suspense tree operations (newer backends) ──

        case SUSPENSE_TREE_OPERATION_ADD: {
          // Presence of suspense ops means the backend also uses 8-field ADD
          this.extendedAddFormat = true;
          // fiberID, parentID, nameStringID, isSuspended, rects
          i += 5; // opcode + 4 fields
          i = skipRects(operations, i);
          break;
        }

        case SUSPENSE_TREE_OPERATION_REMOVE: {
          this.extendedAddFormat = true;
          // numIDs, then that many IDs
          const numIds = operations[i + 1];
          i += 2 + numIds;
          break;
        }

        case SUSPENSE_TREE_OPERATION_REORDER_CHILDREN: {
          this.extendedAddFormat = true;
          // parentID, numChildren, then that many child IDs
          const numSuspenseChildren = operations[i + 2];
          i += 3 + numSuspenseChildren;
          break;
        }

        case SUSPENSE_TREE_OPERATION_RESIZE: {
          this.extendedAddFormat = true;
          // fiberID, rects
          i += 2; // opcode + fiberID
          i = skipRects(operations, i);
          break;
        }

        case SUSPENSE_TREE_OPERATION_SUSPENDERS: {
          this.extendedAddFormat = true;
          // numChanges, then numChanges * 4 values
          const numChanges = operations[i + 1];
          i += 2 + numChanges * 4;
          break;
        }

        case TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE: {
          this.extendedAddFormat = true;
          // id
          i += 2;
          break;
        }

        default:
          // Unknown operation — skip one value and try to continue.
          // Future protocol additions may cause brief misalignment but
          // subsequent operations batches will self-correct.
          i++;
          break;
      }
    }

    return added;
  }

  private removeNode(id: number): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove from parent's children
    if (node.parentId !== null) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((c) => c !== id);
      }
    }

    // Remove from roots
    this.roots = this.roots.filter((r) => r !== id);

    // Remove from name index
    if (node.displayName) {
      const lower = node.displayName.toLowerCase();
      const set = this.nameIndex.get(lower);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.nameIndex.delete(lower);
      }
    }

    // Recursively remove children
    for (const childId of node.children) {
      this.removeNode(childId);
    }

    this.nodes.delete(id);
  }

  getNode(id: number): ComponentNode | undefined {
    return this.nodes.get(id);
  }

  getTree(maxDepth?: number): TreeNode[] {
    const result: TreeNode[] = [];

    // Rebuild label maps on every getTree() call
    this.labelToId.clear();
    this.idToLabel.clear();
    let labelCounter = 1;

    const walk = (id: number, depth: number) => {
      const node = this.nodes.get(id);
      if (!node) return;
      if (maxDepth !== undefined && depth > maxDepth) return;

      const label = `@c${labelCounter++}`;
      this.labelToId.set(label, node.id);
      this.idToLabel.set(node.id, label);

      result.push({
        id: node.id,
        label,
        displayName: node.displayName,
        type: node.type,
        key: node.key,
        parentId: node.parentId,
        children: node.children,
        depth,
      });

      for (const childId of node.children) {
        walk(childId, depth + 1);
      }
    };

    for (const rootId of this.roots) {
      walk(rootId, 0);
    }
    return result;
  }

  findByName(name: string, exact?: boolean): TreeNode[] {
    const results: TreeNode[] = [];

    if (exact) {
      const lower = name.toLowerCase();
      const ids = this.nameIndex.get(lower);
      if (ids) {
        for (const id of ids) {
          const node = this.nodes.get(id);
          if (node && node.displayName.toLowerCase() === lower) {
            results.push(this.toTreeNode(node));
          }
        }
      }
    } else {
      const lower = name.toLowerCase();
      for (const [indexName, ids] of this.nameIndex) {
        if (indexName.includes(lower)) {
          for (const id of ids) {
            const node = this.nodes.get(id);
            if (node) {
              results.push(this.toTreeNode(node));
            }
          }
        }
      }
    }

    return results;
  }

  getComponentCount(): number {
    return this.nodes.size;
  }

  getCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      counts[node.type] = (counts[node.type] || 0) + 1;
    }
    return counts;
  }

  getAllNodeIds(): number[] {
    return Array.from(this.nodes.keys());
  }

  getRootIds(): number[] {
    return [...this.roots];
  }

  removeRoot(rootId: number): void {
    this.removeNode(rootId);
  }

  /**
   * Resolve a label like "@c3" to a real node ID.
   * Returns undefined if label not found.
   */
  resolveLabel(label: string): number | undefined {
    return this.labelToId.get(label);
  }

  /**
   * Resolve either a label string ("@c3") or a numeric ID to a real node ID.
   */
  resolveId(id: number | string): number | undefined {
    if (typeof id === 'number') return id;
    if (id.startsWith('@c')) return this.labelToId.get(id);
    // Try parsing as number
    const num = parseInt(id, 10);
    return isNaN(num) ? undefined : num;
  }

  private toTreeNode(node: ComponentNode): TreeNode {
    // Calculate depth by walking up the tree
    let depth = 0;
    let current = node;
    while (current.parentId !== null) {
      depth++;
      const parent = this.nodes.get(current.parentId);
      if (!parent) break;
      current = parent;
    }

    return {
      id: node.id,
      label: this.idToLabel.get(node.id) || `@c?`,
      displayName: node.displayName,
      type: node.type,
      key: node.key,
      parentId: node.parentId,
      children: node.children,
      depth,
    };
  }
}
