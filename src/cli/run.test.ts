import { describe, expect, it } from 'vitest';
import { generateChecker } from '../generator/index.ts';
import { formatTypeAstJson } from '../generator/typeAstJson.ts';
import { parseCheckerInput } from '../parser/parseInput.ts';
import { parseCliArgs } from './args.ts';
import { runCli } from './run.ts';

describe('runCli', () => {
  it('prints PHP matching generateChecker for the same options', () => {
    const source = 'array{foo: int}';
    const args = parseCliArgs([source]);
    expect(runCli(source, args)).toBe(generateChecker(source));
  });

  it('prints the same type AST JSON as formatTypeAstJson', () => {
    const source = 'int|string';
    const args = parseCliArgs(['--type', source]);
    const entries = parseCheckerInput(source);
    expect(runCli(source, args)).toBe(formatTypeAstJson(entries));
  });

  it('prints an empty trace JSON array when optimize is off', () => {
    const args = parseCliArgs(['--no-optimize', '--trace', 'int']);
    expect(runCli('int', args)).toBe('[]');
  });

  it('prints a non-empty trace JSON array when optimize is on', () => {
    const args = parseCliArgs(['--trace', 'int']);
    const json = runCli('int', args);
    expect(json.startsWith('[')).toBe(true);
    expect(json.length).toBeGreaterThan(2);
  });

  it('prints an examples harness for --examples', () => {
    const args = parseCliArgs(['--examples', 'int']);
    const out = runCli('int', args);
    expect(out).toContain(
      "function example(mixed $value): bool { die('example'); }",
    );
    expect(out).toContain('\\PHPStan\\dumpType(example(0));');
  });

  it('honors --resolve-aliases for --type output', () => {
    const source = `/**
 * @phpstan-type A int
 * @phpstan-type B A
 */`;
    const withResolve = parseCliArgs(['--type', '--resolve-aliases']);
    const without = parseCliArgs(['--type']);
    expect(runCli(source, withResolve)).not.toBe(runCli(source, without));
  });
});
