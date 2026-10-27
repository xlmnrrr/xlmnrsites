export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
export const isMobile = matchMedia('(max-width: 767px)');

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// UI state changed (dialog open/close, consent saved) — listeners re-evaluate overlays.
export function emitUi() {
  document.dispatchEvent(new Event('xl:ui'));
}
