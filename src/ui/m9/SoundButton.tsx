import type { JSX } from 'preact';

export interface SoundButtonProps {
  readonly on: boolean;
  readonly onToggle: (on: boolean) => void;
}

/** Top-bar speaker toggle (FE-18): a button named "Sound" with aria-pressed; the click is the audio gesture. */
export function SoundButton(props: SoundButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="icon-button sound-button"
      aria-label="Sound"
      aria-pressed={props.on ? 'true' : 'false'}
      title={props.on ? 'Sound on (M)' : 'Sound off (M)'}
      onClick={() => {
        props.onToggle(!props.on);
      }}
    >
      <span aria-hidden="true">{props.on ? '🔊' : '🔇'}</span>
    </button>
  );
}
