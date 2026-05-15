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
  return `/**
 * @param mixed $data
 * @phpstan-assert-if-true ${escapedType} $data
 */`;
}

/**
 * Wraps emitted checker body with PHPDoc and a `checkType` function or static method.
 * Method modes wrap with `class TypeChecker { … }`.
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
function checkType(mixed $data): bool
{
${body}
}
`;
  }

  const visibility =
    mode === 'public_static'
      ? 'public'
      : mode === 'protected_static'
        ? 'protected'
        : 'private';

  const indentedDoc = indentEachLine(doc, CLASS_INDENT);
  const indentedBody = indentEachLine(body, CLASS_INDENT);

  return `class TypeChecker
{
${indentedDoc}
    ${visibility} static function checkType(mixed $data): bool
    {
${indentedBody}
    }
}
`;
}

export function wrapChecker(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
): string {
  return formatCheckerOutput(typeString, body, options?.output ?? DEFAULT_CHECKER_OUTPUT);
}

export function generateCheckerFromAst(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
): string {
  return wrapChecker(typeString, body, options);
}
