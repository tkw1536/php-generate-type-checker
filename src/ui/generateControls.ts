import type { CheckerOutputMode } from '../generator/options.ts';
import {
  replaceLocationFragment,
  type AppFragmentState,
} from './fragmentState.ts';

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
  return input.value;
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

export function getUnsealArrayShapes(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-unseal-array-shapes',
  );
  return el?.checked === true;
}

export function getUnsafeStringArrayKeys(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-unsafe-string-array-keys',
  );
  return el?.checked === true;
}

export function hasUnsoundGenerateOptions(): boolean {
  return getUnsafeStringArrayKeys() || getUnsealArrayShapes();
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
    unsafeStringArrayKeys: getUnsafeStringArrayKeys(),
    unsealArrayShapes: getUnsealArrayShapes(),
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
  if (fragment.unsafeStringArrayKeys !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-unsafe-string-array-keys',
    )!.checked = fragment.unsafeStringArrayKeys;
  }
  if (fragment.unsealArrayShapes !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-unseal-array-shapes',
    )!.checked = fragment.unsealArrayShapes;
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
  syncUnsoundOptionsUi();
}

export function syncFragmentToLocation(): void {
  replaceLocationFragment(readUiFragmentState());
}

export function getGenerateOptions(): {
  readonly output: CheckerOutputMode;
  readonly prioritizeReadabilityOverCompactness: boolean;
  readonly verbosePhpdoc: boolean;
  readonly unsafeStringArrayKeys: boolean;
  readonly unsealArrayShapes: boolean;
} {
  return {
    output: getGenerateOutputMode(),
    prioritizeReadabilityOverCompactness:
      getPrioritizeReadabilityOverCompactness(),
    verbosePhpdoc: getVerbosePhpdoc(),
    unsafeStringArrayKeys: getUnsafeStringArrayKeys(),
    unsealArrayShapes: getUnsealArrayShapes(),
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

const PHP_WARNING_DEFAULT =
  'Always review generated PHP before using it in production.';
const PHP_WARNING_UNSOUND =
  'Generated code may be unsound because of selected options and can produce incorrect results at runtime. Always review it before using it in production.';

/** Sync UNSOUND badges and PHP output footer severity with unsound options. */
export function syncUnsoundOptionsUi(): void {
  const unsafeKeys = getUnsafeStringArrayKeys();
  const unseal = getUnsealArrayShapes();
  const anyUnsound = hasUnsoundGenerateOptions();

  document
    .querySelector<HTMLElement>('#unsafe-string-array-keys-unsound-badge')
    ?.classList.toggle('option-unsound-badge--active', unsafeKeys);
  document
    .querySelector<HTMLElement>('#unseal-array-shapes-unsound-badge')
    ?.classList.toggle('option-unsound-badge--active', unseal);

  const warningText = document.querySelector<HTMLElement>(
    '#php-output-warning-text',
  );
  if (warningText !== null) {
    warningText.textContent = anyUnsound
      ? PHP_WARNING_UNSOUND
      : PHP_WARNING_DEFAULT;
  }

  const footer = document.querySelector<HTMLElement>('#output-footer');
  if (footer === null) {
    return;
  }
  const phpPaneActive =
    document.querySelector<HTMLElement>(
      '.output-footer-pane[data-output-footer="php"]',
    )?.classList.contains('active') === true;
  if (!phpPaneActive) {
    return;
  }
  footer.classList.toggle('panel-footer--warning', anyUnsound);
  footer.classList.toggle('panel-footer--caution', !anyUnsound);
}
