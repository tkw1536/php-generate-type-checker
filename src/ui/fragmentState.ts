import type { CheckerOutputMode } from '../generator/options.ts';

export interface AppFragmentState {
  readonly optimize: boolean;
  readonly verbosePhpdoc: boolean;
  readonly unsafeStringArrayKeys: boolean;
  readonly unsealArrayShapes: boolean;
  readonly emit: CheckerOutputMode;
  readonly emitAliases: boolean;
  readonly resolveAliases: boolean;
  readonly input: string;
}

const EMIT_MODES: ReadonlySet<string> = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  if (value === '1' || value === 'true') {
    return true;
  }
  if (value === '0' || value === 'false') {
    return false;
  }
  return undefined;
}

function isCheckerOutputMode(value: string): value is CheckerOutputMode {
  return EMIT_MODES.has(value);
}

function parseEmitParam(value: string | null): CheckerOutputMode | undefined {
  if (value === null || !isCheckerOutputMode(value)) {
    return undefined;
  }
  return value;
}

/** Query-string-style payload for the URL fragment (no leading `#`). */
export function encodeFragmentState(state: AppFragmentState): string {
  const params = new URLSearchParams();
  params.set('optimize', state.optimize ? '1' : '0');
  params.set('verbose', state.verbosePhpdoc ? '1' : '0');
  params.set('unsafekeys', state.unsafeStringArrayKeys ? '1' : '0');
  params.set('unseal', state.unsealArrayShapes ? '1' : '0');
  params.set('emit', state.emit);
  params.set('aliases', state.emitAliases ? '1' : '0');
  params.set('resolve', state.resolveAliases ? '1' : '0');
  params.set('input', state.input);
  return params.toString();
}

export function decodeFragmentState(
  hash: string,
): Readonly<Partial<AppFragmentState>> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.trim()) {
    return null;
  }

  const params = new URLSearchParams(raw);
  const parsed = {
    optimize: parseBoolParam(params.get('optimize')),
    verbosePhpdoc: parseBoolParam(params.get('verbose')),
    unsafeStringArrayKeys: parseBoolParam(params.get('unsafekeys')),
    unsealArrayShapes: parseBoolParam(params.get('unseal')),
    emit: parseEmitParam(params.get('emit')),
    emitAliases: parseBoolParam(params.get('aliases')),
    resolveAliases: parseBoolParam(params.get('resolve')),
    input: params.get('input'),
  };

  if (
    parsed.optimize === undefined &&
    parsed.verbosePhpdoc === undefined &&
    parsed.unsafeStringArrayKeys === undefined &&
    parsed.unsealArrayShapes === undefined &&
    parsed.emit === undefined &&
    parsed.emitAliases === undefined &&
    parsed.resolveAliases === undefined &&
    parsed.input === null
  ) {
    return null;
  }

  return buildPartialFragmentState(parsed);
}

function buildPartialFragmentState(parsed: {
  readonly optimize: boolean | undefined;
  readonly verbosePhpdoc: boolean | undefined;
  readonly unsafeStringArrayKeys: boolean | undefined;
  readonly unsealArrayShapes: boolean | undefined;
  readonly emit: CheckerOutputMode | undefined;
  readonly emitAliases: boolean | undefined;
  readonly resolveAliases: boolean | undefined;
  readonly input: string | null;
}): Readonly<Partial<AppFragmentState>> {
  const state: {
    optimize?: boolean;
    verbosePhpdoc?: boolean;
    unsafeStringArrayKeys?: boolean;
    unsealArrayShapes?: boolean;
    emit?: CheckerOutputMode;
    emitAliases?: boolean;
    resolveAliases?: boolean;
    input?: string;
  } = {};
  if (parsed.optimize !== undefined) {
    state.optimize = parsed.optimize;
  }
  if (parsed.verbosePhpdoc !== undefined) {
    state.verbosePhpdoc = parsed.verbosePhpdoc;
  }
  if (parsed.unsafeStringArrayKeys !== undefined) {
    state.unsafeStringArrayKeys = parsed.unsafeStringArrayKeys;
  }
  if (parsed.unsealArrayShapes !== undefined) {
    state.unsealArrayShapes = parsed.unsealArrayShapes;
  }
  if (parsed.emit !== undefined) {
    state.emit = parsed.emit;
  }
  if (parsed.emitAliases !== undefined) {
    state.emitAliases = parsed.emitAliases;
  }
  if (parsed.resolveAliases !== undefined) {
    state.resolveAliases = parsed.resolveAliases;
  }
  if (parsed.input !== null) {
    state.input = parsed.input;
  }
  return state;
}

export function readFragmentFromLocation(): Readonly<Partial<AppFragmentState>> | null {
  return decodeFragmentState(window.location.hash);
}

export function replaceLocationFragment(state: AppFragmentState): void {
  const fragment = encodeFragmentState(state);
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, '', url);
}
