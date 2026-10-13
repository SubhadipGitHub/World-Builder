import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { QUICK_HELP } from '../../share/help';

export interface HelpButtonProps {
  readonly onOpen: () => void;
  /** False on touch-only devices: no popover, a tap opens the dialog (SH-12a). */
  readonly hoverCapable: boolean;
}

const TIP_ID = 'quick-help';

/** "?" button with the quick-help popover on hover or focus (SH-12a, §21 J10). */
export function HelpButton(props: HelpButtonProps): JSX.Element {
  const [tip, setTip] = useState(false);
  const show = (): void => {
    if (props.hoverCapable) setTip(true);
  };
  const hide = (): void => {
    setTip(false);
  };
  return (
    <span class="help-anchor">
      <button
        type="button"
        class="icon-button help-button"
        aria-label="Help"
        aria-describedby={tip ? TIP_ID : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          setTip(false);
          props.onOpen();
        }}
      >
        ?
      </button>
      {tip ? (
        <div role="tooltip" id={TIP_ID} class="panel glass quick-help">
          <ul>
            {QUICK_HELP.map((s) => (
              <li key={s.keys}>
                <kbd>{s.keys}</kbd> {s.action}
              </li>
            ))}
          </ul>
          <p class="note">Click for full help</p>
        </div>
      ) : null}
    </span>
  );
}
