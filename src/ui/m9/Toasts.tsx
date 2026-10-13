import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';
import type { Toast } from '../toasts';

export interface ToastsProps {
  /** Visible toasts, newest first (FE-19). */
  readonly toasts: readonly Toast[];
  /** Toasts beyond the visible ones: a "+n more" button that opens the alerts menu. */
  readonly overflow: number;
  readonly onSelect: (toast: Toast) => void;
  readonly onDismiss: (id: string) => void;
  /** Pointer over or focus inside a toast: pause (true) or resume (false) its timer. */
  readonly onHold: (id: string, on: boolean) => void;
  readonly onMore: () => void;
}

/**
 * Pop-up alerts (FE-19, FE-20, F21): warnings in a polite status region, criticals in an alert region.
 * Each toast is a select button plus a dismiss (×) button; repeats show "×n".
 */
export function Toasts(props: ToastsProps): JSX.Element | null {
  return notImplemented(props);
}
