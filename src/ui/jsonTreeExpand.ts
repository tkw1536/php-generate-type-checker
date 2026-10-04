const TOGGLE_CLASS = 'json-tree-toggle';
const CHILDREN_CLASS = 'json-tree-children';
const COLLAPSED_CLASS = 'json-tree-children--collapsed';
const NODE_EXPANDED_CLASS = 'json-tree-node--expanded';
const PATH_ATTR = 'data-json-path';

/** Expand or collapse every collapsible node under {@link tree}. */
export function setJsonTreeExpanded(tree: HTMLElement, expanded: boolean): void {
  for (const node of tree.querySelectorAll('.json-tree-node')) {
    if (node instanceof HTMLElement) {
      setNodeExpanded(node, expanded);
    }
  }
}

export function setSubtreeExpanded(node: HTMLElement, expanded: boolean): void {
  setNodeExpanded(node, expanded);
  for (const child of node.querySelectorAll('.json-tree-node')) {
    if (child instanceof HTMLElement) {
      setNodeExpanded(child, expanded);
    }
  }
}

export function setNodeExpanded(node: HTMLElement, expanded: boolean): void {
  const button = node.querySelector(`:scope > .json-tree-line .${TOGGLE_CLASS}`);
  const children = node.querySelector(`:scope > .${CHILDREN_CLASS}`);
  if (!(button instanceof HTMLButtonElement) || !(children instanceof HTMLElement)) {
    return;
  }
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
  children.classList.toggle(COLLAPSED_CLASS, !expanded);
  node.classList.toggle(NODE_EXPANDED_CLASS, expanded);
}

export function encodeJsonPath(segments: readonly string[]): string {
  return JSON.stringify(segments);
}

/** Snapshot of expand/collapse state keyed by JSON path. */
export function collectExpansionState(
  tree: HTMLElement,
): ReadonlyMap<string, boolean> {
  const state = new Map<string, boolean>();
  for (const node of tree.querySelectorAll(`.json-tree-node[${PATH_ATTR}]`)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const path = node.getAttribute(PATH_ATTR);
    if (path === null) {
      continue;
    }
    const button = node.querySelector(`:scope > .json-tree-line .${TOGGLE_CLASS}`);
    state.set(
      path,
      button instanceof HTMLButtonElement &&
        button.getAttribute('aria-expanded') === 'true',
    );
  }
  return state;
}

/** Restore expand/collapse for paths present in both {@link state} and {@link tree}. */
export function applyExpansionState(
  tree: HTMLElement,
  state: ReadonlyMap<string, boolean>,
): void {
  for (const node of tree.querySelectorAll(`.json-tree-node[${PATH_ATTR}]`)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const path = node.getAttribute(PATH_ATTR);
    if (path === null || !state.has(path)) {
      continue;
    }
    setNodeExpanded(node, state.get(path) === true);
  }
}
