import { describe, expect, it } from 'vitest';
import { hasPhpstanTypeAliases, parseCheckerInput } from './parseInput.ts';

function assignsIsStyleNamesForPlainTypes(): void {
  const entries = parseCheckerInput('int string');
  expect(entries.map((e) => e.functionName)).toEqual(['isInt', 'isString']);
  expect(entries.every((e) => e.aliasName === null)).toBe(true);
  expect(hasPhpstanTypeAliases(entries)).toBe(false);
}

function assignsAliasNamesForPhpstanType(): void {
  const entries = parseCheckerInput('/** @phpstan-type Foo int */');
  expect(entries).toHaveLength(1);
  expect(entries[0].aliasName).toBe('Foo');
  expect(entries[0].functionName).toBe('isFoo');
  expect(entries[0].docType).toBe('Foo');
  expect(hasPhpstanTypeAliases(entries)).toBe(true);
}

function dedupesIdenticalPlainTypes(): void {
  const entries = parseCheckerInput('int int');
  expect(entries.map((e) => e.functionName)).toEqual(['isInt', 'isInt']);
}

function disambiguatesCollidingProposedNames(): void {
  const entries = parseCheckerInput(`/**
 * @phpstan-type Int int
 */
int`);
  expect(entries[0].functionName).toBe('isInt');
  expect(entries[1].functionName).toBe('isInt_2');
}

function rethrowsDocblockTypeParseErrorsAtAbsolutePositions(): void {
  const source = `array<int>
array<string|int>
/** @phpstan-type Example int| */`;
  const typeBody = 'int|';
  const expectedPos = source.indexOf(typeBody) + typeBody.length;
  expect(() => parseCheckerInput(source)).toThrow(
    expect.objectContaining({
      name: 'ParseError',
      expressionIndex: 2,
      pos: expectedPos,
    }),
  );
}

describe('parseCheckerInput', () => {
  it('assigns is-style names for plain types', assignsIsStyleNamesForPlainTypes);
  it('assigns alias names for @phpstan-type', assignsAliasNamesForPhpstanType);
  it('dedupes identical plain types to one function name', dedupesIdenticalPlainTypes);
  it(
    'disambiguates colliding proposed names with a counter',
    disambiguatesCollidingProposedNames,
  );
  it(
    'rethrows docblock type parse errors at absolute input positions',
    rethrowsDocblockTypeParseErrorsAtAbsolutePositions,
  );
});
