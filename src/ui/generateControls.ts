import type { CheckerOutputMode } from '../generator/options.ts';
import {
  replaceLocationFragment,
  type AppFragmentState,
} from './fragmentState.ts';

export const DEFAULT_TYPE = `/**
 * @phpstan-type User array{id: int, email: non-empty-string, name?: string}
 */`;

export function getGenerateOutputMode(): CheckerOutputMode {
  const el = document.querySelector<HTMLSelectElement>('#generate-output-mode');
  const v = el?.value;
  if (
    v === 'function' ||
    v === 'public_static' ||
    v === 'protected_static' ||
    v === 'private_static'
  ) {
    return v;
  }
  return 'function';
}

export function getTypeInput(): string {
  const input = document.querySelector<HTMLTextAreaElement>('#type-input')!;
  return input.value.trim() || DEFAULT_TYPE;
}

export function getOptimize(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-prioritize-readability',
  );
  return el?.checked === true;
}

export function getVerbosePhpdoc(): boolean {
  const el = document.querySelector<HTMLInputElement>('#generate-verbose-phpdoc');
  return el?.checked === true;
}

export function getEmitPhpstanTypeAliases(): boolean {
  const el = document.querySelector<HTMLInputElement>('#generate-emit-aliases');
  return el?.checked === true;
}

export function getResolveAliases(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-resolve-aliases',
  );
  return el?.checked === true;
}

function getPrioritizeReadabilityOverCompactness(): boolean {
  return !getOptimize();
}

export function wouldRunOptimizer(): boolean {
  return getOptimize();
}

export function readUiFragmentState(): AppFragmentState {
  return {
    optimize: getOptimize(),
    verbosePhpdoc: getVerbosePhpdoc(),
    emit: getGenerateOutputMode(),
    emitAliases: getEmitPhpstanTypeAliases(),
    resolveAliases: getResolveAliases(),
    input: document.querySelector<HTMLTextAreaElement>('#type-input')!.value,
  };
}

export function applyFragmentState(
  fragment: Readonly<Partial<AppFragmentState>>,
): void {
  if (fragment.optimize !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-prioritize-readability',
    )!.checked = fragment.optimize;
  }
  if (fragment.verbosePhpdoc !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-verbose-phpdoc',
    )!.checked = fragment.verbosePhpdoc;
  }
  if (fragment.emit !== undefined) {
    document.querySelector<HTMLSelectElement>('#generate-output-mode')!.value =
      fragment.emit;
  }
  if (fragment.emitAliases !== undefined) {
    document.querySelector<HTMLInputElement>('#generate-emit-aliases')!.checked =
      fragment.emitAliases;
  }
  if (fragment.resolveAliases !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-resolve-aliases',
    )!.checked = fragment.resolveAliases;
  }
  if (fragment.input !== undefined) {
    document.querySelector<HTMLTextAreaElement>('#type-input')!.value =
      fragment.input;
  }
}

export function syncFragmentToLocation(): void {
  replaceLocationFragment(readUiFragmentState());
}

export function getGenerateOptions(): {
  readonly output: CheckerOutputMode;
  readonly prioritizeReadabilityOverCompactness: boolean;
  readonly verbosePhpdoc: boolean;
} {
  return {
    output: getGenerateOutputMode(),
    prioritizeReadabilityOverCompactness:
      getPrioritizeReadabilityOverCompactness(),
    verbosePhpdoc: getVerbosePhpdoc(),
  };
}

/** Show alias options when the parse result includes `@phpstan-type` aliases. */
export function syncDocblockOptions(hasAliases: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    '.generate-docblock-option',
  )) {
    el.hidden = !hasAliases;
  }
}
