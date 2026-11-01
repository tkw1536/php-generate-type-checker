import type { ShapeField, TypeNode } from '../parser/ast.ts';
import { EMPTY_ARRAY, WRONG_KIND_POOL } from './pools.ts';
import {
  phpInt,
  phpList,
  phpMap,
  phpObjectCast,
  phpObjectFromArray,
  phpString,
  type PhpValue,
} from './phpValue.ts';

/** List / T[] counterexamples: wrong-kind, empty for non-empty. */
export function nonExamplesForListLike(
  _value: TypeNode,
  nonEmpty: boolean,
): readonly PhpValue[] {
  const out: PhpValue[] = [...wrongKindNonArray()];
  if (nonEmpty) {
    out.push(EMPTY_ARRAY);
  }
  return out;
}

/** array<K,V> counterexamples: wrong-kind, empty for non-empty. */
export function nonExamplesForMapLike(
  _key: TypeNode,
  _value: TypeNode,
  nonEmpty: boolean,
): readonly PhpValue[] {
  const out: PhpValue[] = [...wrongKindNonArray()];
  if (nonEmpty) {
    out.push(EMPTY_ARRAY);
  }
  return out;
}

/**
 * Shape counterexamples: wrong-kind, wrong member types, missing required fields.
 * `generatePositive` / `generateNegative` recurse into field types.
 */
export function nonExamplesForShape(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  generatePositive: (ast: TypeNode) => readonly PhpValue[],
  generateNegative: (ast: TypeNode) => readonly PhpValue[],
): readonly PhpValue[] {
  const asObject = ast.keyword === 'object';
  const required = ast.fields.filter((f) => !f.optional);
  const nonEmptyKeyword =
    ast.keyword === 'non-empty-array' ||
    ast.keyword === 'non-empty-list' ||
    ast.keyword === 'non-empty-iterable';

  // Prefer structural misses (wrong member / missing required) over generic
  // wrong-kind so the soft cap keeps the interesting cases.
  const out: PhpValue[] = [];
  if (nonEmptyKeyword) {
    out.push(asObject ? phpObjectCast() : EMPTY_ARRAY);
  }

  const optional = ast.fields.filter((f) => f.optional);
  const fieldsToFill =
    required.length > 0 ? required : ast.fields.slice(0, 1);
  if (fieldsToFill.length > 0) {
    const positives = collectFieldValues(fieldsToFill, generatePositive);
    if (positives !== null) {
      out.push(
        ...wrongMemberShapes(ast, fieldsToFill, positives, generateNegative),
      );
      if (required.length > 0) {
        out.push(...missingRequiredShapes(ast, required, positives));
      }
    }
  }

  // Wrong-typed optional keys (omitting an optional is valid — never a counterexample).
  if (optional.length > 0 && ast.fields.length > fieldsToFill.length) {
    const allPositives = collectFieldValues(ast.fields, generatePositive);
    if (allPositives !== null) {
      out.push(
        ...wrongMemberShapes(ast, optional, allPositives, generateNegative),
      );
    }
  }

  out.push(...(asObject ? wrongKindNonObject() : wrongKindNonArray()).slice(0, 3));
  return out;
}

function wrongKindNonArray(): readonly PhpValue[] {
  return WRONG_KIND_POOL.filter((value) => value.kind !== 'array');
}

function wrongKindNonObject(): readonly PhpValue[] {
  return WRONG_KIND_POOL.filter((value) => value.kind !== 'objectCast');
}

function collectFieldValues(
  fields: readonly ShapeField[],
  generate: (ast: TypeNode) => readonly PhpValue[],
): readonly { readonly field: ShapeField; readonly value: PhpValue }[] | null {
  const out: { readonly field: ShapeField; readonly value: PhpValue }[] = [];
  for (const field of fields) {
    const values = generate(field.value);
    if (values.length === 0) {
      return null;
    }
    out.push({ field, value: values[0] });
  }
  return out;
}

function wrongMemberShapes(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  targets: readonly ShapeField[],
  positives: readonly { readonly field: ShapeField; readonly value: PhpValue }[],
  generateNegative: (ast: TypeNode) => readonly PhpValue[],
): readonly PhpValue[] {
  const out: PhpValue[] = [];
  for (const target of targets) {
    const bad =
      generateNegative(target.value)[0] ?? fallbackWrongScalar();
    // Match by field identity so optional targets work against all-field positives.
    const elements = positives.map((entry) =>
      entry.field === target
        ? { field: entry.field, value: bad }
        : entry,
    );
    out.push(wrapShape(ast, buildShapeValue(ast.keyword, elements)));
  }
  return out;
}

function missingRequiredShapes(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  required: readonly ShapeField[],
  positives: readonly { readonly field: ShapeField; readonly value: PhpValue }[],
): readonly PhpValue[] {
  const out: PhpValue[] = [];
  for (const omit of required) {
    const elements = positives.filter((entry) => entry.field !== omit);
    // Omitting the only required field → empty payload.
    out.push(wrapShape(ast, buildShapeValue(ast.keyword, elements)));
  }
  return out;
}

function fallbackWrongScalar(): PhpValue {
  return phpString('__wrong__');
}

function wrapShape(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  value: PhpValue,
): PhpValue {
  if (ast.keyword !== 'object') {
    return value;
  }
  if (value.kind !== 'array') {
    throw new Error('never reached');
  }
  return phpObjectFromArray(value);
}

function buildShapeValue(
  keyword: Extract<TypeNode, { readonly kind: 'shape' }>['keyword'],
  fieldValues: readonly {
    readonly field: ShapeField;
    readonly value: PhpValue;
  }[],
): PhpValue {
  if (fieldValues.length === 0) {
    return EMPTY_ARRAY;
  }
  const listShape =
    keyword === 'list' ||
    keyword === 'non-empty-list' ||
    fieldValues.every((f) => f.field.key === null);
  const elements: { readonly key: PhpValue; readonly value: PhpValue }[] = [];
  let positional = 0;
  for (const { field, value } of fieldValues) {
    if (field.key === null) {
      elements.push({ key: phpInt(positional), value });
      positional += 1;
    } else if (typeof field.key === 'number') {
      elements.push({ key: phpInt(field.key), value });
    } else {
      elements.push({ key: phpString(field.key), value });
    }
  }
  if (listShape && fieldValues.every((f) => f.field.key === null)) {
    return phpList(elements.map((e) => e.value));
  }
  return phpMap(elements.map((e) => [e.key, e.value] as const));
}
