import type { TypeNode } from '../parser/ast.ts';
import {
  examplesForListLike,
  examplesForMapLike,
  examplesForShape,
} from './generate.compose.ts';
import { examplesForKeyword } from './generate.keyword.ts';
import { BUILTIN_CLASS_STRING_POOL, INT_POOL } from './pools.ts';
import {
  phpFloat,
  phpInt,
  phpString,
  type PhpValue,
} from './phpValue.ts';
import { renderPhpValue } from './render.ts';

/** Soft cap after dedupe per type. */
const MAX_EXAMPLES = 8;

/**
 * Generate concrete PHP value examples for a type AST.
 * Returns an empty list when no examples are available.
 */
export function generateExamples(ast: TypeNode): readonly PhpValue[] {
  return takeUnique(generateRaw(ast), MAX_EXAMPLES);
}

function generateRaw(ast: TypeNode): readonly PhpValue[] {
  switch (ast.kind) {
    case 'keyword':
      return examplesForKeyword(ast.keyword);
    case 'literal':
      return examplesForLiteral(ast);
    case 'range':
      return examplesForRange(ast.min, ast.max);
    case 'named':
    case 'unsupported':
    case 'callable':
      return [];
    case 'intersection':
      return examplesForIntersection(ast.types);
    case 'generic':
      return examplesForGeneric(ast.name, ast.typeArgs);
    case 'union':
      return examplesForUnion(ast.types);
    case 'array':
      return examplesForListLike(ast.value, false, generateRaw);
    case 'collection':
      return examplesForCollection(ast);
    case 'shape':
      return examplesForShape(ast, generateRaw);
    default:
      throw new Error('never reached');
  }
}

function examplesForLiteral(
  ast: Extract<TypeNode, { readonly kind: 'literal' }>,
): readonly PhpValue[] {
  if (ast.type === 'string') {
    return [phpString(ast.value)];
  }
  const n = Number(ast.value);
  if (!Number.isFinite(n)) {
    return [];
  }
  if (ast.value.includes('.') || /e/iu.test(ast.value)) {
    return [phpFloat(n)];
  }
  return [phpInt(n)];
}

function examplesForRange(
  min: number | null,
  max: number | null,
): readonly PhpValue[] {
  const lo = min ?? Number.NEGATIVE_INFINITY;
  const hi = max ?? Number.POSITIVE_INFINITY;
  const fromPool = INT_POOL.filter((v) => {
    if (v.kind !== 'int') {
      return false;
    }
    return v.value >= lo && v.value <= hi;
  });
  const extras: PhpValue[] = [];
  if (min !== null && Number.isInteger(min) && min >= lo && min <= hi) {
    extras.push(phpInt(min));
  }
  if (max !== null && Number.isInteger(max) && max >= lo && max <= hi) {
    extras.push(phpInt(max));
  }
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
    const mid = Math.trunc((lo + hi) / 2);
    if (mid >= lo && mid <= hi) {
      extras.push(phpInt(mid));
    }
  }
  return [...fromPool, ...extras];
}

function examplesForGeneric(
  name: string,
  typeArgs: readonly TypeNode[],
): readonly PhpValue[] {
  const lower = name.toLowerCase();
  if (lower === 'class-string' || lower === 'interface-string') {
    return typeArgs.length === 0 ? BUILTIN_CLASS_STRING_POOL : [];
  }
  if (
    lower === 'trait-string' ||
    lower === 'enum-string' ||
    lower === 'callable-string'
  ) {
    // Keyword path handles bare callable-string; generics / enum / trait → none.
    return [];
  }
  return [];
}

function examplesForUnion(types: readonly TypeNode[]): readonly PhpValue[] {
  const out: PhpValue[] = [];
  for (const arm of types) {
    out.push(...generateRaw(arm));
  }
  return out;
}

/**
 * `\stdClass&object` / `\stdClass&object{…}` (any order): reuse object-arm examples.
 * Other intersections stay empty.
 */
function examplesForIntersection(
  types: readonly TypeNode[],
): readonly PhpValue[] {
  const objectArm = stdClassObjectIntersectionArm(types);
  if (objectArm === null) {
    return [];
  }
  return generateRaw(objectArm);
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

/** Object keyword/shape arm when the rest are only `stdClass` / `\stdClass`. */
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

function examplesForCollection(
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
    return examplesForListLike(ast.value, nonEmpty, generateRaw);
  }
  return examplesForMapLike(ast.key, ast.value, nonEmpty, generateRaw);
}

function takeUnique(
  values: readonly PhpValue[],
  limit: number,
): readonly PhpValue[] {
  const seen = new Set<string>();
  const out: PhpValue[] = [];
  for (const value of values) {
    const key = renderPhpValue(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}
