import type { TypeNode } from '../parser/ast.ts';
import { formatType } from '../parser/format.ts';
import { generateExamples } from './generate.ts';
import { generateNonExamples } from './generate.non.ts';
import { unresolvedNamedTypes } from './named.ts';
import { renderPhpValue } from './render.ts';

export type PackExamplesOptions = {
  /** From `# RequireClass:` — omit harness (caller skips the golden case). */
  readonly requireClass?: readonly string[];
};

/**
 * PHPStan harness body for one type (namespace contents).
 * Returns `null` when RequireClass is set or unresolved names remain (omit case).
 * Returns `''` when there are no examples and no counterexamples.
 * The stub intentionally lies (`die`) — PHPStan trusts only the conditional `@return`.
 */
export function packExamplesPhp(
  ast: TypeNode,
  options: PackExamplesOptions = {},
): string | null {
  const requireClass = options.requireClass ?? [];
  if (requireClass.length > 0) {
    return null;
  }
  const unresolved = unresolvedNamedTypes(ast, requireClass);
  if (unresolved.length > 0) {
    return null;
  }

  const examples = generateExamples(ast);
  const counterexamples = generateNonExamples(ast);
  if (examples.length === 0 && counterexamples.length === 0) {
    return '';
  }

  // Structural type (not alias name) so `$value is …` resolves under PHPStan.
  const returnType = formatType(ast);
  const lines: string[] = [
    `/** @return ($value is ${returnType} ? true : false) */`,
    "function example(mixed $value): bool { die('example'); }",
    '',
  ];
  for (const example of examples) {
    const rendered = renderPhpValue(example);
    lines.push(`\\PHPStan\\dumpType(example(${rendered}));`);
  }
  for (const counterexample of counterexamples) {
    const rendered = renderPhpValue(counterexample);
    lines.push(`\\PHPStan\\dumpType(!example(${rendered}));`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Rename `example` to `example${index}` in a multi-entry harness body
 * (definition and dumpType call sites, including `!example(`).
 */
export function renameExampleHarness(body: string, index: number): string {
  const name = `example${index}`;
  return body
    .replaceAll('function example(', `function ${name}(`)
    .replaceAll('dumpType(example(', `dumpType(${name}(`)
    .replaceAll('dumpType(!example(', `dumpType(!${name}(`);
}

/** Rendered PHP expressions for UI / Copy (empty when none). */
export function exampleExpressions(ast: TypeNode): readonly string[] {
  return generateExamples(ast).map((value) => renderPhpValue(value));
}

/** Rendered PHP counterexample expressions for UI / Copy (empty when none). */
export function counterexampleExpressions(ast: TypeNode): readonly string[] {
  return generateNonExamples(ast).map((value) => renderPhpValue(value));
}
