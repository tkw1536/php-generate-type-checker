import { describe, expect, it } from 'vitest';
import {
  arrayAccessRef,
  parameterRef,
  propertyAccessRef,
} from '../ir/index.ts';
import { renderValueRef } from './refs.ts';

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

describe('renderValueRef', () => {
  it('chains array access without parentheses', chainsArrayAccessWithoutParens);
  it(
    'chains property access without parentheses',
    chainsPropertyAccessWithoutParens,
  );
  it('chains mixed [] / -> without parentheses', chainsMixedAccessWithoutParens);
});
