import type { TypeNode } from '../../parser/ast.ts';
import { isValidPhpClassName } from '../../parser/phpClassName.ts';
import type { Arg, Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  callExpr,
  literalArg,
  orExpr,
  refArg,
} from '../ir/index.ts';
import { cannotBuild } from './errors.ts';

const UNIT_ENUM_CLASS = '\\UnitEnum';

/** Generics handled by this module (including rejected `trait-string<…>`). */
export function isClassStringLikeGenericName(name: string): boolean {
  return (
    name === 'class-string' ||
    name === 'interface-string' ||
    name === 'enum-string' ||
    name === 'trait-string'
  );
}

/**
 * Runtime checks for `class-string` / `interface-string` / `enum-string` generics.
 * Returns null for unrelated generic names.
 */
export function classStringGenericBoolean(
  type: Extract<TypeNode, { kind: 'generic' }>,
  subject: ValueRef,
): Expr | null {
  if (type.name === 'trait-string') {
    return cannotBuild(
      type,
      'Cannot generate a runtime check for trait-string<...>: PHPStan does not support the generic variant trait-string<T>',
      'trait-string<...>',
    );
  }
  if (type.name === 'enum-string') {
    return enumStringGenericBoolean(type, subject);
  }
  if (type.name !== 'class-string' && type.name !== 'interface-string') {
    return null;
  }
  if (type.typeArgs.length !== 1) {
    cannotBuild(
      type,
      `Cannot generate a runtime check for ${type.name}<...>: expected exactly one type argument, got ${type.typeArgs.length}`,
      `${type.name}<...>`,
    );
  }
  const s = refArg(subject);
  return andExpr([
    callExpr('is_string', [s]),
    classStringBoundExpr(type, type.typeArgs[0], s),
  ]);
}

/** Bare `enum-string` ≡ `class-string<\UnitEnum>` (no `enum_exists`). */
export function enumStringKeywordBoolean(subject: ValueRef): Expr {
  const s = refArg(subject);
  return andExpr([callExpr('is_string', [s]), isAUnitEnum(s)]);
}

function enumStringGenericBoolean(
  type: Extract<TypeNode, { kind: 'generic' }>,
  subject: ValueRef,
): Expr {
  if (type.typeArgs.length !== 1) {
    cannotBuild(
      type,
      `Cannot generate a runtime check for enum-string<...>: expected exactly one type argument, got ${type.typeArgs.length}`,
      'enum-string<...>',
    );
  }
  const s = refArg(subject);
  return andExpr([
    callExpr('is_string', [s]),
    isAUnitEnum(s),
    classStringBoundExpr(type, type.typeArgs[0], s),
  ]);
}

function isAUnitEnum(subject: Arg): Expr {
  return callExpr('is_a', [
    subject,
    literalArg(`${UNIT_ENUM_CLASS}::class`),
    literalArg('true'),
  ]);
}

function classStringBoundExpr(
  root: Extract<TypeNode, { kind: 'generic' }>,
  bound: TypeNode,
  subject: Arg,
): Expr {
  switch (bound.kind) {
    case 'named':
      return classStringNamedIsA(root, bound, subject);
    case 'union':
      return orExpr(
        bound.types.map((m) => classStringBoundExpr(root, m, subject)),
      );
    case 'intersection':
      return andExpr(
        bound.types.map((m) => classStringBoundExpr(root, m, subject)),
      );
    case 'array':
    case 'callable':
    case 'collection':
    case 'generic':
    case 'keyword':
    case 'literal':
    case 'range':
    case 'shape':
    case 'unsupported':
      return cannotBuild(
        root,
        `Cannot generate a runtime check for ${root.name}<...>: type argument must be a class or interface name, or a union/intersection of those`,
        `${root.name}<...>`,
      );
    default:
      throw new Error('never reached');
  }
}

function classStringNamedIsA(
  root: Extract<TypeNode, { kind: 'generic' }>,
  bound: Extract<TypeNode, { kind: 'named' }>,
  subject: Arg,
): Expr {
  if (!isValidPhpClassName(bound.name)) {
    return cannotBuild(
      root,
      `Cannot generate a runtime check for ${root.name}<${bound.name}>: "${bound.name}" is not a valid PHP class name`,
      `${root.name}<${bound.name}>`,
    );
  }
  return callExpr('is_a', [
    subject,
    literalArg(`${bound.name}::class`),
    literalArg('true'),
  ]);
}
