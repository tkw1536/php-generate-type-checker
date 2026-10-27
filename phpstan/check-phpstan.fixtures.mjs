/**
 * Load success golden fixtures for `check-phpstan.mjs`.
 */
import docblockCases from '../src/generator/testdata/docblock.json' with { type: 'json' };
import docblockEmitAliasesCases from '../src/generator/testdata/docblock_emit_aliases.json' with { type: 'json' };
import functionCases from '../src/generator/testdata/function.json' with { type: 'json' };
import multiCommentCases from '../src/generator/testdata/multi_comment.json' with { type: 'json' };
import privateStaticCases from '../src/generator/testdata/private_static.json' with { type: 'json' };
import protectedStaticCases from '../src/generator/testdata/protected_static.json' with { type: 'json' };
import publicStaticCases from '../src/generator/testdata/public_static.json' with { type: 'json' };
import sealedShapesCases from '../src/generator/testdata/sealed_shapes.json' with { type: 'json' };
import verbosePhpdocCases from '../src/generator/testdata/verbose_phpdoc.json' with { type: 'json' };

/** @typedef {import('../src/generator/options.ts').CheckerOutputMode} CheckerOutputMode */

/**
 * @typedef {{
 *   readonly name: string;
 *   readonly input: string;
 *   readonly output: CheckerOutputMode;
 *   readonly emitPhpstanTypeAliases?: boolean;
 *   readonly verbosePhpdoc?: boolean;
 *   readonly sealArrayShapes?: boolean;
 * }} SuccessFixture
 */

/**
 * @param {string} output
 * @returns {output is CheckerOutputMode}
 */
function isOutputMode(output) {
  switch (output) {
    case 'function':
    case 'public_static':
    case 'protected_static':
    case 'private_static':
      return true;
    default:
      return false;
  }
}

/**
 * @param {unknown} value
 * @returns {value is { readonly input: string; readonly expected: string }}
 */
function isSuccessCase(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.expected === 'string'
  );
}

/**
 * @param {unknown} value
 * @returns {value is {
 *   readonly input: string;
 *   readonly output: string;
 *   readonly expected: string;
 *   readonly emitPhpstanTypeAliases?: boolean;
 *   readonly verbosePhpdoc?: boolean;
 *   readonly sealArrayShapes?: boolean;
 * }}
 */
function isDocblockCase(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'output' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.output === 'string' &&
    typeof value.expected === 'string'
  );
}

/**
 * @param {unknown} data
 * @param {CheckerOutputMode} output
 * @returns {SuccessFixture[]}
 */
function successToFixtures(data, output) {
  if (!Array.isArray(data) || !data.every((item) => isSuccessCase(item))) {
    throw new Error(`invalid success fixture JSON for output ${output}`);
  }
  return data.map(({ input }) => ({
    name: output === 'function' ? input : `${output}: ${input}`,
    input,
    output,
  }));
}

/**
 * @param {unknown} data
 * @param {string} labelPrefix
 * @returns {SuccessFixture[]}
 */
function docblockToFixtures(data, labelPrefix) {
  if (!Array.isArray(data) || !data.every((item) => isDocblockCase(item))) {
    throw new Error(`invalid docblock fixture JSON for ${labelPrefix}`);
  }
  /** @type {SuccessFixture[]} */
  const fixtures = [];
  for (let index = 0; index < data.length; index++) {
    const item = data[index];
    const {
      input,
      output,
      emitPhpstanTypeAliases,
      verbosePhpdoc,
      sealArrayShapes,
    } = item;
    if (!isOutputMode(output)) {
      throw new Error(`invalid output mode in ${labelPrefix}: ${output}`);
    }
    const extras = [
      emitPhpstanTypeAliases === true ? ' + aliases' : '',
      verbosePhpdoc === true ? ' + verbose' : '',
      sealArrayShapes === true ? ' + seal' : '',
    ].join('');
    const label =
      data.length === 1
        ? `${labelPrefix}: ${output}${extras}`
        : `${labelPrefix}[${index}]: ${output}${extras}`;
    fixtures.push({
      name: label,
      input,
      output,
      ...(emitPhpstanTypeAliases === true
        ? { emitPhpstanTypeAliases: true }
        : {}),
      ...(verbosePhpdoc === true ? { verbosePhpdoc: true } : {}),
      ...(sealArrayShapes === true ? { sealArrayShapes: true } : {}),
    });
  }
  return fixtures;
}

/**
 * Success goldens only — error fixtures throw and have no PHP to analyse.
 *
 * @returns {SuccessFixture[]}
 */
export function loadSuccessFixtures() {
  /** @type {SuccessFixture[]} */
  const fixtures = [
    ...successToFixtures(functionCases, 'function'),
    ...successToFixtures(publicStaticCases, 'public_static'),
    ...successToFixtures(protectedStaticCases, 'protected_static'),
    ...successToFixtures(privateStaticCases, 'private_static'),
    ...docblockToFixtures(docblockCases, 'docblock'),
    ...docblockToFixtures(docblockEmitAliasesCases, 'docblock_emit_aliases'),
    ...docblockToFixtures(multiCommentCases, 'multi_comment'),
    ...docblockToFixtures(verbosePhpdocCases, 'verbose_phpdoc'),
    ...docblockToFixtures(sealedShapesCases, 'sealed_shapes'),
  ];
  fixtures.sort((a, b) => a.name.localeCompare(b.name));
  return fixtures;
}
