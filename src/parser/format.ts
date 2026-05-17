import type { CallableParam, ShapeField, TypeNode } from './ast';

/**
 * Formats a TypeNode into a string.
 *
 * It is guaranteed that calling {@link parseType} on the result results into the same TypeNode,
 * but not necessarily the opposite direction because of possible normalizations during the parsing process.
 */
export function formatType(type: TypeNode): string {
  return formatAt(type, Prec.Union);
}

const Prec = {
  Union: 0,
  Intersection: 1,
  Postfix: 2,
  Primary: 3,
} as const;

type PrecLevel = (typeof Prec)[keyof typeof Prec];

function paren(s: string): string {
  return `(${s})`;
}

function formatAt(node: TypeNode, minPrec: PrecLevel): string {
  switch (node.kind) {
    case 'union': {
      if (minPrec > Prec.Union) {
        return paren(formatAt(node, Prec.Union));
      }
      return node.types.map((t) => formatAt(t, Prec.Intersection)).join('|');
    }
    case 'intersection': {
      if (minPrec > Prec.Intersection) {
        return paren(formatAt(node, Prec.Intersection));
      }
      return node.types.map((t) => formatAt(t, Prec.Postfix)).join('&');
    }
    case 'array':
      return formatArray(node, minPrec);
    case 'list': {
      const name = node.nonEmpty ? 'non-empty-list' : 'list';
      const s = `${name}<${formatAt(node.element, Prec.Union)}>`;
      return minPrec > Prec.Postfix ? paren(s) : s;
    }
    case 'shape':
      return formatShape(node, minPrec);
    case 'generic': {
      const args = node.typeArgs.map((t) => formatAt(t, Prec.Union)).join(', ');
      const s = `${node.name}<${args}>`;
      return minPrec > Prec.Postfix ? paren(s) : s;
    }
    case 'callable': {
      const s = `callable(${formatCallableParams(node.signature.params)}): ${formatAt(node.signature.returnType, Prec.Union)}`;
      return minPrec > Prec.Postfix ? paren(s) : s;
    }
    case 'primitive':
    case 'class':
    case 'literal':
    case 'int_range':
    case 'unsupported':
      return formatPrimary(node);
    default:
      return formatPrimary(node);
  }
}

function formatPrimary(node: TypeNode): string {
  switch (node.kind) {
    case 'primitive':
      return node.name;
    case 'int_range':
      return formatIntRange(node);
    case 'literal':
      return formatLiteral(node.value);
    case 'class':
      return node.name;
    case 'unsupported':
      return node.raw;
    default:
      return 'mixed';
  }
}

function formatIntRange(node: { min?: number; max?: number }): string {
  const lo = node.min === undefined ? 'min' : String(node.min);
  const hi = node.max === undefined ? 'max' : String(node.max);
  return `int<${lo}, ${hi}>`;
}

function formatLiteral(value: string | number | boolean): string {
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function formatArray(
  node: { key?: TypeNode; value: TypeNode },
  minPrec: PrecLevel,
): string {
  if (node.key !== undefined) {
    const s = `array<${formatAt(node.key, Prec.Union)}, ${formatAt(node.value, Prec.Union)}>`;
    return minPrec > Prec.Postfix ? paren(s) : s;
  }

  const value = node.value;
  if (value.kind !== 'union' && value.kind !== 'intersection') {
    const inner = formatAt(value, Prec.Primary);
    const s = `${inner}[]`;
    return minPrec > Prec.Postfix ? paren(s) : s;
  }

  const s = `array<${formatAt(value, Prec.Union)}>`;
  return minPrec > Prec.Postfix ? paren(s) : s;
}

function isListTupleFields(fields: ShapeField[]): boolean {
  if (fields.length < 2) {
    return false;
  }
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.key !== i || field.optional) {
      return false;
    }
  }
  return true;
}

function formatShape(
  node: { fields: ShapeField[]; object?: boolean },
  minPrec: PrecLevel,
): string {
  const objectShape = Boolean(node.object);
  const useListTuple = !objectShape && isListTupleFields(node.fields);
  const inner = useListTuple
    ? node.fields.map((f) => formatAt(f.type, Prec.Union)).join(', ')
    : node.fields.map((f) => formatShapeField(f, objectShape)).join(', ');
  const brace = objectShape ? 'object' : useListTuple ? 'list' : 'array';
  const s = `${brace}{${inner}}`;
  return minPrec > Prec.Postfix ? paren(s) : s;
}

function formatShapeKey(key: string | number, objectShape: boolean): string {
  if (typeof key === 'number') {
    return String(key);
  }
  if (objectShape && /^[a-zA-Z_]\w*$/.test(key)) {
    return key;
  }
  if (/^[a-zA-Z_]\w*$/.test(key) && !key.includes('::')) {
    return key;
  }
  return `'${key.replace(/'/g, "\\'")}'`;
}

function formatShapeField(field: ShapeField, objectShape: boolean): string {
  const opt = field.optional ? '?' : '';
  return `${formatShapeKey(field.key, objectShape)}${opt}: ${formatAt(field.type, Prec.Union)}`;
}

function formatCallableParams(params: CallableParam[]): string {
  return params.map(formatCallableParam).join(', ');
}

function formatCallableParam(param: CallableParam): string {
  let s = formatAt(param.type, Prec.Union);
  if (param.variadic) {
    if (param.name) {
      s += ` ...${param.name}`;
    } else {
      s += '...';
    }
  } else if (param.byRef && param.name) {
    s += ` &${param.name}`;
  } else if (param.name) {
    s += ` ${param.name}`;
  }
  if (param.optional) {
    s += param.name ? '?' : '=';
  }
  return s;
}
