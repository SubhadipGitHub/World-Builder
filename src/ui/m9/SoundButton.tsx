import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';

export interface SoundButtonProps {
  readonly on: boolean;
  readonly onToggle: (on: boolean) => void;
}

/** Top-bar speaker toggle (FE-18): a button named "Sound" with aria-pressed; the click is the audio gesture. */
export function SoundButton(props: SoundButtonProps): JSX.Element | null {
  return notImplemented(props);
}
