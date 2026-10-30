import { describe, expect, it } from 'vitest';
import { CliUsageError, parseCliArgs } from './args.ts';

describe('parseCliArgs', () => {
  it('defaults match the UI (optimize on, function emit)', () => {
    const args = parseCliArgs(['int']);
    expect(args.optimize).toBe(true);
    expect(args.emit).toBe('function');
    expect(args.verbosePhpdoc).toBe(false);
    expect(args.emitAliases).toBe(false);
    expect(args.resolveAliases).toBe(false);
    expect(args.sealArrayShapes).toBe(false);
    expect(args.unsafeStringArrayKeys).toBe(false);
    expect(args.printType).toBe(false);
    expect(args.printTrace).toBe(false);
    expect(args.types).toEqual(['int']);
  });

  it('accepts --no-optimize and emit modes', () => {
    const args = parseCliArgs([
      '--no-optimize',
      '--emit',
      'public_static',
      '--verbose-phpdoc',
      'int',
    ]);
    expect(args.optimize).toBe(false);
    expect(args.emit).toBe('public_static');
    expect(args.verbosePhpdoc).toBe(true);
  });

  it('rejects --type together with --trace', () => {
    expect(() => parseCliArgs(['--type', '--trace', 'int'])).toThrow(
      CliUsageError,
    );
  });

  it('rejects mixing --file with type arguments', () => {
    expect(() => parseCliArgs(['--file', 'x.IN', 'int'])).toThrow(CliUsageError);
  });

  it('rejects unknown --emit values', () => {
    expect(() => parseCliArgs(['--emit', 'nope', 'int'])).toThrow(CliUsageError);
  });
});
