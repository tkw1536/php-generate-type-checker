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
  syncUnsealArrayShapesUi();
}

export function syncFragmentToLocation(): void {
  replaceLocationFragment(readUiFragmentState());
}

export function getGenerateOptions(): {
  readonly output: CheckerOutputMode;
  readonly prioritizeReadabilityOverCompactness: boolean;
  readonly verbosePhpdoc: boolean;
  readonly unsealArrayShapes: boolean;
} {
  return {
    output: getGenerateOutputMode(),
    prioritizeReadabilityOverCompactness:
      getPrioritizeReadabilityOverCompactness(),
    verbosePhpdoc: getVerbosePhpdoc(),
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
  'Generated code is unsound because of selected options and can produce incorrect results at runtime. Always review it before using it in production.';

/** Sync UNSOUND badge and PHP output footer severity with the unseal option. */
export function syncUnsealArrayShapesUi(): void {
  const enabled = getUnsealArrayShapes();
  const badge = document.querySelector<HTMLElement>(
    '#unseal-array-shapes-unsound-badge',
  );
  badge?.classList.toggle('option-unsound-badge--active', enabled);

  const warningText = document.querySelector<HTMLElement>(
    '#php-output-warning-text',
  );
  if (warningText !== null) {
    warningText.textContent = enabled
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
  footer.classList.toggle('panel-footer--warning', enabled);
  footer.classList.toggle('panel-footer--caution', !enabled);
}
