import type { JSX } from 'preact';
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

function Item({ toast, props }: { readonly toast: Toast; readonly props: ToastsProps }): JSX.Element {
  const hold = (on: boolean) => () => {
    props.onHold(toast.id, on);
  };
  return (
    <li class={`toast toast-${toast.severity}`}>
      <button
        type="button"
        class="toast-body"
        onPointerEnter={hold(true)}
        onPointerLeave={hold(false)}
        onClick={() => {
          props.onSelect(toast);
        }}
        onFocus={hold(true)}
        onBlur={hold(false)}
      >
        {/* Text, not just colour (N-5). */}
        <span class="toast-severity">{toast.severity === 'critical' ? 'Critical' : 'Warning'}</span>
        <span class="toast-message">{toast.message}</span>
        {toast.count > 1 ? <span class="toast-count">×{toast.count}</span> : null}
      </button>
      <button
        type="button"
        class="toast-dismiss"
        aria-label="Dismiss alert"
        onPointerEnter={hold(true)}
        onPointerLeave={hold(false)}
        onClick={() => {
          props.onDismiss(toast.id);
        }}
        onFocus={hold(true)}
        onBlur={hold(false)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * Pop-up alerts (FE-19, FE-20, F21): warnings in a polite status region, criticals in an alert region.
 * Each toast is a select button plus a dismiss (×) button; repeats show "×n".
 */
export function Toasts(props: ToastsProps): JSX.Element | null {
  const warnings = props.toasts.filter((t) => t.severity === 'warning');
  const criticals = props.toasts.filter((t) => t.severity === 'critical');
  return (
    <div class="toasts">
      {/* Both regions stay mounted so new toasts are announced. */}
      <ul role="alert" class="toast-list" aria-label="Critical alerts">
        {criticals.map((t) => (
          <Item key={t.id} toast={t} props={props} />
        ))}
      </ul>
      <ul role="status" aria-live="polite" class="toast-list" aria-label="Warnings">
        {warnings.map((t) => (
          <Item key={t.id} toast={t} props={props} />
        ))}
      </ul>
      {props.overflow > 0 ? (
        <button type="button" class="toast-more" onClick={props.onMore}>
          +{props.overflow} more alerts
        </button>
      ) : null}
    </div>
  );
}
