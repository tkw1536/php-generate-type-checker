import type { CallableParam, ShapeField, TypeNode } from './ast';

/**
 * Formats a TypeNode into a string.
 *
 * It is guaranteed that calling {@link parseType} on the result results into the same TypeNode,
 * but not necessarily the opposite direction because of possible normalizations during the parsing process.
 */
export function formatType(type: TypeNode): string {
  return formatTypeInner(type, 'union');
}

type Precedence = 'union' | 'intersection' | 'primary';

function formatTypeInner(type: TypeNode, parent: Precedence): string {
  switch (type.kind) {
    case 'keyword':
      return type.keyword;
    case 'named':
      return type.name;
    case 'literal':
      return formatLiteral(type);
    case 'range':
      return formatRange(type);
    case 'collection':
      return formatCollection(type);
    case 'array':
      return formatPostfixArray(type);
    case 'shape':
      return formatShape(type);
    case 'union':
      return formatUnion(type, parent);
    case 'intersection':
      return formatIntersection(type, parent);
    case 'callable':
      return formatCallable(type);
    case 'generic':
      return `${type.name}<${type.typeArgs.map((arg) => formatTypeInner(arg, 'union')).join(', ')}>`;
    case 'unsupported':
      return type.raw;
    default:
      throw new Error('never reached');
  }
}

function formatLiteral(literal: Extract<TypeNode, { kind: 'literal' }>): string {
  if (literal.type === 'number') {
    return literal.value;
  }
  if (literal.quotes === 'double') {
    const escaped = literal.value
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"');
    return `"${escaped}"`;
  }
  const escaped = literal.value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
  return `'${escaped}'`;
}

function formatRange(type: Extract<TypeNode, { kind: 'range' }>): string {
  const min = type.min === null ? 'min' : String(type.min);
  const max = type.max === null ? 'max' : String(type.max);
  return `${type.keyword}<${min}, ${max}>`;
}

function formatCollection(type: Extract<TypeNode, { kind: 'collection' }>): string {
  if ('key' in type) {
    const inner = `${formatTypeInner(type.key, 'union')}, ${formatTypeInner(type.value, 'union')}`;
    return `${type.keyword}<${inner}>`;
  }

  return `${type.keyword}<${formatTypeInner(type.value, 'union')}>`;
}

function formatPostfixArray(type: Extract<TypeNode, { kind: 'array' }>): string {
  return `${formatPostfixOperand(type.value)}[]`;
}

function formatPostfixOperand(type: TypeNode): string {
  if (type.kind === 'array') {
    return `${formatPostfixOperand(type.value)}[]`;
  }
  const formatted = formatTypeInner(type, 'primary');
  if (type.kind === 'union' || type.kind === 'intersection') {
    return `(${formatted})`;
  }
  return formatted;
}

function formatShape(type: Extract<TypeNode, { kind: 'shape' }>): string {
  const fields = type.fields.map(formatShapeField).join(', ');
  return `${type.keyword}{${fields}}`;
}

function formatShapeField(field: ShapeField): string {
  if (field.key === null) {
    return formatTypeInner(field.value, 'union');
  }
  const key = formatShapeKey(field.key);
  const optional = field.optional ? '?' : '';
  return `${key}${optional}: ${formatTypeInner(field.value, 'union')}`;
}

function formatShapeKey(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(key)) {
    return key;
  }
  return `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function formatUnion(
  type: Extract<TypeNode, { kind: 'union' }>,
  parent: Precedence,
): string {
  const formatted = type.types
    .map((member) => formatTypeInner(member, 'union'))
    .join('|');
  if (parent === 'intersection') {
    return `(${formatted})`;
  }
  return formatted;
}

function formatIntersection(
  type: Extract<TypeNode, { kind: 'intersection' }>,
  _parent: Precedence,
): string {
  return type.types
    .map((member) => formatTypeInner(member, 'intersection'))
    .join('&');
}

function formatCallable(type: Extract<TypeNode, { kind: 'callable' }>): string {
  const params = type.signature.params.map(formatCallableParam).join(', ');
  return `callable(${params}): ${formatTypeInner(type.signature.returnType, 'union')}`;
}

function formatCallableParam(param: CallableParam): string {
  let s = formatTypeInner(param.type, 'union');

  if (param.variadic) {
    s = param.name === undefined ? `${s}...` : `${s} ...${param.name}`;
  } else if (param.byRef) {
    s += param.name === undefined ? ' &' : ` &${param.name}`;
  } else if (param.name !== undefined) {
    s += ` ${param.name}`;
  }

  if (param.optional) {
    s += '=';
  }

  return s;
}
