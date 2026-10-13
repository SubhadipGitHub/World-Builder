import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { SHORTCUTS } from '../../share/help';
import { dialogKeys, useDialogFocus } from './dialog';

export interface HelpDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly version: string;
  readonly buildDate: string;
}

const KPIS: readonly (readonly [string, string])[] = [
  ['Turnaround time', 'Average minutes from a car being returned to it standing ready in the lot, over the last two hub hours.'],
  ['Fleet utilisation', 'Share of the fleet out on rent right now.'],
  ['EV state of charge', 'Average charge of the electric cars waiting in the ready lot.'],
  ['Revenue today', 'Rental income booked since hub midnight, at each booked class’s daily rate. “At risk” is what customers waiting over 20 minutes at the counter would pay.'],
];

const LEGEND: readonly (readonly [string, string])[] = [
  ['OK', 'The building is working normally.'],
  ['Busy', 'Every unit is in use, or a queue has built up.'],
  ['Offline', 'At least one unit is closed by a what-if scenario.'],
  ['Demand ×1.6 · Morning peak', 'How busy the hub is now against the daily average, including weather and any surge.'],
];

/** Full help (SH-12): controls, legend, KPIs, fictional-brand note, version. Traps focus. */
export function HelpDialog(props: HelpDialogProps): JSX.Element | null {
  return props.open ? <HelpBody {...props} /> : null;
}

function HelpBody(props: HelpDialogProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, close);
  return (
    <div class="modal-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="help-title" class="panel glass help-dialog" onKeyDown={dialogKeys(props.onClose)}>
        <header class="panel-header">
          <h2 id="help-title">Help</h2>
          <button ref={close} type="button" class="icon-button" aria-label="Close help" onClick={props.onClose}>
            ✕
          </button>
        </header>
        <h3>Controls</h3>
        <dl class="help-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys}>
              <dt>
                <kbd>{s.keys}</kbd>
              </dt>
              <dd>{s.action}</dd>
            </div>
          ))}
        </dl>
        <h3>Legend</h3>
        <dl class="help-list">
          {LEGEND.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>Key metrics</h3>
        <dl class="help-list">
          {KPIS.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>Sound and pop-up alerts</h3>
        <p>
          Sound starts off. The speaker button or <kbd>M</kbd> turns it on; the volume is in the user menu. Warnings and critical alerts also pop up at the top
          right (click one to go to it); “Pop-up alerts” in the user menu turns them off.
        </p>
        <h3>Speed and what-if</h3>
        <p>
          The speed buttons run the hub clock at 15×, 30× or 45× real time, or pause it. What-if scenarios close units, change crews or add a demand surge, and
          the KPI cards then compare against a twin of the hub running without them.
        </p>
        <p class="note">All companies, brands, airlines and names in this world are fictional.</p>
        <p class="note">
          Version {props.version} · built {props.buildDate}
        </p>
      </div>
    </div>
  );
}
