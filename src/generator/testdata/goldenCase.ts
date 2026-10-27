import { createHash } from 'node:crypto';
import type { CheckerOutputMode } from '../options.ts';

export interface GoldenCaseMeta {
  readonly input: string;
  readonly output: CheckerOutputMode;
  readonly emitPhpstanTypeAliases?: true;
  readonly verbosePhpdoc?: true;
  readonly sealArrayShapes?: true;
}

export interface GoldenCase {
  readonly meta: GoldenCaseMeta;
  readonly namespaceId: string;
  readonly expected: string;
  /** 1-based inclusive line of the begin marker. */
  readonly startLine: number;
  /** 1-based inclusive line of the end marker. */
  readonly endLine: number;
}

const OUTPUT_MODES: readonly CheckerOutputMode[] = [
  'function',
  'public_static',
  'protected_static',
  'private_static',
];

export function isCheckerOutputMode(
  value: unknown,
): value is CheckerOutputMode {
  return (
    typeof value === 'string' &&
    (OUTPUT_MODES as readonly string[]).includes(value)
  );
}

/** Stable case-identity key; never includes the expected PHP body. */
export function canonicalCaseKey(meta: GoldenCaseMeta): string {
  return JSON.stringify({
    input: meta.input,
    output: meta.output,
    emitPhpstanTypeAliases: meta.emitPhpstanTypeAliases === true,
    verbosePhpdoc: meta.verbosePhpdoc === true,
    sealArrayShapes: meta.sealArrayShapes === true,
  });
}

/**
 * PHP-safe namespace leaf: `h` + first 12 hex chars of SHA-256 over
 * {@link canonicalCaseKey} (via node:crypto).
 */
export function namespaceIdForCase(meta: GoldenCaseMeta): string {
  const hex = createHash('sha256')
    .update(canonicalCaseKey(meta), 'utf8')
    .digest('hex')
    .slice(0, 12);
  return `h${hex}`;
}

/** Suite stems that map 1:1 from `.IN` → `.golden.php` (success only). */
export const SUCCESS_GOLDEN_STEMS: readonly string[] = [
  'function',
  'public_static',
  'protected_static',
  'docblock',
  'docblock_emit_aliases',
  'multi_comment',
  'verbose_phpdoc',
  'sealed_shapes',
];
