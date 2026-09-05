import { describe, expect, it } from 'vitest';
import { parseCheckerInput } from '../parser/parseInput.ts';
import { buildEntries, optimize, renderChecker } from './pipeline.ts';

function buildEntriesDelegatesToEntryCheckers(): void {
  const entries = parseCheckerInput(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName } = buildEntries(entries);
  const php = renderChecker(optimize(ir), {
    typeString: 'docblock',
    typesByName,
    docStringsByName,
    output: 'function',
  });
  expect(php).toContain('isPostSummary(');
}

function buildEntriesNamesFromAliases(): void {
  const entries = parseCheckerInput(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName } = buildEntries(entries);
  expect(ir.entries).toEqual(['isPostSummary', 'isPostListResponse']);
  const php = renderChecker(ir, {
    typeString: 'docblock',
    typesByName,
    docStringsByName,
    output: 'function',
  });
  expect(php).toContain('function isPostSummary(');
  expect(php).toContain('function isPostListResponse(');
  expect(php).toContain('@phpstan-assert-if-true PostSummary $value');
  expect(php).toContain('@phpstan-assert-if-true PostListResponse $value');
}

function prependsAliasesWhenEmitTrue(): void {
  const entries = parseCheckerInput(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
    buildEntries(entries);
  const php = renderChecker(ir, {
    typeString: 'docblock',
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
    emitPhpstanTypeAliases: true,
    output: 'function',
  });
  expect(php.startsWith('/**\n * @phpstan-type PostSummary')).toBe(true);
  expect(php).toContain(
    '@phpstan-type PostListResponse array{posts: list<PostSummary>}',
  );
  expect(php).toContain('function isPostSummary(');
  expect(php.indexOf('@phpstan-type PostSummary')).toBeLessThan(
    php.indexOf('function isPostSummary('),
  );
}

function doesNotPrependAliasesWhenEmitFalse(): void {
  const entries = parseCheckerInput('/** @phpstan-type Foo int */');
  const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
    buildEntries(entries);
  const php = renderChecker(ir, {
    typeString: 'docblock',
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
    emitPhpstanTypeAliases: false,
    output: 'function',
  });
  expect(php.startsWith('/** @phpstan-assert-if-true Foo $value */')).toBe(
    true,
  );
}

describe('pipeline buildEntries', () => {
  it(
    'buildEntries delegates to entry checkers for alias cross-references',
    buildEntriesDelegatesToEntryCheckers,
  );
  it(
    'buildEntries names entries from @phpstan-type aliases',
    buildEntriesNamesFromAliases,
  );
  it(
    'prepends @phpstan-type aliases when emitPhpstanTypeAliases is true',
    prependsAliasesWhenEmitTrue,
  );
  it(
    'does not prepend aliases when emitPhpstanTypeAliases is false',
    doesNotPrependAliasesWhenEmitFalse,
  );
});
