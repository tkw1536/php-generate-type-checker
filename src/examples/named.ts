import type { TypeNode } from '../parser/ast.ts';

/** Class / interface names that exist during isolated PHPStan analyse. */
const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'stdClass',
  '\\stdClass',
  'Exception',
  '\\Exception',
  'Throwable',
  '\\Throwable',
  'DateTimeInterface',
  '\\DateTimeInterface',
]);

type NameBag = {
  readonly add: (name: string) => void;
  readonly toArray: () => readonly string[];
};

function createNameBag(): NameBag {
  const names: string[] = [];
  return {
    add: (name) => {
      names.push(name);
    },
    toArray: () => names,
  };
}

/** True if `name` is a builtin that needs no RequireClass / mock. */
export function isBuiltinNamedType(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

/** Collect `named` identifiers from a type AST (including generics / shapes). */
export function collectNamedTypes(ast: TypeNode): readonly string[] {
  const bag = createNameBag();
  walk(ast, bag);
  return [...new Set(bag.toArray())];
}

/**
 * Names that block examples PHPStan harness unless listed in RequireClass
 * (or covered later by mocks).
 */
export function unresolvedNamedTypes(
  ast: TypeNode,
  requireClass: readonly string[],
): readonly string[] {
  const required = new Set(requireClass);
  return collectNamedTypes(ast).filter(
    (name) => !isBuiltinNamedType(name) && !required.has(name),
  );
}

function walk(ast: TypeNode, bag: NameBag): void {
  switch (ast.kind) {
    case 'named':
      bag.add(ast.name);
      break;
    case 'keyword':
    case 'literal':
    case 'range':
    case 'unsupported':
      break;
    case 'array':
      walk(ast.value, bag);
      break;
    case 'union':
    case 'intersection':
      for (const child of ast.types) {
        walk(child, bag);
      }
      break;
    case 'collection':
      walk(ast.value, bag);
      if ('key' in ast) {
        walk(ast.key, bag);
      }
      break;
    case 'shape':
      walkShape(ast, bag);
      break;
    case 'callable':
      walk(ast.signature.returnType, bag);
      for (const param of ast.signature.params) {
        walk(param.type, bag);
      }
      break;
    case 'generic':
      for (const arg of ast.typeArgs) {
        walk(arg, bag);
      }
      break;
    default:
      throw new Error('never reached');
  }
}

function walkShape(
  ast: Extract<TypeNode, { readonly kind: 'shape' }>,
  bag: NameBag,
): void {
  for (const field of ast.fields) {
    walk(field.value, bag);
  }
  if (ast.rest === undefined) {
    return;
  }
  if (ast.rest.kind === 'values') {
    walk(ast.rest.value, bag);
  } else if (ast.rest.kind === 'entries') {
    walk(ast.rest.key, bag);
    walk(ast.rest.value, bag);
  }
}
