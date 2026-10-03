import { describe, expect, it } from 'vitest';
import {
  arrayAccessRef,
  parameterRef,
  propertyAccessRef,
} from '../ir/index.ts';
import type { CheckerProgram } from '../ir/types.ts';
import { assignTempNames, renderTempVar, renderValueRef } from './refs.ts';

const $v = parameterRef();

function chainsArrayAccessWithoutParens(): void {
  expect(
    renderValueRef(arrayAccessRef(arrayAccessRef($v, 'outer'), 'inner')),
  ).toBe("$value['outer']['inner']");
}

function chainsPropertyAccessWithoutParens(): void {
  expect(
    renderValueRef(propertyAccessRef(propertyAccessRef($v, 'outer'), 'inner')),
  ).toBe('$value->outer->inner');
}

function chainsMixedAccessWithoutParens(): void {
  expect(
    renderValueRef(propertyAccessRef(arrayAccessRef($v, 'outer'), 'inner')),
  ).toBe("$value['outer']->inner");
  expect(
    renderValueRef(arrayAccessRef(propertyAccessRef($v, 'outer'), 'inner')),
  ).toBe("$value->outer['inner']");
}

function unsuffixedWhenSoleKeyAndItem(): void {
  const program: CheckerProgram = {
    body: [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: 1,
        valueVar: 0,
        body: [],
      },
    ],
  };
  const names = assignTempNames(program);
  expect(names.get(1)).toBe('$key');
  expect(names.get(0)).toBe('$item');
}

function numbersWhenMultipleItems(): void {
  const program: CheckerProgram = {
    body: [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 0,
        body: [
          {
            kind: 'foreach',
            iterable: { kind: 'variable', id: 0 },
            keyVar: null,
            valueVar: 1,
            body: [],
          },
        ],
      },
    ],
  };
  const names = assignTempNames(program);
  expect(names.get(0)).toBe('$item1');
  expect(names.get(1)).toBe('$item2');
}

function fallsBackWhenUnassigned(): void {
  expect(renderTempVar(3)).toBe('$tmp3');
}

describe('renderValueRef', () => {
  it('chains array access without parentheses', chainsArrayAccessWithoutParens);
  it(
    'chains property access without parentheses',
    chainsPropertyAccessWithoutParens,
  );
  it('chains mixed [] / -> without parentheses', chainsMixedAccessWithoutParens);
});

describe('assignTempNames', () => {
  it('uses unsuffixed names for a sole key/item', unsuffixedWhenSoleKeyAndItem);
  it('numbers items when nested', numbersWhenMultipleItems);
  it('falls back to $tmpN when unassigned', fallsBackWhenUnassigned);
});
