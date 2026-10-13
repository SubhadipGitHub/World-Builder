import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { dialogKeys, useDialogFocus } from './dialog';

export interface CopyLinkDialogProps {
  readonly link: string;
  readonly onClose: () => void;
}

/** Manual-copy fallback when the clipboard is unavailable (SH-7). */
export function CopyLinkDialog(props: CopyLinkDialogProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useDialogFocus(box, input);
  useLayoutEffect(() => {
    input.current?.select();
  }, [props.link]);
  return (
    <div class="modal-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="copy-title" class="panel glass copy-dialog" onKeyDown={dialogKeys(props.onClose)}>
        <h2 id="copy-title">Copy this link</h2>
        <p class="note">The clipboard is not available here. Press Ctrl+C (⌘C on a Mac) to copy.</p>
        <input ref={input} type="text" aria-label="Link" readOnly value={props.link} />
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
