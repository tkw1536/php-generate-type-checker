import { parseArgs } from 'node:util';
import {
  DEFAULT_CHECKER_OUTPUT,
  type CheckerOutputMode,
} from '../generator/options.ts';

const EMIT_MODES: ReadonlySet<string> = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

/** Stable CLI flag surface — keep backwards compatible when changing. */
export type CliArgs = {
  readonly help: boolean;
  readonly file: string | undefined;
  readonly types: readonly string[];
  readonly emit: CheckerOutputMode;
  readonly optimize: boolean;
  readonly verbosePhpdoc: boolean;
  readonly emitAliases: boolean;
  readonly resolveAliases: boolean;
  readonly sealArrayShapes: boolean;
  readonly unsafeStringArrayKeys: boolean;
  readonly printType: boolean;
  readonly printTrace: boolean;
  readonly printExamples: boolean;
};

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/** Human-readable help; documents the stable option interface. */
export function formatHelp(binName: string): string {
  return `Usage:
  ${binName} [options] <type>...
  ${binName} [options] --file <path|->

Generate PHPStan runtime type checkers from PHPDoc types.

Input (exactly one):
  <type>...              One type expression (or quoted docblock) per argument
  -f, --file <path>      Read input from a file, or STDIN when path is -

Generate options (defaults match the UI):
  --emit <mode>          function | public_static | protected_static | private_static
                         (default: ${DEFAULT_CHECKER_OUTPUT})
  --optimize             Run the optimizer (default)
  --no-optimize          Skip the optimizer
  --verbose-phpdoc       Multi-line Drupal-style PHPDoc on checkers
  --emit-aliases         Re-emit @phpstan-type aliases in the PHP output
  --resolve-aliases      Inline alias cross-references
  --seal-array-shapes    Reject unknown keys on shapes without ...
  --unsafe-string-array-keys
                         Treat array string keys like PHPStan detect mode (unsound)

Output (mutually exclusive; default is PHP on STDOUT):
  --type                 Print type AST JSON (unstable schema)
  --trace                Print optimizer trace JSON (unstable schema)
  --examples             Print PHPStan example harness PHP (unstable)

Other:
  -h, --help             Show this help
`;
}

/**
 * Parse argv into validated CLI args.
 * @throws {CliUsageError} on bad flags or conflicting input/output modes
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const parsed = runParseArgs(argv);
  // parseArgs typing collapses when an option is named `type`; read as a plain object.
  return buildCliArgs(parsed.values, parsed.positionals);
}

function runParseArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h', default: false },
        file: { type: 'string', short: 'f' },
        emit: { type: 'string', default: DEFAULT_CHECKER_OUTPUT },
        optimize: { type: 'boolean', default: true },
        'verbose-phpdoc': { type: 'boolean', default: false },
        'emit-aliases': { type: 'boolean', default: false },
        'resolve-aliases': { type: 'boolean', default: false },
        'seal-array-shapes': { type: 'boolean', default: false },
        'unsafe-string-array-keys': { type: 'boolean', default: false },
        // Option name `type` breaks parseArgs generics; read via property descriptor below.
        type: { type: 'boolean', default: false },
        trace: { type: 'boolean', default: false },
        examples: { type: 'boolean', default: false },
      },
      allowNegative: true,
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliUsageError(message);
  }
}

function buildCliArgs(values: object, positionals: readonly string[]): CliArgs {
  const emitRaw = readString(values, 'emit') ?? DEFAULT_CHECKER_OUTPUT;
  const emit = parseEmitMode(emitRaw);
  if (emit === undefined) {
    throw new CliUsageError(
      `Invalid --emit ${JSON.stringify(emitRaw)}; expected function | public_static | protected_static | private_static`,
    );
  }

  const printType = readBool(values, 'type');
  const printTrace = readBool(values, 'trace');
  const printExamples = readBool(values, 'examples');
  const exclusive =
    Number(printType) + Number(printTrace) + Number(printExamples);
  if (exclusive > 1) {
    throw new CliUsageError('Use only one of --type, --trace, or --examples');
  }

  const file = readString(values, 'file');
  if (file !== undefined && positionals.length > 0) {
    throw new CliUsageError('Pass either type arguments or --file, not both');
  }

  return {
    help: readBool(values, 'help'),
    file,
    types: positionals,
    emit,
    // Default on; --no-optimize clears the boolean under allowNegative.
    optimize: Object.getOwnPropertyDescriptor(values, 'optimize')?.value !== false,
    verbosePhpdoc: readBool(values, 'verbose-phpdoc'),
    emitAliases: readBool(values, 'emit-aliases'),
    resolveAliases: readBool(values, 'resolve-aliases'),
    sealArrayShapes: readBool(values, 'seal-array-shapes'),
    unsafeStringArrayKeys: readBool(values, 'unsafe-string-array-keys'),
    printType,
    printTrace,
    printExamples,
  };
}

/** Read a boolean flag from parseArgs values without relying on broken `type` generics. */
function readBool(values: object, key: string): boolean {
  return Object.getOwnPropertyDescriptor(values, key)?.value === true;
}

/** Read an optional string option from parseArgs values. */
function readString(values: object, key: string): string | undefined {
  const value: unknown = Object.getOwnPropertyDescriptor(values, key)?.value;
  return typeof value === 'string' ? value : undefined;
}

function parseEmitMode(value: string): CheckerOutputMode | undefined {
  return isCheckerOutputMode(value) ? value : undefined;
}

function isCheckerOutputMode(value: string): value is CheckerOutputMode {
  return EMIT_MODES.has(value);
}
