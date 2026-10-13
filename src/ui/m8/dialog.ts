import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

// Modal dialog behaviour shared by the M8 dialogs (§13.8): focus moves in on open, Tab stays inside,
// Esc closes (without reaching the app's global Esc handler), and focus returns on close.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Moves focus to `initial` (or the first focusable) while mounted; restores the previous focus after. */
export function useDialogFocus(container: RefObject<HTMLElement | null>, initial?: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = initial?.current ?? container.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    target?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
    // Mount/unmount only: the dialogs are rendered only while open.
  }, []);
}

/** Keydown handler for the dialog element: Esc closes, Tab and Shift+Tab wrap inside. */
export function dialogKeys(onClose: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !(e.currentTarget instanceof HTMLElement)) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
}
