import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type {
  OptimizeTraceRuleId,
  TraceStep,
} from '../generator/optimizer/trace/types.ts';
import {
  flattenTraceTree,
  isAncestorPath,
  pathEquals,
  pathKey,
  type TracePath,
  type TraceTreeNode,
} from './optimizeTraceTree.ts';

export function listLabel(reasonRule: OptimizeTraceRuleId): string {
  return optimizeTraceRuleInfo(reasonRule).title;
}

export function programGroupLabel(program: string): string {
  return program === '(prune)' ? 'Prune' : program;
}

function groupNodesByProgram(
  nodes: readonly TraceTreeNode[],
): readonly {
  readonly program: string;
  readonly nodes: readonly TraceTreeNode[];
}[] {
  const order: string[] = [];
  const map = new Map<string, TraceTreeNode[]>();
  for (const node of nodes) {
    const program = node.step.program;
    const existing = map.get(program);
    if (existing === undefined) {
      order.push(program);
      map.set(program, [node]);
    } else {
      existing.push(node);
    }
  }
  return order.map((program) => ({
    program,
    nodes: map.get(program)!,
  }));
}

function isHiddenByCollapse(
  node: TraceTreeNode,
  collapsed: ReadonlySet<string>,
): boolean {
  for (const key of collapsed) {
    const ancestor = key.split('.').map(Number);
    if (isAncestorPath(ancestor, node.path)) {
      return true;
    }
  }
  return false;
}

function appendCollapseControl(
  row: HTMLElement,
  node: TraceTreeNode,
  collapsed: ReadonlySet<string>,
  onToggle: (path: TracePath) => void,
): void {
  if (node.childCount === 0) {
    const spacer = document.createElement('span');
    spacer.className = 'optimize-trace-collapse-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.append(spacer);
    return;
  }
  const key = pathKey(node.path);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'optimize-trace-collapse';
  const open = !collapsed.has(key);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute(
    'aria-label',
    open ? 'Collapse nested steps' : 'Expand nested steps',
  );
  // Glyph comes from CSS ::before (+ / −), matching the pipeline JSON tree.
  toggle.addEventListener('click', (ev: Event) => {
    ev.stopPropagation();
    onToggle(node.path);
  });
  row.append(toggle);
}

function appendSelectButton(
  row: HTMLElement,
  node: TraceTreeNode,
  selectedPath: TracePath,
  onSelect: (path: TracePath) => void,
): void {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'optimize-trace-item';
  if (node.depth > 0) {
    item.classList.add('optimize-trace-item--nested');
  }
  item.setAttribute('role', 'option');
  item.dataset.path = pathKey(node.path);
  const active = pathEquals(node.path, selectedPath);
  item.classList.toggle('active', active);
  item.setAttribute('aria-selected', active ? 'true' : 'false');
  item.tabIndex = active ? 0 : -1;
  item.textContent = listLabel(node.reason.rule);
  item.addEventListener('click', () => {
    onSelect(node.path);
  });
  row.append(item);
}

function appendTreeItem(
  root: HTMLElement,
  node: TraceTreeNode,
  selectedPath: TracePath,
  collapsed: ReadonlySet<string>,
  onSelect: (path: TracePath) => void,
  onToggle: (path: TracePath) => void,
): void {
  const row = document.createElement('div');
  row.className = 'optimize-trace-item-row';
  if (node.depth > 0) {
    row.classList.add('optimize-trace-item-row--nested');
    row.style.paddingLeft = `${4 + node.depth * 12}px`;
  }
  appendCollapseControl(row, node, collapsed, onToggle);
  appendSelectButton(row, node, selectedPath, onSelect);
  root.append(row);
}

export type TraceListHandlers = {
  readonly onSelect: (path: TracePath) => void;
  readonly onToggle: (path: TracePath) => void;
};

export function renderEventList(
  steps: readonly TraceStep[],
  selectedPath: TracePath,
  collapsed: ReadonlySet<string>,
  handlers: TraceListHandlers,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'optimize-trace-list';
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', 'Optimize rewrite steps');

  for (const group of groupNodesByProgram(flattenTraceTree(steps))) {
    const heading = document.createElement('div');
    heading.className = 'optimize-trace-group';
    heading.textContent = programGroupLabel(group.program);
    root.append(heading);
    for (const node of group.nodes) {
      if (isHiddenByCollapse(node, collapsed)) {
        continue;
      }
      appendTreeItem(
        root,
        node,
        selectedPath,
        collapsed,
        handlers.onSelect,
        handlers.onToggle,
      );
    }
  }
  return root;
}
