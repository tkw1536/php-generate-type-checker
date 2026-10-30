import type { ShapeField, TypeNode } from '../parser/ast.ts';
import { EMPTY_ARRAY } from './pools.ts';
import {
  phpInt,
  phpList,
  phpMap,
  phpObjectCast,
  phpObjectFromArray,
  phpString,
  type PhpValue,
} from './phpValue.ts';

const MAX_SHAPE = 8;

/** List / T[] examples from a value type. */
export function examplesForListLike(
  value: TypeNode,
  nonEmpty: boolean,
  generateRaw: (ast: TypeNode) => readonly PhpValue[],
): readonly PhpValue[] {
  // PHPStan does not prove `[]` as `array<never>` / `never[]` via dumpType.
  if (value.kind === 'keyword' && value.keyword === 'never') {
    return [];
  }
  const values = generateRaw(value);
  if (values.length === 0) {
    return nonEmpty ? [] : [EMPTY_ARRAY];
  }
  const out: PhpValue[] = [];
  if (!nonEmpty) {
    out.push(EMPTY_ARRAY);
  }
  for (const v of values.slice(0, 3)) {
    out.push(phpList([v]));
  }
  if (values.length >= 2) {
    out.push(phpList([values[0], values[1]]));
  }
  return out;
}

/** array<K,V> examples. */
export function examplesForMapLike(
  key: TypeNode,
  value: TypeNode,
  nonEmpty: boolean,
  generateRaw: (ast: TypeNode) => readonly PhpValue[],
): readonly PhpValue[] {
  const keys = generateRaw(key);
  const values = generateRaw(value);
  // Empty map when value has no examples (e.g. never) — do not emit `[]`
  // as `array<K, never>` (PHPStan dumpType stays bool).
  if (keys.length === 0 || values.length === 0) {
    return [];
  }
  const out: PhpValue[] = [];
  if (!nonEmpty) {
    out.push(EMPTY_ARRAY);
  }
  const limit = Math.min(3, keys.length, values.length);
  for (let i = 0; i < limit; i++) {
    out.push(phpMap([[keys[i], values[i]]]));
  }
  return out;
}

/** Array/list/object shape examples. */
export function examplesForShape(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  generateRaw: (ast: TypeNode) => readonly PhpValue[],
): readonly PhpValue[] {
  const asObject = ast.keyword === 'object';
  const required = ast.fields.filter((f) => !f.optional);
  const nonEmptyKeyword =
    ast.keyword === 'non-empty-array' ||
    ast.keyword === 'non-empty-list' ||
    ast.keyword === 'non-empty-iterable';

  if (
    required.length === 0 &&
    ast.fields.length === 0 &&
    ast.rest === undefined
  ) {
    if (nonEmptyKeyword) {
      return [];
    }
    return asObject ? [phpObjectCast()] : [EMPTY_ARRAY];
  }

  const fieldsToFill =
    required.length > 0 ? required : ast.fields.slice(0, 1);

  if (fieldsToFill.length === 0 && !nonEmptyKeyword) {
    return asObject ? [phpObjectCast()] : [EMPTY_ARRAY];
  }

  const fieldExamples = collectFieldExamples(fieldsToFill, generateRaw);
  if (fieldExamples === null) {
    return [];
  }
  if (fieldExamples.length === 0) {
    if (nonEmptyKeyword) {
      return [];
    }
    return asObject ? [phpObjectCast()] : [EMPTY_ARRAY];
  }

  const combos = buildShapeCombos(ast.keyword, fieldsToFill, fieldExamples);
  if (!asObject) {
    return combos;
  }
  return combos.map((value) => {
    if (value.kind !== 'array') {
      throw new Error('never reached');
    }
    return phpObjectFromArray(value);
  });
}

function collectFieldExamples(
  fields: readonly ShapeField[],
  generateRaw: (ast: TypeNode) => readonly PhpValue[],
): readonly { readonly field: ShapeField; readonly values: readonly PhpValue[] }[] | null {
  const fieldExamples: {
    readonly field: ShapeField;
    readonly values: readonly PhpValue[];
  }[] = [];
  for (const field of fields) {
    const values = generateRaw(field.value);
    if (values.length === 0) {
      return null;
    }
    fieldExamples.push({ field, values });
  }
  return fieldExamples;
}

function buildShapeCombos(
  keyword: Extract<TypeNode, { readonly kind: 'shape' }>['keyword'],
  fieldsToFill: readonly ShapeField[],
  fieldExamples: readonly {
    readonly field: ShapeField;
    readonly values: readonly PhpValue[];
  }[],
): readonly PhpValue[] {
  const out: PhpValue[] = [];
  const comboCount = Math.min(
    MAX_SHAPE,
    Math.max(...fieldExamples.map((f) => f.values.length)),
  );
  const listShape =
    keyword === 'list' ||
    keyword === 'non-empty-list' ||
    fieldsToFill.every((f) => f.key === null);

  for (let i = 0; i < comboCount; i++) {
    out.push(oneShapeExample(listShape, fieldExamples, i));
  }
  return out;
}

function oneShapeExample(
  listShape: boolean,
  fieldExamples: readonly {
    readonly field: ShapeField;
    readonly values: readonly PhpValue[];
  }[],
  index: number,
): PhpValue {
  const elements: { readonly key: PhpValue; readonly value: PhpValue }[] = [];
  let positional = 0;
  for (const { field, values } of fieldExamples) {
    const value = values[index % values.length];
    if (field.key === null) {
      elements.push({ key: phpInt(positional), value });
      positional += 1;
    } else if (typeof field.key === 'number') {
      elements.push({ key: phpInt(field.key), value });
    } else {
      elements.push({ key: phpString(field.key), value });
    }
  }
  if (listShape && fieldExamples.every((f) => f.field.key === null)) {
    return phpList(elements.map((e) => e.value));
  }
  return phpMap(elements.map((e) => [e.key, e.value] as const));
}
