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

function indefiniteArticle(type: string): 'a' | 'an' {
  const first = type.charAt(0).toLowerCase();
  if (
    first === 'a' ||
    first === 'e' ||
    first === 'i' ||
    first === 'o' ||
    first === 'u'
  ) {
    return 'an';
  }
  return 'a';
}

function phpDocBlock(escapedType: string, verbose: boolean): string {
  if (!verbose) {
    return `/** @phpstan-assert-if-true ${escapedType} $value */`;
  }
  const article = indefiniteArticle(escapedType);
  return `/**
 * Checks if the given value is ${article} ${escapedType}.
 *
 * @param mixed $value
 *   The value to check.
 *
 * @return bool
 *   TRUE if the given value is ${article} ${escapedType}.
 *
 * @phpstan-assert-if-true ${escapedType} $value
 */`;
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
  verbose: boolean,
): string {
  const doc = indentEachLine(
    phpDocBlock(spec.docType.trim(), verbose),
    CLASS_INDENT,
  );
  const indentedBody = indentEachLine(spec.body, CLASS_INDENT);
  return `${doc}
    ${visibility} static function ${spec.functionName}(mixed $value): bool
    {
${indentedBody}
    }`;
}

function formatClassHelpers(
  helpers: readonly HelperRenderSpec[],
  verbose: boolean,
): string {
  return helpers
    .map((h) => formatClassStaticMethod(h, 'private', verbose))
    .join('\n\n');
}

function formatTopLevelFunction(
  spec: MethodRenderSpec,
  verbose: boolean,
): string {
  return `${phpDocBlock(spec.docType.trim(), verbose)}
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
  verbose: boolean,
): string {
  const entryMethod = formatClassStaticMethod(
    entry,
    visibilityForMode(mode),
    verbose,
  );
  const helperMethods = formatClassHelpers(helpers, verbose);
  return formatClassTypeChecker(entryMethod, helperMethods);
}

function formatClassMultipleEntries(
  entries: readonly EntryRenderSpec[],
  helpers: readonly HelperRenderSpec[],
  mode: CheckerOutputMode,
  verbose: boolean,
): string {
  const visibility = visibilityForMode(mode);
  const entryMethods = entries
    .map((e) => formatClassStaticMethod(e, visibility, verbose))
    .join('\n\n');
  const helperMethods = formatClassHelpers(helpers, verbose);
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
  verbose = false,
): string {
  const escapedType = typeString.trim();
  const doc = phpDocBlock(escapedType, verbose);

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
    verbose,
  );
}

export function wrapMultipleEntries(
  entries: readonly EntryRenderSpec[],
  options?: GenerateCheckerOptions,
  helpers: readonly HelperRenderSpec[] = [],
): string {
  const mode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  const verbose = options?.verbosePhpdoc === true;
  if (entries.length === 0) {
    return '';
  }
  if (mode === 'function') {
    const parts = entries.map((e) =>
      formatCheckerOutput(e.docType, e.body, 'function', e.functionName, verbose),
    );
    const combined = parts.join('\n\n');
    const helperText = helpers
      .map((helper) => formatTopLevelFunction(helper, verbose))
      .join('\n\n');
    const withHelpers =
      helperText === '' ? combined : `${combined}\n\n${helperText}`;
    return normalizeEndingNewline(withHelpers);
  }
  return normalizeEndingNewline(
    formatClassMultipleEntries(entries, helpers, mode, verbose),
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
  const verbose = options?.verbosePhpdoc === true;
  if (mode === 'function') {
    const core = formatCheckerOutput(
      typeString,
      body,
      'function',
      mainFunctionName,
      verbose,
    );
    const helperText = helpers
      .map((helper) => formatTopLevelFunction(helper, verbose))
      .join('\n\n');
    const combined = helperText === '' ? core : `${core}\n\n${helperText}`;
    return normalizeEndingNewline(combined);
  }
  return normalizeEndingNewline(
    formatClassCheckerOutput(
      { functionName: mainFunctionName, docType: typeString, body },
      helpers,
      mode,
      verbose,
    ),
  );
}
