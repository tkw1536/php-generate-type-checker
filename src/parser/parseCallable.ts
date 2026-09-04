import type { CallableParam, CallableSig, TypeNode } from './ast.ts';
import type { TokenReader } from './tokenReader.ts';

/** Host methods required to parse callable signatures. */
export type CallableParseHost = TokenReader & {
  readonly parsePostfix: () => TypeNode;
  readonly mergeUnion: (left: TypeNode, right: TypeNode) => TypeNode;
  readonly mergeIntersection: (left: TypeNode, right: TypeNode) => TypeNode;
  readonly parseUnion: () => TypeNode;
};

export function parseCallable(host: CallableParseHost): TypeNode {
  host.expect('lparen');
  const params: CallableParam[] = [];

  if (!host.check('rparen')) {
    do {
      params.push(parseCallableParam(host));
    } while (host.match('comma') && !host.check('rparen'));
  }

  host.expect('rparen');
  host.expect('colon');
  const returnType = host.parseUnion();

  const signature: CallableSig = { params, returnType };
  return { kind: 'callable', signature };
}

function isParamByRefAmp(host: CallableParseHost): boolean {
  if (!host.check('amp')) {
    return false;
  }
  const next = host.tokenAt(1);
  return next?.type === 'identifier' && next.value.startsWith('$');
}

function parseCallableParamIntersection(host: CallableParseHost): TypeNode {
  let left = host.parsePostfix();
  while (host.check('amp') && !isParamByRefAmp(host)) {
    host.advance();
    const right = host.parsePostfix();
    left = host.mergeIntersection(left, right);
  }
  return left;
}

function parseCallableParamType(host: CallableParseHost): TypeNode {
  let left = parseCallableParamIntersection(host);
  while (host.match('pipe')) {
    const right = parseCallableParamIntersection(host);
    left = host.mergeUnion(left, right);
  }
  return left;
}

function parseCallableParam(host: CallableParseHost): CallableParam {
  let variadic = false;
  if (host.match('ellipsis')) {
    variadic = true;
  }

  const type = parseCallableParamType(host);
  let name: string | undefined;
  let byRef = false;
  let optional = false;

  if (!variadic && host.match('ellipsis')) {
    variadic = true;
  }

  if (host.match('amp')) {
    byRef = true;
    if (host.check('identifier')) {
      name = host.advance().value;
    }
  } else if (host.check('identifier')) {
    name = host.advance().value;
  }

  if (host.match('equals') || host.match('question')) {
    optional = true;
  }

  return { type, name, byRef, optional, variadic };
}
