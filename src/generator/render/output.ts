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

export type MethodRenderSpec = {
  readonly functionName: string;
  readonly docType: string;
  readonly body: string;
};

export type EntryRenderSpec = MethodRenderSpec;

export type HelperRenderSpec = MethodRenderSpec;

/** One class method: PHPDoc and body indented once; visibility applied only here. */
function formatClassStaticMethod(
  spec: MethodRenderSpec,
  visibility: 'public' | 'protected' | 'private',
): string {
  const doc = indentEachLine(phpDocBlock(spec.docType.trim()), CLASS_INDENT);
  const indentedBody = indentEachLine(spec.body, CLASS_INDENT);
  return `${doc}
    ${visibility} static function ${spec.functionName}(mixed $value): bool
    {
${indentedBody}
    }`;
}

function formatClassHelpers(helpers: readonly HelperRenderSpec[]): string {
  return helpers
    .map((h) => formatClassStaticMethod(h, 'private'))
    .join('\n\n');
}

function formatTopLevelFunction(spec: MethodRenderSpec): string {
  return `${phpDocBlock(spec.docType.trim())}
function ${spec.functionName}(mixed $value): bool
{
${spec.body}
}`;
}

function formatClassTypeChecker(entryMethods: string, helperMethods: string): string {
  const inner = helperMethods
    ? `${entryMethods}\n\n${helperMethods}`
    : entryMethods;
  return `class TypeChecker
{
${inner}
}
`;
}

function formatClassCheckerOutput(
  entry: MethodRenderSpec,
  helpers: readonly HelperRenderSpec[],
  mode: CheckerOutputMode,
): string {
  const entryMethod = formatClassStaticMethod(entry, visibilityForMode(mode));
  const helperMethods = formatClassHelpers(helpers);
  return formatClassTypeChecker(entryMethod, helperMethods);
}

function formatClassMultipleEntries(
  entries: readonly EntryRenderSpec[],
  helpers: readonly HelperRenderSpec[],
  mode: CheckerOutputMode,
): string {
  const visibility = visibilityForMode(mode);
  const entryMethods = entries
    .map((e) => formatClassStaticMethod(e, visibility))
    .join('\n\n');
  const helperMethods = formatClassHelpers(helpers);
  return formatClassTypeChecker(entryMethods, helperMethods);
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

  return formatClassCheckerOutput(
    { functionName: mainFunctionName, docType: escapedType, body },
    [],
    mode,
  );
}

export function wrapMultipleEntries(
  entries: readonly EntryRenderSpec[],
  options?: GenerateCheckerOptions,
  helpers: readonly HelperRenderSpec[] = [],
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
    const helperText = helpers.map(formatTopLevelFunction).join('\n\n');
    const withHelpers = helperText ? `${combined}\n\n${helperText}` : combined;
    return normalizeEndingNewline(withHelpers);
  }
  return normalizeEndingNewline(
    formatClassMultipleEntries(entries, helpers, mode),
  );
}

export function wrapChecker(
  typeString: string,
  body: string,
  options?: GenerateCheckerOptions,
  helpers: readonly HelperRenderSpec[] = [],
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
    const helperText = helpers.map(formatTopLevelFunction).join('\n\n');
    const combined = helperText ? `${core}\n\n${helperText}` : core;
    return normalizeEndingNewline(combined);
  }
  return normalizeEndingNewline(
    formatClassCheckerOutput(
      { functionName: mainFunctionName, docType: typeString, body },
      helpers,
      mode,
    ),
  );
}
