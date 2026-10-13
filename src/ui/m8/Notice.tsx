import type { JSX } from 'preact';

/** Polite live region for short confirmations ("Link copied"); always present so it is announced. */
export function Notice(props: { readonly text: string | null }): JSX.Element {
  return (
    <div role="status" aria-live="polite" class="notice">
      {props.text ?? ''}
    </div>
  );
}
