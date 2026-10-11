import type {
  TraceReasoning,
  TraceStep,
  TraceStepReason,
} from '../generator/optimizer/trace/types.ts';

/** Path into the step tree: [topLevelIndex, childIndex, ...]. */
export type TracePath = readonly number[];

export type TraceTreeNode = {
  readonly path: TracePath;
  readonly step: TraceStep;
  readonly reason: TraceStepReason;
  readonly depth: number;
  /** True when this row is a top-level checker-advancing step. */
  readonly topLevel: boolean;
  /** Direct nested step children (for collapse toggles). */
  readonly childCount: number;
};

function childSteps(reason: TraceReasoning): readonly TraceStepReason[] {
  if (reason.kind !== 'step') {
    return [];
  }
  const out: TraceStepReason[] = [];
  for (const child of reason.children) {
    if (child.kind === 'step') {
      out.push(child);
    } else if (child.kind === 'seq') {
      for (const part of child.parts) {
        if (part.kind === 'step') {
          out.push(part);
        }
      }
    }
  }
  return out;
}

function walkReason(
  step: TraceStep,
  reason: TraceStepReason,
  path: TracePath,
  depth: number,
  topLevel: boolean,
): readonly TraceTreeNode[] {
  const children = childSteps(reason);
  const self: TraceTreeNode = {
    path,
    step,
    reason,
    depth,
    topLevel,
    childCount: children.length,
  };
  return [
    self,
    ...children.flatMap((child, i) =>
      walkReason(step, child, [...path, i], depth + 1, false),
    ),
  ];
}

export function pathKey(path: TracePath): string {
  return path.join('.');
}

/** True when `ancestor` is a proper prefix of `path`. */
export function isAncestorPath(ancestor: TracePath, path: TracePath): boolean {
  if (ancestor.length >= path.length) {
    return false;
  }
  for (let i = 0; i < ancestor.length; i++) {
    if (ancestor[i] !== path[i]) {
      return false;
    }
  }
  return true;
}

/** Default-collapsed path keys for a freshly loaded trace. */
export function defaultCollapsedKeys(
  nodes: readonly TraceTreeNode[],
  isCollapsedRule: (rule: TraceStepReason['rule']) => boolean,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const node of nodes) {
    if (node.childCount > 0 && isCollapsedRule(node.reason.rule)) {
      keys.add(pathKey(node.path));
    }
  }
  return keys;
}

/** Flatten steps into a depth-first tree for the left list. */
export function flattenTraceTree(
  steps: readonly TraceStep[],
): readonly TraceTreeNode[] {
  return steps.flatMap((step) =>
    walkReason(step, step.reason, [step.index], 0, true),
  );
}

export function pathEquals(a: TracePath, b: TracePath): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function findTreeNode(
  nodes: readonly TraceTreeNode[],
  path: TracePath,
): TraceTreeNode | undefined {
  return nodes.find((n) => pathEquals(n.path, path));
}
