import type { CheckerOutputMode } from '../generator/options.ts';

export interface AppFragmentState {
  nameFromType: boolean;
  optimize: boolean;
  emit: CheckerOutputMode;
  emitAliases: boolean;
  input: string;
}

const EMIT_MODES: readonly CheckerOutputMode[] = [
  'function',
  'public_static',
  'protected_static',
  'private_static',
];

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

function parseEmitParam(value: string | null): CheckerOutputMode | undefined {
  if (value === null) {
    return undefined;
  }
  return EMIT_MODES.includes(value as CheckerOutputMode)
    ? (value as CheckerOutputMode)
    : undefined;
}

/** Query-string-style payload for the URL fragment (no leading `#`). */
export function encodeFragmentState(state: AppFragmentState): string {
  const params = new URLSearchParams();
  params.set('name', state.nameFromType ? '1' : '0');
  params.set('optimize', state.optimize ? '1' : '0');
  params.set('emit', state.emit);
  params.set('aliases', state.emitAliases ? '1' : '0');
  params.set('input', state.input);
  return params.toString();
}

export function decodeFragmentState(
  hash: string,
): Partial<AppFragmentState> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.trim()) {
    return null;
  }

  const params = new URLSearchParams(raw);
  const nameFromType = parseBoolParam(params.get('name'));
  const optimize = parseBoolParam(params.get('optimize'));
  const emit = parseEmitParam(params.get('emit'));
  const emitAliases = parseBoolParam(params.get('aliases'));
  const input = params.get('input');

  if (
    nameFromType === undefined &&
    optimize === undefined &&
    emit === undefined &&
    emitAliases === undefined &&
    input === null
  ) {
    return null;
  }

  const state: Partial<AppFragmentState> = {};
  if (nameFromType !== undefined) {
    state.nameFromType = nameFromType;
  }
  if (optimize !== undefined) {
    state.optimize = optimize;
  }
  if (emit !== undefined) {
    state.emit = emit;
  }
  if (emitAliases !== undefined) {
    state.emitAliases = emitAliases;
  }
  if (input !== null) {
    state.input = input;
  }
  return state;
}

export function readFragmentFromLocation(): Partial<AppFragmentState> | null {
  return decodeFragmentState(window.location.hash);
}

export function replaceLocationFragment(state: AppFragmentState): void {
  const fragment = encodeFragmentState(state);
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, '', url);
}
