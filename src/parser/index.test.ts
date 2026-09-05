import { describe, expect, it } from 'vitest';
import type { TypeNode } from './ast.ts';
import { formatType } from './format.ts';
import errorCases from './testdata/parser.errors.json';
import successCases from './testdata/parser.success.json';
import { parseType, parseTypes } from "./index.ts";

type ParseSuccessCase = { readonly source: string; readonly ast: TypeNode };
type ParseErrorCase = {
  readonly input: string;
  readonly messageContains?: string;
};

function isParseSuccessCase(value: unknown): value is ParseSuccessCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    'ast' in value &&
    typeof value.source === 'string'
  );
}

function isParseErrorCase(value: unknown): value is ParseErrorCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    typeof value.input === 'string' &&
    (!('messageContains' in value) ||
      typeof value.messageContains === 'string' ||
      value.messageContains === undefined)
  );
}

function caseLabel(input: string): string {
  if (input === '') {
    return '(empty)';
  }
  return input;
}

function readSuccessCases(data: unknown): ParseSuccessCase[] {
  if (!Array.isArray(data) || !data.every((item) => isParseSuccessCase(item))) {
    throw new Error('invalid parser success fixture JSON');
  }
  return data;
}

function readErrorCases(data: unknown): ParseErrorCase[] {
  if (!Array.isArray(data) || !data.every((item) => isParseErrorCase(item))) {
    throw new Error('invalid parser error fixture JSON');
  }
  return data;
}

const parsedSuccessCases = readSuccessCases(successCases);
const parsedErrorCases = readErrorCases(errorCases);

describe('parseTypes', () => {
  it('splits array<string>array<int> into two segments', () => {
    const result = parseTypes('array<string>array<int>');
    expect(result.segments).toHaveLength(2);
    expect(result.source.slice(result.segments[0].start, result.segments[0].end)).toBe(
      'array<string>',
    );
    expect(result.source.slice(result.segments[1].start, result.segments[1].end)).toBe(
      'array<int>',
    );
    expect(result.segments[0].ast).toEqual(parseType('array<string>'));
    expect(result.segments[1].ast).toEqual(parseType('array<int>'));
  });

  it('splits string int into two segments', () => {
    const result = parseTypes('string int');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].ast).toEqual(parseType('string'));
    expect(result.segments[1].ast).toEqual(parseType('int'));
  });

  it('keeps stringint as one class segment', () => {
    const result = parseTypes('stringint');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].ast).toEqual(parseType('stringint'));
  });

  it('keeps union as one segment', () => {
    const result = parseTypes('int|string');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].ast).toEqual(parseType('int|string'));
  });
});

const NULLABLE_CASES = [
  ['?int', 'int|null'],
  ['?int|string', 'int|null|string'],
  ['?(int|string)', '(int|string)|null'],
  ['?int[]', '(int[])|null'],
  ['array{foo: ?int}', 'array{foo: int|null}'],
  ['array{?int}', 'array{int|null}'],
  ['array{bar?: ?string}', 'array{bar?: string|null}'],
  ['list{?int}', 'list{int|null}'],
] as const;

function optionalShapeFieldsStillParse(): void {
  expect(parseType('array{bar?: string}')).toEqual(
    parseType('array{bar?: string}'),
  );
}

const ERROR_CASES_WITH_MESSAGE = parsedErrorCases.filter(
  (c): c is ParseErrorCase & { readonly messageContains: string } =>
    typeof c.messageContains === 'string',
);
const ERROR_CASES_WITHOUT_MESSAGE = parsedErrorCases.filter(
  (c) => c.messageContains === undefined,
);

const ERROR_CASES_WITH_MESSAGE_LABELS = ERROR_CASES_WITH_MESSAGE.map(
  ({ input, messageContains }) => ({
    label: caseLabel(input),
    input,
    messageContains,
  }),
);

const ERROR_CASES_WITHOUT_MESSAGE_LABELS = ERROR_CASES_WITHOUT_MESSAGE.map(
  ({ input }) => ({
    label: caseLabel(input),
    input,
  }),
);

describe('parseType nullable ? prefix', () => {
  it.each(NULLABLE_CASES)('%s', (source, expectedSource) => {
    expect(parseType(source)).toEqual(parseType(expectedSource));
  });

  it(
    'array{bar?: string} still parses optional shape fields',
    optionalShapeFieldsStillParse,
  );
});

describe('parseType case-insensitivity', () => {
  it.each(['TRue', 'TRUE', 'true'])('%s equals true keyword', (source) => {
    expect(parseType(source)).toEqual({ kind: 'keyword', keyword: 'true' });
    expect(formatType(parseType(source))).toBe('TRUE');
  });

  it.each(['STRING', 'string', 'String'])('%s equals string keyword', (source) => {
    expect(parseType(source)).toEqual({ kind: 'keyword', keyword: 'string' });
    expect(formatType(parseType(source))).toBe('string');
  });

  it('folds non-FALSY-string to non-falsy-string', foldsNonFalsyStringCase);
  it('folds ARRAY{foo: int} shape keyword', foldsArrayShapeKeywordCase);
  it('folds INT<MIN, MAX> range endpoints', foldsIntRangeEndpointsCase);
  it('folds CALLABLE(): void', foldsCallableKeywordCase);
  it(
    'folds class-STRING generic name and keeps class spelling',
    foldsClassStringGenericCase,
  );
  it('keeps class name spelling', keepsClassNameSpelling);
  it('folds OPEN-RESOURCE pseudo-named type', foldsOpenResourcePseudoCase);
});

function foldsNonFalsyStringCase(): void {
  expect(parseType('non-FALSY-string')).toEqual({
    kind: 'keyword',
    keyword: 'non-falsy-string',
  });
}

function foldsArrayShapeKeywordCase(): void {
  expect(parseType('ARRAY{foo: int}')).toEqual(parseType('array{foo: int}'));
}

function foldsIntRangeEndpointsCase(): void {
  expect(parseType('INT<MIN, MAX>')).toEqual(parseType('int<min, max>'));
}

function foldsCallableKeywordCase(): void {
  expect(parseType('CALLABLE(): void')).toEqual(parseType('callable(): void'));
}

function foldsClassStringGenericCase(): void {
  expect(parseType('class-STRING<SomeClass>')).toEqual(
    parseType('class-string<SomeClass>'),
  );
  expect(parseType('class-STRING<SomeClass>')).toEqual({
    kind: 'generic',
    name: 'class-string',
    typeArgs: [{ kind: 'named', name: 'SomeClass' }],
  });
}

function keepsClassNameSpelling(): void {
  expect(parseType('SomeClass')).toEqual({ kind: 'named', name: 'SomeClass' });
  expect(parseType('\\Foo\\Bar')).toEqual({ kind: 'named', name: '\\Foo\\Bar' });
}

function foldsOpenResourcePseudoCase(): void {
  expect(parseType('OPEN-RESOURCE')).toEqual({
    kind: 'named',
    name: 'open-resource',
  });
}
describe('parseType success', () => {
  it.each(parsedSuccessCases)('$source', ({ source, ast }) => {
    expect(parseType(source)).toEqual(ast);
  });
});

describe('parseType errors', () => {
  it.each(ERROR_CASES_WITH_MESSAGE_LABELS)(
    '$label',
    ({
      input,
      messageContains,
    }: {
      readonly label: string;
      readonly input: string;
      readonly messageContains: string;
    }) => {
      expect(() => parseType(input)).toThrow(new RegExp(messageContains, 'u'));
    },
  );

  it.each(ERROR_CASES_WITHOUT_MESSAGE_LABELS)(
    '$label',
    ({
      input,
    }: {
      readonly label: string;
      readonly input: string;
    }) => {
      expect(() => parseType(input)).toThrow(Error);
    },
  );
});
