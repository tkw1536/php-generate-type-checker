import { describe, expect, it } from 'vitest';
import { parsePhpstanTypesFromDocblock } from '../parser/index.ts';
import { buildManyNamed, optimize, renderChecker } from './pipeline.ts';

function buildManyNamedDelegatesToEntryCheckers(): void {
  const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName } = buildManyNamed(
    defs.map((d) => ({
      name: d.name,
      type: d.ast,
      typeString: d.typeString,
    })),
  );
  const php = renderChecker(optimize(ir), {
    typeString: 'docblock',
    typesByName,
    docStringsByName,
    output: 'function',
  });
  expect(php).toContain('isPostSummary(');
}

function buildManyNamedNamesFromAliases(): void {
  const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName } = buildManyNamed(
    defs.map((d) => ({
      name: d.name,
      type: d.ast,
      typeString: d.typeString,
    })),
  );
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
  const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
  const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
    buildManyNamed(
      defs.map((d) => ({
        name: d.name,
        type: d.ast,
        typeString: d.typeString,
      })),
    );
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
  const defs = parsePhpstanTypesFromDocblock('/** @phpstan-type Foo int */');
  const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
    buildManyNamed(
      defs.map((d) => ({
        name: d.name,
        type: d.ast,
        typeString: d.typeString,
      })),
    );
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

function buildManyNamedUsesSequentialCheckNames(): void {
  const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type Foo int
 * @phpstan-type Bar string
 */`);
  const { ir } = buildManyNamed(
    defs.map((d) => ({ name: d.name, type: d.ast })),
    { nameFunctionsByType: false },
  );
  expect(ir.entries).toEqual(['check', 'check_1']);
}

describe('pipeline buildManyNamed', () => {
  it(
    'buildManyNamed delegates to entry checkers for alias cross-references',
    buildManyNamedDelegatesToEntryCheckers,
  );
  it(
    'buildManyNamed names entries from @phpstan-type aliases',
    buildManyNamedNamesFromAliases,
  );
  it(
    'prepends @phpstan-type aliases when emitPhpstanTypeAliases is true',
    prependsAliasesWhenEmitTrue,
  );
  it(
    'does not prepend aliases when emitPhpstanTypeAliases is false',
    doesNotPrependAliasesWhenEmitFalse,
  );
  it(
    'buildManyNamed uses sequential check names when nameFunctionsByType is false',
    buildManyNamedUsesSequentialCheckNames,
  );
});
