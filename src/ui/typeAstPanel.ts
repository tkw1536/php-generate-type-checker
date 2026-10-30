import {
  formatTypeAstAstJson,
  formatTypeAstSourceJson,
} from '../generator/typeAstJson.ts';
import type { ParsedCheckerEntry } from '../parser/parseInput.ts';
import { describeError } from '../describeError.ts';
import { renderErrorHtml } from './errorDisplay.ts';
import {
  applyExpansionState,
  collectExpansionState,
  setJsonTreeExpanded,
} from './jsonTreeExpand.ts';
import { renderJsonTree } from './jsonTreeView.ts';

/** Selectable leaf under a parsed type group. */
export type TypeAstLeaf = 'source' | 'ast';

export type TypeAstSelection = {
  readonly entryIndex: number;
  readonly leaf: TypeAstLeaf;
};

/** List label: alias name when present, otherwise the source type string. */
export function typeListLabel(entry: ParsedCheckerEntry): string {
  return entry.aliasName ?? entry.typeString;
}

function leafLabel(leaf: TypeAstLeaf): string {
  switch (leaf) {
    case 'source':
      return 'Source';
    case 'ast':
      return 'AST';
    default:
      throw new Error('never reached');
  }
}

function selectionEquals(a: TypeAstSelection, b: TypeAstSelection): boolean {
  return a.entryIndex === b.entryIndex && a.leaf === b.leaf;
}

function appendCollapseSpacer(row: HTMLElement): void {
  const spacer = document.createElement('span');
  spacer.className = 'type-ast-collapse-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  row.append(spacer);
}

function appendLeafButton(
  row: HTMLElement,
  leaf: TypeAstLeaf,
  selected: TypeAstSelection,
  entryIndex: number,
  onSelect: (selection: TypeAstSelection) => void,
): void {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'type-ast-item type-ast-item--nested';
  item.setAttribute('role', 'option');
  const selection: TypeAstSelection = { entryIndex, leaf };
  const active = selectionEquals(selection, selected);
  item.classList.toggle('active', active);
  item.setAttribute('aria-selected', active ? 'true' : 'false');
  item.tabIndex = active ? 0 : -1;
  item.textContent = leafLabel(leaf);
  item.addEventListener('click', () => {
    onSelect(selection);
  });
  row.append(item);
}

function renderTypeList(
  entries: readonly ParsedCheckerEntry[],
  selected: TypeAstSelection,
  onSelect: (selection: TypeAstSelection) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'type-ast-list';
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', 'Parsed types');

  for (const [entryIndex, entry] of entries.entries()) {
    const heading = document.createElement('div');
    heading.className = 'type-ast-group';
    heading.textContent = typeListLabel(entry);
    root.append(heading);

    for (const leaf of ['source', 'ast'] as const) {
      const row = document.createElement('div');
      row.className = 'type-ast-item-row type-ast-item-row--nested';
      appendCollapseSpacer(row);
      appendLeafButton(row, leaf, selected, entryIndex, onSelect);
      root.append(row);
    }
  }
  return root;
}

function renderDetailHeader(
  entry: ParsedCheckerEntry,
  leaf: TypeAstLeaf,
): HTMLElement {
  const wrap = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'type-ast-meta';
  meta.textContent = typeListLabel(entry);

  const titleRow = document.createElement('div');
  titleRow.className = 'type-ast-title';
  const title = document.createElement('span');
  title.className = 'type-ast-title-text';
  title.textContent = leafLabel(leaf);
  titleRow.append(title);

  wrap.append(meta, titleRow);
  return wrap;
}

function appendSourceField(
  parent: HTMLElement,
  label: string,
  value: string,
): void {
  const line = document.createElement('div');
  line.className = 'type-ast-source-line';
  const labelEl = document.createElement('span');
  labelEl.className = 'type-ast-source-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('code');
  valueEl.className = 'type-ast-source-value';
  valueEl.textContent = value;
  line.append(labelEl, valueEl);
  parent.append(line);
}

function renderSourceDetail(entry: ParsedCheckerEntry): HTMLElement {
  const body = document.createElement('div');
  body.className = 'type-ast-source';
  body.id = 'type-output';
  body.setAttribute('aria-label', 'Parsed type source');
  appendSourceField(
    body,
    'Alias',
    entry.aliasName ?? '(none)',
  );
  appendSourceField(body, 'Type string', entry.typeString);
  return body;
}

function renderAstDetail(
  entry: ParsedCheckerEntry,
  previousTree: HTMLElement | null,
): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'output-pre type-ast-json';
  pre.id = 'type-output';
  pre.setAttribute('aria-label', 'Parsed type AST JSON');
  const tree = renderJsonTree(entry.ast);
  if (previousTree !== null) {
    applyExpansionState(tree, collectExpansionState(previousTree));
  }
  pre.append(tree);
  return pre;
}

/** Split list + detail for parsed checker entries (Type tab). */
export class TypeAstPanel {
  readonly tabId = 'type' as const;
  readonly bodyEl: HTMLElement;
  rawText = '';
  private entries: readonly ParsedCheckerEntry[] = [];
  private selected: TypeAstSelection = { entryIndex: 0, leaf: 'source' };

  constructor(bodyEl: HTMLElement) {
    this.bodyEl = bodyEl;
  }

  setEntries(entries: readonly ParsedCheckerEntry[]): void {
    this.bodyEl.classList.remove('panel-body--error');
    this.entries = entries;
    if (entries.length === 0) {
      this.rawText = '';
      this.selected = { entryIndex: 0, leaf: 'source' };
      this.bodyEl.innerHTML =
        '<p class="type-ast-empty">No parsed types for this input.</p>';
      return;
    }
    if (this.selected.entryIndex >= entries.length) {
      this.selected = { entryIndex: 0, leaf: 'source' };
    }
    this.render();
  }

  setError(err: unknown, sourceText: string): void {
    const described = describeError(err);
    this.rawText = described.message;
    this.entries = [];
    this.selected = { entryIndex: 0, leaf: 'source' };
    this.bodyEl.classList.add('panel-body--error');
    this.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
  }

  /** Re-render while keeping selection and AST expand state. */
  refresh(): void {
    if (
      this.entries.length === 0 ||
      this.bodyEl.classList.contains('panel-body--error')
    ) {
      return;
    }
    this.render({ preserveExpansion: true });
  }

  setJsonTreeExpanded(expanded: boolean): void {
    const tree = this.bodyEl.querySelector<HTMLElement>('#type-output .json-tree');
    if (tree !== null) {
      setJsonTreeExpanded(tree, expanded);
    }
  }

  private render(options?: { readonly preserveExpansion?: boolean }): void {
    const entry = this.entries[this.selected.entryIndex];
    if (entry === undefined) {
      return;
    }
    this.rawText =
      this.selected.leaf === 'source'
        ? formatTypeAstSourceJson(entry)
        : formatTypeAstAstJson(entry);
    const previousTree =
      options?.preserveExpansion === true && this.selected.leaf === 'ast'
        ? this.bodyEl.querySelector<HTMLElement>('#type-output .json-tree')
        : null;
    const root = document.createElement('div');
    root.className = 'type-ast';
    const detail = document.createElement('div');
    detail.className = 'type-ast-detail';
    detail.append(renderDetailHeader(entry, this.selected.leaf));
    if (this.selected.leaf === 'source') {
      detail.append(renderSourceDetail(entry));
    } else {
      detail.append(renderAstDetail(entry, previousTree));
    }
    root.append(
      renderTypeList(this.entries, this.selected, (selection) => {
        this.selected = selection;
        this.render();
      }),
      detail,
    );
    this.bodyEl.replaceChildren(root);
  }
}
