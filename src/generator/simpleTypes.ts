import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';

/**
 * Extension point: PHP boolean expressions for leaf types.
 * Returns null if this module does not handle the node (caller throws after checkability pass).
 */
export function emitExpression(node: TypeNode, varName: string): string | null {
  if (node.kind === 'literal') {
    if (typeof node.value === 'string') {
      return `${varName} === ${phpString(node.value)}`;
    }
    if (typeof node.value === 'number') {
      return `${varName} === ${node.value}`;
    }
    if (typeof node.value === 'boolean') {
      return node.value ? `${varName} === true` : `${varName} === false`;
    }
    return null;
  }

  if (node.kind === 'class') {
    return `${varName} instanceof ${node.name}`;
  }

  if (node.kind === 'primitive') {
    return emitPrimitiveExpression(node.name, varName);
  }

  return null;
}

export function emitPrimitiveExpression(name: string, varName: string): string | null {
  switch (name) {
    case 'int':
    case 'integer':
      return `is_int(${varName})`;
    case 'string':
      return `is_string(${varName})`;
    case 'float':
    case 'double':
      return `is_float(${varName})`;
    case 'number':
    case 'numeric':
      return `is_int(${varName}) || is_float(${varName})`;
    case 'bool':
    case 'boolean':
      return `is_bool(${varName})`;
    case 'null':
      return `${varName} === null`;
    case 'array':
      return `is_array(${varName})`;
    case 'object':
      return `is_object(${varName})`;
    case 'mixed':
      return null;
    case 'never':
      return 'false';
    case 'true':
      return `${varName} === true`;
    case 'false':
      return `${varName} === false`;
    case 'callable':
      return `is_callable(${varName})`;
    case 'positive-int':
      return `(is_int(${varName}) && ${varName} > 0)`;
    case 'negative-int':
      return `(is_int(${varName}) && ${varName} < 0)`;
    case 'non-positive-int':
      return `(is_int(${varName}) && ${varName} <= 0)`;
    case 'non-negative-int':
      return `(is_int(${varName}) && ${varName} >= 0)`;
    case 'non-zero-int':
      return `(is_int(${varName}) && ${varName} !== 0)`;
    case 'non-empty-string':
      return `(is_string(${varName}) && ${varName} !== '')`;
    case 'non-empty-mixed':
      return `(${varName} !== false && ${varName} !== 0 && ${varName} !== 0.0 && ${varName} !== '' && ${varName} !== '0' && ${varName} !== [] && ${varName} !== null)`;
    case 'class-string':
    case 'interface-string':
    case 'trait-string':
      return `(is_string(${varName}) && class_exists(${varName}))`;
    case 'enum-string':
      return `(is_string(${varName}) && enum_exists(${varName}))`;
    case 'numeric-string':
      return `(is_string(${varName}) && is_numeric(${varName}))`;
    case 'callable-string':
      return `(is_string(${varName}) && is_callable(${varName})`;
    case 'literal-string':
    case 'lowercase-string':
    case 'uppercase-string':
      return `is_string(${varName})`;
    default:
      return null;
  }
}

export function requireExpression(node: TypeNode, varName: string): string {
  const expr = emitExpression(node, varName);
  if (expr === null) {
    throw new GenerationError(
      `Cannot emit expression for ${describeNode(node)}`,
      describeNode(node),
    );
  }
  return expr;
}

export function isNoOpValueCheck(node: TypeNode): boolean {
  return node.kind === 'primitive' && node.name === 'mixed';
}

/** Value type `never` (e.g. `array<never>` / `list<never>`): only empty containers satisfy. */
export function isNeverPrimitive(node: TypeNode): boolean {
  return node.kind === 'primitive' && node.name === 'never';
}

export function isExpressible(node: TypeNode): boolean {
  if (isNoOpValueCheck(node)) {
    return true;
  }
  if (
    node.kind === 'literal' ||
    node.kind === 'class' ||
    node.kind === 'primitive'
  ) {
    return emitExpression(node, '$_') !== null;
  }
  if (node.kind === 'union') {
    return node.types.every(isExpressible);
  }
  if (node.kind === 'intersection') {
    return node.types.every(isExpressible);
  }
  return false;
}

export function describeNode(node: TypeNode): string {
  switch (node.kind) {
    case 'primitive':
      return node.name;
    case 'literal':
      return JSON.stringify(node.value);
    case 'class':
      return node.name;
    case 'array':
      return 'array';
    case 'list':
      return 'list';
    case 'shape':
      return 'array shape';
    case 'union':
      return 'union';
    case 'intersection':
      return 'intersection';
    case 'generic':
      return `${node.name}<...>`;
    case 'callable':
      return 'callable';
    case 'unsupported':
      return node.raw;
    default:
      return 'unknown';
  }
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
