import type { ShapeField, ShapeRest, TypeNode } from '../parser/ast.ts';
import { shapeIsObject } from './builder/ast/collection.ts';

/**
 * Treat sealed array/list shapes as unsealed (`...`), matching pre–PHPStan 2.2
 * behavior. Object shapes and shapes that already have a rest are unchanged.
 */
export function unsealArrayShapesInType(node: TypeNode): TypeNode {
  switch (node.kind) {
    case 'keyword':
    case 'named':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return node;
    case 'array':
      return { kind: 'array', value: unsealArrayShapesInType(node.value) };
    case 'union':
      return {
        kind: 'union',
        types: node.types.map(unsealArrayShapesInType),
      };
    case 'intersection':
      return {
        kind: 'intersection',
        types: node.types.map(unsealArrayShapesInType),
      };
    case 'collection':
      return unsealCollection(node);
    case 'shape':
      return unsealShape(node);
    case 'generic':
      return {
        kind: 'generic',
        name: node.name,
        typeArgs: node.typeArgs.map(unsealArrayShapesInType),
      };
    default:
      throw new Error('never reached');
  }
}

function unsealCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode {
  if ('key' in node) {
    return {
      kind: 'collection',
      keyword: node.keyword,
      key: unsealArrayShapesInType(node.key),
      value: unsealArrayShapesInType(node.value),
    };
  }
  return {
    kind: 'collection',
    keyword: node.keyword,
    value: unsealArrayShapesInType(node.value),
  };
}

function unsealShape(
  node: Extract<TypeNode, { kind: 'shape' }>,
): TypeNode {
  const fields = node.fields.map(unsealShapeField);
  if (shapeIsObject(node)) {
    return { kind: 'shape', keyword: node.keyword, fields };
  }
  if (node.rest !== undefined) {
    return {
      kind: 'shape',
      keyword: node.keyword,
      fields,
      rest: unsealShapeRest(node.rest),
    };
  }
  return {
    kind: 'shape',
    keyword: node.keyword,
    fields,
    rest: { kind: 'any' },
  };
}

function unsealShapeField(field: ShapeField): ShapeField {
  return {
    ...field,
    value: unsealArrayShapesInType(field.value),
  };
}

function unsealShapeRest(rest: ShapeRest): ShapeRest {
  switch (rest.kind) {
    case 'any':
      return rest;
    case 'values':
      return {
        kind: 'values',
        value: unsealArrayShapesInType(rest.value),
      };
    case 'entries':
      return {
        kind: 'entries',
        key: unsealArrayShapesInType(rest.key),
        value: unsealArrayShapesInType(rest.value),
      };
    default:
      throw new Error('never reached');
  }
}
