import {
  encodeJsonPath,
  setNodeExpanded,
  setSubtreeExpanded,
} from './jsonTreeExpand.ts';

const TOGGLE_CLASS = 'json-tree-toggle';
const CHILDREN_CLASS = 'json-tree-children';
const COLLAPSED_CLASS = 'json-tree-children--collapsed';
const NODE_EXPANDED_CLASS = 'json-tree-node--expanded';
const TOGGLE_TITLE = 'Click to toggle · Alt/⌥-click for subtree';

export type JsonParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };

export function parseJsonValue(source: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Collapsible JSON tree using highlight.js token classes. Top level starts expanded. */
export function renderJsonTree(value: unknown): HTMLElement {
  const root = document.createElement('code');
  root.className = 'hljs language-json json-tree';
  root.append(renderValue(value, false, 0, []));
  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !(event instanceof MouseEvent)) {
      return;
    }
    const button = target.closest(`.${TOGGLE_CLASS}`);
    if (!(button instanceof HTMLButtonElement) || !root.contains(button)) {
      return;
    }
    event.preventDefault();
    const node = button.closest('.json-tree-node');
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const nextExpanded = button.getAttribute('aria-expanded') !== 'true';
    if (event.altKey) {
      setSubtreeExpanded(node, nextExpanded);
    } else {
      setNodeExpanded(node, nextExpanded);
    }
  });
  return root;
}

function renderValue(
  value: unknown,
  trailingComma: boolean,
  depth: number,
  path: readonly string[],
): DocumentFragment {
  const primitive = primitiveToken(value);
  if (primitive !== undefined) {
    const fragment = document.createDocumentFragment();
    fragment.append(
      lineOf(undefined, depth, token(primitive.text, primitive.className), maybeComma(trailingComma)),
    );
    return fragment;
  }
  if (typeof value === 'object' && value !== null) {
    return Array.isArray(value)
      ? renderContainer(value, '[', ']', trailingComma, depth, path, (item, index) =>
          renderValue(item, index < value.length - 1, depth + 1, [
            ...path,
            String(index),
          ]),
        )
      : renderObject(value, trailingComma, depth, path);
  }
  throw new Error('never reached');
}

function renderObject(
  value: object,
  trailingComma: boolean,
  depth: number,
  path: readonly string[],
): DocumentFragment {
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(value);
  return renderContainer(entries, '{', '}', trailingComma, depth, path, ([key, child], index) =>
    renderProperty(key, child, index < entries.length - 1, depth + 1, path),
  );
}

function primitiveToken(
  value: unknown,
): { readonly text: string; readonly className: string } | undefined {
  if (value === null) return { text: 'null', className: 'hljs-literal' };
  if (typeof value === 'string') {
    return { text: JSON.stringify(value), className: 'hljs-string' };
  }
  if (typeof value === 'number') {
    return { text: String(value), className: 'hljs-number' };
  }
  if (typeof value === 'boolean') {
    return { text: value ? 'true' : 'false', className: 'hljs-literal' };
  }
  return undefined;
}

function renderContainer<T>(
  items: readonly T[],
  open: string,
  close: string,
  trailingComma: boolean,
  depth: number,
  path: readonly string[],
  renderItem: (item: T, index: number) => DocumentFragment | HTMLElement,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (items.length === 0) {
    fragment.append(
      lineOf(undefined, depth, brace(open), brace(close), maybeComma(trailingComma)),
    );
    return fragment;
  }
  fragment.append(
    buildCollapsibleNode([], open, close, trailingComma, depth, path, () =>
      renderChildren(items, renderItem),
    ),
  );
  return fragment;
}

function renderChildren<T>(
  items: readonly T[],
  renderItem: (item: T, index: number) => DocumentFragment | HTMLElement,
): HTMLElement {
  const children = document.createElement('div');
  children.className = CHILDREN_CLASS;
  for (const [index, item] of items.entries()) {
    children.append(renderItem(item, index));
  }
  return children;
}

function renderProperty(
  key: string,
  value: unknown,
  trailingComma: boolean,
  depth: number,
  parentPath: readonly string[],
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'json-tree-property';
  const path = [...parentPath, key];
  // Space after ":" must be an element — flex layout drops bare text-node spaces.
  const prefix = [attrKey(key), brace(':'), space()];
  if (isNonEmptyArray(value)) {
    wrapper.append(
      buildCollapsibleNode(prefix, '[', ']', trailingComma, depth, path, () =>
        renderChildren(value, (item, index) =>
          renderValue(item, index < value.length - 1, depth + 1, [
            ...path,
            String(index),
          ]),
        ),
      ),
    );
    return wrapper;
  }
  if (isNonEmptyObject(value)) {
    const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(value);
    wrapper.append(
      buildCollapsibleNode(prefix, '{', '}', trailingComma, depth, path, () =>
        renderChildren(entries, ([childKey, child], index) =>
          renderProperty(childKey, child, index < entries.length - 1, depth + 1, path),
        ),
      ),
    );
    return wrapper;
  }
  wrapper.append(
    lineOf(undefined, depth, ...prefix, ...inlineValueNodes(value), maybeComma(trailingComma)),
  );
  return wrapper;
}

function buildCollapsibleNode(
  prefix: readonly Node[],
  open: string,
  close: string,
  trailingComma: boolean,
  depth: number,
  path: readonly string[],
  makeChildren: () => HTMLElement,
): HTMLElement {
  const node = document.createElement('div');
  node.className = 'json-tree-node';
  node.dataset.jsonPath = encodeJsonPath(path);
  const startExpanded = depth === 0;
  const inlineClose = document.createElement('span');
  inlineClose.className = 'json-tree-inline-close';
  inlineClose.append(brace(close));
  const comma = maybeComma(trailingComma);
  if (comma !== undefined) inlineClose.append(comma);
  const ellipsis = document.createElement('span');
  ellipsis.className = 'json-tree-ellipsis hljs-comment';
  ellipsis.textContent = ' /* ... */ ';
  node.append(
    lineOf(makeToggle(startExpanded), depth, ...prefix, brace(open), ellipsis, inlineClose),
  );
  const children = makeChildren();
  if (startExpanded) node.classList.add(NODE_EXPANDED_CLASS);
  else children.classList.add(COLLAPSED_CLASS);
  node.append(children);
  const end = lineOf(undefined, depth, brace(close), maybeComma(trailingComma));
  end.classList.add('json-tree-end');
  node.append(end);
  return node;
}

function isNonEmptyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isNonEmptyObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function inlineValueNodes(value: unknown): readonly Node[] {
  const primitive = primitiveToken(value);
  if (primitive !== undefined) return [token(primitive.text, primitive.className)];
  if (typeof value === 'object' && value !== null) {
    return Array.isArray(value) ? [brace('['), brace(']')] : [brace('{'), brace('}')];
  }
  throw new Error('never reached');
}

function lineOf(
  gutter: Node | undefined,
  depth: number,
  ...parts: readonly (Node | undefined)[]
): HTMLElement {
  const line = document.createElement('div');
  line.className = 'json-tree-line';
  const gutterEl = document.createElement('span');
  gutterEl.className = 'json-tree-gutter';
  if (gutter !== undefined) {
    gutterEl.append(gutter);
  }
  const content = document.createElement('span');
  content.className = 'json-tree-content';
  content.style.setProperty('--json-tree-depth', String(depth));
  for (const part of parts) {
    if (part !== undefined) {
      content.append(part);
    }
  }
  line.append(gutterEl, content);
  return line;
}

function maybeComma(trailingComma: boolean): HTMLElement | undefined {
  return trailingComma ? brace(',') : undefined;
}

function makeToggle(expanded: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = TOGGLE_CLASS;
  // Glyph comes from CSS ::before so it is not selectable/copyable text.
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
  button.title = TOGGLE_TITLE;
  return button;
}

function attrKey(key: string): HTMLElement {
  return token(JSON.stringify(key), 'hljs-attr');
}

function brace(char: string): HTMLElement {
  return token(char, 'hljs-punctuation');
}

function token(content: string, className: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = content;
  return span;
}

function space(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'json-tree-space';
  span.textContent = ' ';
  return span;
}
