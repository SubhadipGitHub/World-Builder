import type { JSX } from 'preact';
import type { KioskView } from './types';

export interface KioskCaptionProps {
  readonly view: KioskView;
  readonly onExit: () => void;
}

/** Kiosk caption bar, with the paused chip and "Exit tour" (SH-9, SH-10). */
export function KioskCaption(props: KioskCaptionProps): JSX.Element {
  const { view } = props;
  return (
    <section class="panel glass kiosk-caption" aria-label="Tour" aria-live="polite">
      <div class="kiosk-line">
        <strong class="kiosk-area">{view.area}</strong>
        {/* The clock and countdown tick constantly: hidden from screen readers to keep the live region calm. */}
        <span class="kiosk-clock" aria-hidden="true">
          {view.clock}
        </span>
        {/* On the overview the fact is the demand readout itself: show it once. */}
        {view.demand !== view.fact ? <span class="demand">{view.demand}</span> : null}
      </div>
      <p class="kiosk-fact">{view.fact}</p>
      <div class="kiosk-controls">
        {view.resumeInSec !== null ? (
          <span class="chip" aria-hidden="true">
            {`Tour paused · resumes in ${String(Math.max(0, Math.ceil(view.resumeInSec)))} s`}
          </span>
        ) : null}
        <button type="button" onClick={props.onExit}>
          Exit tour
        </button>
      </div>
    </section>
  );
}
