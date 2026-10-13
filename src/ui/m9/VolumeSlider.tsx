import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';

export interface VolumeSliderProps {
  /** 0–100. */
  readonly value: number;
  readonly onChange: (value: number) => void;
}

/** User-menu volume (FE-18): a range input labelled "Volume", 0–100 in steps of 5. */
export function VolumeSlider(props: VolumeSliderProps): JSX.Element | null {
  return notImplemented(props);
}
