import type { TypeNode } from '../parser/ast.ts';
import {
  nonExamplesForListLike,
  nonExamplesForMapLike,
  nonExamplesForShape,
} from './generate.compose.non.ts';
import { nonExamplesForKeyword } from './generate.keyword.non.ts';
import { generateExamples } from './generate.ts';
import {
  intersectByRender,
  takeUnique,
  withoutPositives,
} from './generate.util.ts';
import { WRONG_KIND_POOL } from './pools.ts';
import { phpString, type PhpValue } from './phpValue.ts';

/** Soft cap after dedupe per type (same as positives). */
const MAX_EXAMPLES = 8;

/**
 * Generate concrete PHP counterexamples for a type AST.
 * Returns an empty list when none are available (e.g. `mixed`).
 */
export function generateNonExamples(ast: TypeNode): readonly PhpValue[] {
  const positives = generateExamples(ast);
  return takeUnique(
    withoutPositives(generateNonRaw(ast), positives),
    MAX_EXAMPLES,
  );
}

function generateNonRaw(ast: TypeNode): readonly PhpValue[] {
  switch (ast.kind) {
    case 'keyword':
      return nonExamplesForKeyword(ast.keyword);
    case 'literal':
      return nonExamplesForLiteral(ast);
    case 'range':
      return nonExamplesForRange(ast.min, ast.max);
    case 'named':
    case 'unsupported':
    case 'callable':
      return WRONG_KIND_POOL;
    case 'intersection':
      return nonExamplesForIntersection(ast.types);
    case 'generic':
      return nonExamplesForGeneric(ast.name, ast.typeArgs);
    case 'union':
      return nonExamplesForUnion(ast.types);
    case 'array':
      return nonExamplesForListLike(ast.value, false);
    case 'collection':
      return nonExamplesForCollection(ast);
    case 'shape':
      return nonExamplesForShape(ast, generateExamples, generateNonExamples);
    default:
      throw new Error('never reached');
  }
}

function nonExamplesForLiteral(
  ast: Extract<TypeNode, { readonly kind: 'literal' }>,
): readonly PhpValue[] {
  if (ast.type === 'string') {
    return WRONG_KIND_POOL.filter(
      (value) =>
        !(value.kind === 'string' && value.value === ast.value),
    );
  }
  const n = Number(ast.value);
  if (!Number.isFinite(n)) {
    return WRONG_KIND_POOL;
  }
  const isFloat = ast.value.includes('.') || /e/iu.test(ast.value);
  return WRONG_KIND_POOL.filter((value) => {
    if (isFloat) {
      return !(value.kind === 'float' && value.value === n);
    }
    return !(value.kind === 'int' && value.value === n);
  });
}

function nonExamplesForRange(
  _min: number | null,
  _max: number | null,
): readonly PhpValue[] {
  // PHPStan `$value is int<min,max>` does not reject out-of-range or wrong-kind
  // values via dumpType (example(…) dumps true), so counterexamples stay empty.
  return [];
}

function nonExamplesForGeneric(
  name: string,
  typeArgs: readonly TypeNode[],
): readonly PhpValue[] {
  const lower = name.toLowerCase();
  if (
    lower === 'class-string' ||
    lower === 'interface-string' ||
    lower === 'trait-string' ||
    lower === 'enum-string' ||
    lower === 'callable-string'
  ) {
    if (typeArgs.length > 0) {
      return WRONG_KIND_POOL;
    }
    return [
      phpString('a'),
      phpString(''),
      ...WRONG_KIND_POOL.filter((value) => value.kind !== 'string'),
    ];
  }
  return WRONG_KIND_POOL;
}

/** Counterexample of a union = counterexample of every arm. */
function nonExamplesForUnion(types: readonly TypeNode[]): readonly PhpValue[] {
  return intersectByRender(types.map((arm) => generateNonRaw(arm)));
}

/**
 * Counterexample of an intersection = counterexample of any arm.
 * `\stdClass&object` / object shapes: prefer non-objects.
 */
function nonExamplesForIntersection(
  types: readonly TypeNode[],
): readonly PhpValue[] {
  const objectArm = stdClassObjectIntersectionArm(types);
  if (objectArm !== null) {
    return generateNonRaw(objectArm);
  }
  const out: PhpValue[] = [];
  for (const arm of types) {
    out.push(...generateNonRaw(arm));
  }
  return out;
}

function isStdClassNamed(ast: TypeNode): boolean {
  return (
    ast.kind === 'named' &&
    (ast.name === 'stdClass' || ast.name === '\\stdClass')
  );
}

function isObjectExampleArm(ast: TypeNode): boolean {
  if (ast.kind === 'keyword') {
    return ast.keyword === 'object';
  }
  return ast.kind === 'shape' && ast.keyword === 'object';
}

function stdClassObjectIntersectionArm(
  types: readonly TypeNode[],
): TypeNode | null {
  if (types.length < 2) {
    return null;
  }
  let objectArm: TypeNode | null = null;
  let sawStdClass = false;
  for (const arm of types) {
    if (isStdClassNamed(arm)) {
      sawStdClass = true;
      continue;
    }
    if (!isObjectExampleArm(arm) || objectArm !== null) {
      return null;
    }
    objectArm = arm;
  }
  if (!sawStdClass || objectArm === null) {
    return null;
  }
  return objectArm;
}

function nonExamplesForCollection(
  ast: Extract<TypeNode, { readonly kind: 'collection' }>,
): readonly PhpValue[] {
  const nonEmpty =
    ast.keyword === 'non-empty-array' ||
    ast.keyword === 'non-empty-list' ||
    ast.keyword === 'non-empty-iterable';
  const isList =
    ast.keyword === 'list' ||
    ast.keyword === 'non-empty-list' ||
    !('key' in ast);
  if (isList || !('key' in ast)) {
    return nonExamplesForListLike(ast.value, nonEmpty);
  }
  return nonExamplesForMapLike(ast.key, ast.value, nonEmpty);
}
