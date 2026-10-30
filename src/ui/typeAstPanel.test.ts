/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseCheckerInput } from '../parser/parseInput.ts';
import {
  formatTypeAstAstJson,
  formatTypeAstSourceJson,
} from '../generator/typeAstJson.ts';
import { TypeAstPanel, typeListLabel } from './typeAstPanel.ts';

describe('typeListLabel', () => {
  it('prefers alias name over type string', () => {
    const [entry] = parseCheckerInput(
      '/** @phpstan-type UserId int */',
    );
    expect(typeListLabel(entry)).toBe('UserId');
  });

  it('uses the type string for plain expressions', () => {
    const [entry] = parseCheckerInput('array<string, int>');
    expect(typeListLabel(entry)).toBe('array<string, int>');
  });
});

describe('TypeAstPanel', () => {
  it('groups types with Source and AST leaves', () => {
    const body = document.createElement('div');
    const panel = new TypeAstPanel(body);
    const entries = parseCheckerInput(`/**
 * @phpstan-type UserId positive-int
 */
/**
 * @phpstan-type Slug non-empty-string
 */`);
    panel.setEntries(entries);

    const groups = [...body.querySelectorAll('.type-ast-group')];
    expect(groups.map((el) => el.textContent)).toEqual(['UserId', 'Slug']);

    const items = [
      ...body.querySelectorAll<HTMLButtonElement>('.type-ast-item'),
    ];
    expect(items.map((el) => el.textContent)).toEqual([
      'Source',
      'AST',
      'Source',
      'AST',
    ]);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    expect(panel.rawText).toBe(formatTypeAstSourceJson(entries[0]));
    expect(body.querySelector('.type-ast-source')).not.toBeNull();
    expect(body.querySelector('#type-output .json-tree')).toBeNull();

    items[1].click();
    expect(panel.rawText).toBe(formatTypeAstAstJson(entries[0]));
    expect(body.querySelector('#type-output .json-tree')).not.toBeNull();

    const afterAst = [
      ...body.querySelectorAll<HTMLButtonElement>('.type-ast-item'),
    ];
    afterAst[2].click();
    expect(panel.rawText).toBe(formatTypeAstSourceJson(entries[1]));
    expect(panel.rawText).toContain('Slug');
  });
});
