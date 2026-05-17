import {
  DEFAULT_CHECKER_OUTPUT,
  type CheckerOutputMode,
  type GenerateCheckerOptions,
} from '../options.ts';

export type { CheckerOutputMode, GenerateCheckerOptions };
export { DEFAULT_CHECKER_OUTPUT };

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
 * Builds `class TypeChecker` with the entry method, optional helpers as `private static function …`,
 * and helpers placed after the entry method inside the class body.
 */
function formatClassCheckerOutput(
  typeString: string,
  mainBody: string,
  helpersBlock: string,
  mode: CheckerOutputMode,
  mainFunctionName = 'check',
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
            .replace(/^function /m, 'private static function ');
          return indentEachLine(withStatic, CLASS_INDENT);
        })
        .join('\n\n')
    : '';

  const checkMethod = `${doc}
    ${visibility} static function ${mainFunctionName}(mixed $value): bool
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
 * Wraps emitted checker body with PHPDoc and a top-level function or static method.
 * Method modes wrap with `class TypeChecker { … }` (helpers are assembled in {@link wrapChecker}).
 */
function formatCheckerOutput(
  typeString: string,
  body: string,
  mode: CheckerOutputMode = DEFAULT_CHECKER_OUTPUT,
  mainFunctionName = 'check',
): string {
  const escapedType = typeString.trim();
  const doc = phpDocBlock(escapedType);

  if (mode === 'function') {
    return `${doc}
function ${mainFunctionName}(mixed $value): bool
{
${body}
}
`;
  }

  return formatClassCheckerOutput(typeString, body, '', mode, mainFunctionName);
}

export type EntryRenderSpec = {
  functionName: string;
  docType: string;
  body: string;
};

export function wrapMultipleEntries(
  entries: EntryRenderSpec[],
  options?: GenerateCheckerOptions,
  helpersPrelude?: string,
): string {
  const mode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  if (entries.length === 0) {
    return '';
  }
  if (mode === 'function') {
    const parts = entries.map((e) =>
      formatCheckerOutput(e.docType, e.body, 'function', e.functionName),
    );
    const combined = parts.join('\n\n');
    const withHelpers = helpersPrelude ? `${combined}\n\n${helpersPrelude}` : combined;
    return normalizeEndingNewline(withHelpers);
  }
  return normalizeEndingNewline(
    formatClassMultipleEntries(entries, helpersPrelude ?? '', mode),
  );
}

function formatClassMultipleEntries(
  entries: EntryRenderSpec[],
  helpersBlock: string,
  mode: CheckerOutputMode,
): string {
  const visibility = visibilityForMode(mode);
  const methods = entries
    .map((e) => {
      const doc = indentEachLine(phpDocBlock(e.docType), CLASS_INDENT);
      const indentedMain = indentEachLine(e.body, CLASS_INDENT);
      return `${doc}
    ${visibility} static function ${e.functionName}(mixed $value): bool
    {
${indentedMain}
    }`;
    })
    .join('\n\n');

  const helperBlocks = helpersBlock.trim()
    ? helpersBlock
        .split(/\n\n+/)
        .map((block) => {
          const withStatic = block
            .trim()
            .replace(/^function /m, 'private static function ');
          return indentEachLine(withStatic, CLASS_INDENT);
        })
        .join('\n\n')
    : '';

  const inner = helperBlocks ? `${methods}\n\n${helperBlocks}` : methods;
  return `class TypeChecker
{
${inner}
}
`;
}

export function wrapChecker(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
  helpersPrelude?: string,
): string {
  const mode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  const mainFunctionName = options?.mainFunctionName ?? 'check';
  if (mode === 'function') {
    const core = formatCheckerOutput(
      typeString,
      body,
      'function',
      mainFunctionName,
    );
    const combined = helpersPrelude ? `${core}\n\n${helpersPrelude}` : core;
    return normalizeEndingNewline(combined);
  }
  return normalizeEndingNewline(
    formatClassCheckerOutput(
      typeString,
      body,
      helpersPrelude ?? '',
      mode,
      mainFunctionName,
    ),
  );
}
