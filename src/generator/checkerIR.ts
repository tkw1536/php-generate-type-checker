/**
 * Checker IR types: atomic `call` / `equals` guards and statement structure.
 * No PHPStan primitive names in `Check` — see checksFromType.ts.
 */
export type ValueRef =
  | { kind: 'parameter' }
  | { kind: 'access'; base: ValueRef; field: FieldAccess }
  | { kind: 'loopValue'; loopId: string }
  | { kind: 'loopKey'; loopId: string };

export type FieldAccess =
  | { kind: 'arrayIndex'; key: string | number }
  | { kind: 'objectProperty'; key: string | number };

export type CheckCall = {
  kind: 'call';
  function: string;
  arguments: string[];
  negated: boolean;
};

export type CheckEquals = {
  kind: 'equals';
  variable: string;
  literal: string;
  negated: boolean;
};

export type Check = CheckCall | CheckEquals;

/** `instanceof` as a {@link CheckCall} (`function: 'instanceof'`, two arguments). */
export function instanceofCheck(
  variable: string,
  className: string,
  negated: boolean,
): CheckCall {
  return {
    kind: 'call',
    function: 'instanceof',
    arguments: [variable, className],
    negated,
  };
}

export type CheckerProgram = {
  parameter: string;
  statements: CheckerStmt[];
};

export type CheckerStmt =
  | { kind: 'failIf'; check: Check }
  | { kind: 'failUnlessMatch'; arms: Check[] }
  | { kind: 'returnIf'; check: Check }
  | { kind: 'returnTrue' }
  | {
      kind: 'optional';
      ref: ValueRef;
      key: string | number;
      objectShape: boolean;
      body: CheckerStmt[];
    }
  | {
      kind: 'foreach';
      iterable: ValueRef;
      loopId: string;
      keyVar: string | null;
      valueVar: string;
      body: CheckerStmt[];
    }
  | { kind: 'returnOr'; arms: OrArm[] };

export type OrArm =
  | { kind: 'check'; check: Check }
  | { kind: 'checkerCall'; typeKey: string; callExpression: string };

export function checkEquals(a: Check, b: Check): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'call') {
    return (
      b.kind === 'call' &&
      a.function === b.function &&
      a.negated === b.negated &&
      argumentsEqual(a.arguments, b.arguments)
    );
  }
  return (
    b.kind === 'equals' &&
    a.variable === b.variable &&
    a.literal === b.literal &&
    a.negated === b.negated
  );
}

function argumentsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => v === b[i]);
}

export function valueRefEquals(a: ValueRef, b: ValueRef): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'parameter':
      return b.kind === 'parameter';
    case 'loopValue':
      return b.kind === 'loopValue' && a.loopId === b.loopId;
    case 'loopKey':
      return b.kind === 'loopKey' && a.loopId === b.loopId;
    case 'access':
      return (
        b.kind === 'access' &&
        valueRefEquals(a.base, b.base) &&
        fieldAccessEquals(a.field, b.field)
      );
    default:
      return false;
  }
}

function fieldAccessEquals(a: FieldAccess, b: FieldAccess): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  return a.key === b.key;
}

const PHP_RESERVED_OBJECT_PROPERTIES = new Set([
  'class',
  'function',
  'public',
  'protected',
  'private',
  'static',
  'abstract',
  'final',
  'interface',
  'trait',
  'extends',
  'implements',
  'namespace',
  'use',
  'const',
  'var',
  'new',
  'clone',
  'instanceof',
  'insteadof',
  'as',
  'try',
  'catch',
  'finally',
  'throw',
  'if',
  'else',
  'elseif',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'yield',
  'match',
  'enum',
]);

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function arrayIndexExpr(key: string | number): string {
  return typeof key === 'number' ? String(key) : phpString(key);
}

/** Render a {@link ValueRef} to a PHP lvalue path. */
export function valueRefToPath(
  ref: ValueRef,
  parameter: string,
  loopVars: ReadonlyMap<string, { keyVar: string | null; valueVar: string }>,
): string {
  switch (ref.kind) {
    case 'parameter':
      return parameter;
    case 'loopValue': {
      const loop = loopVars.get(ref.loopId);
      if (!loop) {
        throw new Error(`unknown loopId: ${ref.loopId}`);
      }
      return loop.valueVar;
    }
    case 'loopKey': {
      const loop = loopVars.get(ref.loopId);
      if (!loop?.keyVar) {
        throw new Error(`loop ${ref.loopId} has no key variable`);
      }
      return loop.keyVar;
    }
    case 'access': {
      const base = valueRefToPath(ref.base, parameter, loopVars);
      if (ref.field.kind === 'arrayIndex') {
        return `${base}[${arrayIndexExpr(ref.field.key)}]`;
      }
      const keyStr = String(ref.field.key);
      if (PHP_RESERVED_OBJECT_PROPERTIES.has(keyStr)) {
        return `${base}->{${phpString(keyStr)}}`;
      }
      return `${base}->${keyStr}`;
    }
    default:
      return parameter;
  }
}

export function parameterRef(): ValueRef {
  return { kind: 'parameter' };
}

export function loopValueRef(loopId: string): ValueRef {
  return { kind: 'loopValue', loopId };
}

export function accessRef(base: ValueRef, field: FieldAccess): ValueRef {
  return { kind: 'access', base, field };
}

export function arrayIndexRef(base: ValueRef, key: string | number): ValueRef {
  return accessRef(base, { kind: 'arrayIndex', key });
}

export function objectPropertyRef(base: ValueRef, key: string | number): ValueRef {
  return accessRef(base, { kind: 'objectProperty', key });
}

/** Stable, readable dump for tests and debugging (not PHP). */
export function formatCheckerProgram(program: CheckerProgram): string {
  return JSON.stringify(program, null, 2);
}
