export type CheckerOutputMode =
  | 'function'
  | 'public_static'
  | 'protected_static'
  | 'private_static';

export interface GenerateCheckerOptions {
  output?: CheckerOutputMode;
}

export const DEFAULT_CHECKER_OUTPUT: CheckerOutputMode = 'function';

const CLASS_INDENT = '    ';

function indentEachLine(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n');
}

function phpDocBlock(escapedType: string): string {
  return `/** @phpstan-assert-if-true ${escapedType} $value */`;
}

function normalizeEndingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

function visibilityForMode(mode: CheckerOutputMode): 'public' | 'protected' | 'private' {
  if (mode === 'public_static') return 'public';
  if (mode === 'protected_static') return 'protected';
  return 'private';
}

/**
 * Builds `class TypeChecker` with `check`, optional numbered helpers as `private static function check_N`,
 * and helpers placed after `check` inside the class body.
 */
export function formatClassCheckerOutput(
  typeString: string,
  mainBody: string,
  helpersBlock: string,
  mode: CheckerOutputMode,
): string {
  const escapedType = typeString.trim();
  const doc = indentEachLine(phpDocBlock(escapedType), CLASS_INDENT);
  const visibility = visibilityForMode(mode);
  const indentedMain = indentEachLine(mainBody, CLASS_INDENT);

  const helperBlocks = helpersBlock.trim()
    ? helpersBlock
        .split(/\n\n+/)
        .map((block) => {
          const withStatic = block
            .trim()
            .replace(/^function check_/m, 'private static function check_');
          return indentEachLine(withStatic, CLASS_INDENT);
        })
        .join('\n\n')
    : '';

  const checkMethod = `${doc}
    ${visibility} static function check(mixed $value): bool
    {
${indentedMain}
    }`;

  const inner = helperBlocks ? `${checkMethod}\n\n${helperBlocks}` : checkMethod;

  return `class TypeChecker
{
${inner}
}
`;
}

/**
 * Wraps emitted checker body with PHPDoc and a `check` function or static method.
 * Method modes wrap with `class TypeChecker { … }` (helpers are assembled in {@link wrapChecker}).
 */
export function formatCheckerOutput(
  typeString: string,
  body: string,
  mode: CheckerOutputMode = DEFAULT_CHECKER_OUTPUT,
): string {
  const escapedType = typeString.trim();
  const doc = phpDocBlock(escapedType);

  if (mode === 'function') {
    return `${doc}
function check(mixed $value): bool
{
${body}
}
`;
  }

  return formatClassCheckerOutput(typeString, body, '', mode);
}

export function wrapChecker(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
  helpersPrelude?: string,
): string {
  const mode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  if (mode === 'function') {
    const core = formatCheckerOutput(typeString, body, 'function');
    const combined = helpersPrelude ? `${core}\n\n${helpersPrelude}` : core;
    return normalizeEndingNewline(combined);
  }
  return normalizeEndingNewline(
    formatClassCheckerOutput(typeString, body, helpersPrelude ?? '', mode),
  );
}

export function generateCheckerFromAst(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
  helpersPrelude?: string,
): string {
  return wrapChecker(typeString, body, options, helpersPrelude);
}
