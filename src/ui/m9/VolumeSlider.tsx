import type { JSX } from 'preact';

export interface VolumeSliderProps {
  /** 0–100. */
  readonly value: number;
  readonly onChange: (value: number) => void;
}

/** User-menu volume (FE-18): a range input labelled "Volume", 0–100 in steps of 5. */
export function VolumeSlider(props: VolumeSliderProps): JSX.Element {
  return (
    <label class="volume">
      <span>Volume</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={props.value}
        aria-label="Volume"
        onInput={(e) => {
          props.onChange(Number(e.currentTarget.value));
        }}
      />
    </label>
  );
}
