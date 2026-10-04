/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  applyExpansionState,
  collectExpansionState,
  encodeJsonPath,
  setJsonTreeExpanded,
  setNodeExpanded,
} from './jsonTreeExpand.ts';
import { parseJsonValue, renderJsonTree } from './jsonTreeView.ts';

function rendersPrimitivesWithHljsClasses(): void {
  const root = renderJsonTree({
    str: 'hi',
    num: 1,
    flag: true,
    empty: null,
  });

  expect(root.querySelector('.hljs-attr')?.textContent).toBe('"str"');
  expect(root.querySelector('.hljs-string')?.textContent).toBe('"hi"');
  expect(root.querySelector('.hljs-number')?.textContent).toBe('1');
  expect(
    [...root.querySelectorAll('.hljs-literal')].map((el) => el.textContent),
  ).toEqual(expect.arrayContaining(['true', 'null']));
}

function emptyContainersHaveNoToggleOrEllipsis(): void {
  const root = renderJsonTree({ obj: {}, arr: [] });
  expect(root.querySelectorAll('.json-tree-toggle')).toHaveLength(1);
  expect(root.querySelectorAll('.json-tree-ellipsis')).toHaveLength(1);
  expect(root.textContent).toContain('{}');
  expect(root.textContent).toContain('[]');
  const propertyLines = [...root.querySelectorAll('.json-tree-property')].map(
    (el) => el.textContent ?? '',
  );
  expect(propertyLines.some((text) => text.includes('{}'))).toBe(true);
  expect(propertyLines.some((text) => text.includes('[]'))).toBe(true);
  expect(propertyLines.every((text) => !text.includes('/* ... */'))).toBe(true);
}

function togglesLiveInLeftGutterWithoutTextNodes(): void {
  const root = renderJsonTree({ a: { b: 1 } });
  const nested = root.querySelector('.json-tree-property .json-tree-node')!;
  const summary = nested.querySelector(':scope > .json-tree-line')!;
  const gutter = summary.querySelector(':scope > .json-tree-gutter')!;
  const content = summary.querySelector(':scope > .json-tree-content')!;
  const toggle = gutter.querySelector('.json-tree-toggle')!;

  expect(toggle.textContent).toBe('');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(content.querySelector('.json-tree-toggle')).toBeNull();
  expect(content.querySelector('.json-tree-ellipsis')?.textContent).toBe(
    ' /* ... */ ',
  );
}

function topLevelStartsExpanded(): void {
  const root = renderJsonTree({ a: { b: 1 }, c: [2] });
  const top = root.querySelector(':scope > .json-tree-node')!;
  expect(top.classList.contains('json-tree-node--expanded')).toBe(true);
  expect(top.querySelector('.json-tree-toggle')?.getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(
    top.querySelector('.json-tree-children')?.classList.contains(
      'json-tree-children--collapsed',
    ),
  ).toBe(false);

  const nested = [...root.querySelectorAll('.json-tree-property .json-tree-node')];
  expect(nested.length).toBeGreaterThan(0);
  for (const node of nested) {
    expect(node.classList.contains('json-tree-node--expanded')).toBe(false);
    expect(node.querySelector('.json-tree-toggle')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
  }
}

function toggleExpandsAndCollapses(): void {
  const root = renderJsonTree({ nested: { x: 1 } });
  document.body.append(root);
  const node = root.querySelector('.json-tree-property .json-tree-node')!;
  const toggle = node.querySelector<HTMLButtonElement>(
    '.json-tree-gutter .json-tree-toggle',
  )!;
  const children = node.querySelector('.json-tree-children')!;

  expect(children.classList.contains('json-tree-children--collapsed')).toBe(
    true,
  );

  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(node.classList.contains('json-tree-node--expanded')).toBe(true);

  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(node.classList.contains('json-tree-node--expanded')).toBe(false);

  root.remove();
}

function altClickTogglesSubtree(): void {
  const root = renderJsonTree({ a: { b: { c: 1 } } });
  document.body.append(root);
  const outer = root.querySelector('.json-tree-property .json-tree-node')!;
  const inner = outer.querySelector('.json-tree-property .json-tree-node')!;
  const toggle = outer.querySelector<HTMLButtonElement>('.json-tree-toggle')!;

  toggle.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }),
  );
  expect(outer.classList.contains('json-tree-node--expanded')).toBe(true);
  expect(inner.classList.contains('json-tree-node--expanded')).toBe(true);

  toggle.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }),
  );
  expect(outer.classList.contains('json-tree-node--expanded')).toBe(false);
  expect(inner.classList.contains('json-tree-node--expanded')).toBe(false);

  root.remove();
}

function expandAndCollapseAll(): void {
  const root = renderJsonTree({ a: { b: 1 }, c: [2] });
  setJsonTreeExpanded(root, true);
  for (const node of root.querySelectorAll('.json-tree-node')) {
    expect(node.classList.contains('json-tree-node--expanded')).toBe(true);
  }
  setJsonTreeExpanded(root, false);
  for (const node of root.querySelectorAll('.json-tree-node')) {
    expect(node.classList.contains('json-tree-node--expanded')).toBe(false);
  }
}

function parseJsonValueHelper(): void {
  expect(parseJsonValue('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  expect(parseJsonValue('not-json')).toEqual({ ok: false });
}

function pathNode(tree: HTMLElement, segments: readonly string[]): HTMLElement {
  const path = encodeJsonPath(segments);
  for (const node of tree.querySelectorAll('.json-tree-node')) {
    if (node instanceof HTMLElement && node.dataset.jsonPath === path) {
      return node;
    }
  }
  throw new Error(`missing path ${path}`);
}

function preservesExpansionStateAcrossRerender(): void {
  const first = renderJsonTree({
    Parse: [{ x: 1 }],
    Generate: { nested: { y: 2 } },
    Optimize: null,
  });
  setNodeExpanded(pathNode(first, ['Generate']), true);
  setNodeExpanded(pathNode(first, ['Generate', 'nested']), true);

  const state = collectExpansionState(first);
  expect(state.get(encodeJsonPath(['Generate']))).toBe(true);
  expect(state.get(encodeJsonPath(['Generate', 'nested']))).toBe(true);

  const second = renderJsonTree({
    Parse: [{ x: 1 }],
    Generate: { nested: { y: 2 } },
    Optimize: null,
  });
  applyExpansionState(second, state);
  expect(pathNode(second, ['Generate']).classList.contains('json-tree-node--expanded')).toBe(
    true,
  );
  expect(
    pathNode(second, ['Generate', 'nested']).classList.contains('json-tree-node--expanded'),
  ).toBe(true);
}

function ignoresMissingPathsWhenRestoring(): void {
  const first = renderJsonTree({
    Parse: [],
    Generate: { a: 1 },
    Optimize: { b: 2 },
  });
  setNodeExpanded(pathNode(first, ['Optimize']), true);
  const state = collectExpansionState(first);

  const second = renderJsonTree({
    Parse: [],
    Generate: { a: 1 },
    Optimize: null,
  });
  applyExpansionState(second, state);
  const optimizePath = encodeJsonPath(['Optimize']);
  const stillPresent = [...second.querySelectorAll('.json-tree-node')].some(
    (node) =>
      node instanceof HTMLElement && node.dataset.jsonPath === optimizePath,
  );
  expect(stillPresent).toBe(false);
  expect(pathNode(second, []).classList.contains('json-tree-node--expanded')).toBe(true);
}

describe('jsonTreeView', () => {
  it('renders primitives with hljs classes', rendersPrimitivesWithHljsClasses);
  it(
    'omits toggle and ellipsis for empty containers',
    emptyContainersHaveNoToggleOrEllipsis,
  );
  it(
    'places empty toggles in the left gutter',
    togglesLiveInLeftGutterWithoutTextNodes,
  );
  it('expands the top level by default', topLevelStartsExpanded);
  it('toggles expand and collapse', toggleExpandsAndCollapses);
  it('Alt-click toggles the whole subtree', altClickTogglesSubtree);
  it('expands and collapses all nodes', expandAndCollapseAll);
  it(
    'preserves expansion state across rerender',
    preservesExpansionStateAcrossRerender,
  );
  it(
    'ignores missing paths when restoring expansion',
    ignoresMissingPathsWhenRestoring,
  );
  it('parseJsonValue returns ok: false for invalid JSON', parseJsonValueHelper);
});
