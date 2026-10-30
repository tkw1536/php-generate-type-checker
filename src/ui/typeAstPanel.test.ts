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

const TWO_ALIASES = `/**
 * @phpstan-type UserId positive-int
 */
/**
 * @phpstan-type Slug non-empty-string
 */`;

describe('TypeAstPanel', () => {
  it('groups types with Source and AST leaves', () => {
    const body = document.createElement('div');
    const panel = new TypeAstPanel(body);
    const entries = parseCheckerInput(TWO_ALIASES);
    panel.setEntries(entries);

    expect(
      [...body.querySelectorAll('.type-ast-group')].map((el) => el.textContent),
    ).toEqual(['UserId', 'Slug']);
    const items = [
      ...body.querySelectorAll<HTMLButtonElement>('.type-ast-item'),
    ];
    expect(items.map((el) => el.textContent)).toEqual([
      'Source',
      'AST',
      'Examples',
      'Source',
      'AST',
      'Examples',
    ]);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    expect(panel.rawText).toBe(formatTypeAstSourceJson(entries[0]));
    expect(body.querySelector('.type-ast-source')).not.toBeNull();
    expect(body.querySelector('#type-output .json-tree')).toBeNull();
  });

  it('shows highlighted Examples with Copy, then switches groups', () => {
    const body = document.createElement('div');
    const panel = new TypeAstPanel(body);
    const entries = parseCheckerInput(TWO_ALIASES);
    panel.setEntries(entries);

    body.querySelectorAll<HTMLButtonElement>('.type-ast-item')[1].click();
    expect(panel.rawText).toBe(formatTypeAstAstJson(entries[0]));
    expect(body.querySelector('#type-output .json-tree')).not.toBeNull();

    body.querySelectorAll<HTMLButtonElement>('.type-ast-item')[2].click();
    expect(body.querySelector('.type-ast-examples')).not.toBeNull();
    expect(panel.rawText.length).toBeGreaterThan(0);
    expect(body.querySelector('.type-ast-examples-expr.hljs')).not.toBeNull();
    expect(
      body.querySelectorAll('.type-ast-examples-copy').length,
    ).toBeGreaterThan(0);

    body.querySelectorAll<HTMLButtonElement>('.type-ast-item')[3].click();
    expect(panel.rawText).toBe(formatTypeAstSourceJson(entries[1]));
    expect(panel.rawText).toContain('Slug');
  });

  it('omits Examples when empty and falls back from Examples to Source', () => {
    const body = document.createElement('div');
    const panel = new TypeAstPanel(body);
    panel.setEntries(parseCheckerInput('int'));
    body.querySelectorAll<HTMLButtonElement>('.type-ast-item')[2].click();
    expect(body.querySelector('.type-ast-examples')).not.toBeNull();

    panel.setEntries(parseCheckerInput('never'));
    const items = [
      ...body.querySelectorAll<HTMLButtonElement>('.type-ast-item'),
    ];
    expect(items.map((el) => el.textContent)).toEqual(['Source', 'AST']);
    expect(panel.rawText).toBe(
      formatTypeAstSourceJson(parseCheckerInput('never')[0]),
    );
    expect(body.querySelector('.type-ast-examples')).toBeNull();
  });
});
