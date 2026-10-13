import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { brand } from '../../config/brand';
import { weather as weatherTable, weatherModes, type WeatherMode } from '../../config/weather';
import type { AreaId, AreaLayout } from '../../layout/hub';
import type { DayNight } from '../../render/environment';
import type { Snapshot } from '../../sim/world';
import type { Alert } from '../alerts';
import { demandText } from '../demand';
import { formatClock } from '../format';
import { AreaSwitcher } from '../m1/AreaSwitcher';
import { search, type SearchResult } from '../search';
import type { Theme } from '../theme';
import { SpeedControl, type Speed } from '../m4/SpeedControl';
import { HelpButton } from '../m8/HelpButton';

export interface TopBarProps {
  readonly snapshot: Snapshot | null;
  readonly unitIds: readonly string[];
  readonly areas: readonly AreaLayout[];
  readonly activeArea: AreaId;
  readonly onArea: (id: AreaId) => void;
  readonly weather: WeatherMode;
  readonly onWeather: (mode: WeatherMode) => void;
  readonly dayNight: DayNight;
  readonly onDayNight: (value: DayNight) => void;
  readonly theme: Theme;
  readonly onTheme: (theme: Theme) => void;
  readonly alerts: readonly Alert[];
  readonly unread: number;
  /** Called when the alert list opens (marks alerts read). */
  readonly onOpenAlerts: () => void;
  readonly onAlert: (alert: Alert) => void;
  readonly onPick: (result: SearchResult) => void;
  /** Simulation speed (S-18): 0 = paused, 1–3 = 15× / 30× / 45× (D30). */
  readonly speed: Speed;
  readonly onSpeed: (speed: Speed) => void;
  /** Active-scenario chips (S-7); a click opens the What-if drawer. */
  readonly chips: readonly string[];
  /** Opens the What-if drawer (S-6). Button labelled "What-if scenarios". */
  readonly onOpenWhatIf: () => void;
  /** Building labels on/off (I-4): role="switch" "Building labels" in the user menu. */
  readonly labelsOn: boolean;
  /** Demand the hub is experiencing (R-7): shown next to the clock with aria-label "Demand". */
  readonly demand: { readonly factor: number; readonly period: string } | null;
  readonly onLabels: (on: boolean) => void;
  /** M8 (§13): "Copy link" and "Start tour" in the user menu, a "Save screenshot" button and the help button. */
  readonly onCopyLink: () => void;
  readonly onStartTour: () => void;
  readonly onScreenshot: () => void;
  readonly onOpenHelp: () => void;
  /** M9 (FE-18): speaker button (aria-pressed) next to the alerts; volume slider in the user menu (0–100). */
  readonly sound: boolean;
  readonly onSound: (on: boolean) => void;
  readonly volume: number;
  readonly onVolume: (volume: number) => void;
  /** M9 (FE-20): role="switch" "Pop-up alerts" in the user menu. */
  readonly toastsOn: boolean;
  readonly onToasts: (on: boolean) => void;
}

const DAY_NIGHT: readonly { readonly value: DayNight; readonly label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
];

const LISTBOX_ID = 'search-results';

/** True where the primary pointer can hover (quick help on hover, SH-12a); assumed true without matchMedia. */
const hoverCapable = (): boolean => typeof matchMedia !== 'function' || matchMedia('(hover: hover)').matches;

/**
 * Top bar (D-2), a glass panel:
 *  - brand: app name and hub name
 *  - search: input role="combobox" labelled "Search vehicles, plates, agreements or bays"; results in
 *    role="listbox" with role="option" items; ArrowDown/ArrowUp move, Enter or click picks
 *  - area switcher (existing component)
 *  - weather: <select> labelled "Weather" with the 4 modes (X-1)
 *  - clock: <time> labelled "Hub time", e.g. "08:05"
 *  - alerts: button labelled "Alerts, n unread"; opens a list; clicking an item calls onAlert
 *  - time of day: group labelled "Time of day" with Auto / Day / Night buttons (aria-pressed) (X-2)
 *  - user: button labelled "User menu"; its menu holds role="switch" "Light theme" (aria-checked) (X-4)
 *  - what-if (M4): "What-if scenarios" button, active-scenario chips (a list labelled "Active scenario",
 *    only while any lever is set) and the simulation speed control
 *  - share (M8): "Save screenshot" button, the "Help" button with quick help on hover, and "Copy link"
 *    and "Start tour" in the user menu
 */
export function TopBar(props: TopBarProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const results = props.snapshot ? search(query, props.snapshot, props.unitIds) : [];
  const open = results.length > 0;

  const pick = (r: SearchResult | undefined): void => {
    if (!r) return;
    props.onPick(r);
    setQuery('');
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setActive(-1);
    }
  };

  return (
    <header class="panel glass top-bar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <div>
          <p class="brand-name">{brand.appName}</p>
          <p class="brand-sub">{brand.hubName}</p>
        </div>
      </div>

      <div class="search">
        <input
          type="search"
          role="combobox"
          list={undefined}
          aria-label="Search vehicles, plates, agreements or bays"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `search-option-${String(active)}` : undefined}
          placeholder="Search ID, plate, agreement, bay"
          value={query}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        {open ? (
          <ul id={LISTBOX_ID} role="listbox" class="panel glass search-results">
            {results.map((r, i) => (
              <li
                key={`${r.kind}:${r.id}`}
                id={`search-option-${String(i)}`}
                role="option"
                aria-selected={i === active ? 'true' : 'false'}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  pick(r);
                }}
              >
                <span class="result-label">{r.label}</span>
                <span class="result-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <AreaSwitcher areas={props.areas} active={props.activeArea} onSelect={props.onArea} />

      <div class="scenario-bar">
        <button type="button" class="what-if-button" onClick={props.onOpenWhatIf}>
          What-if scenarios
        </button>
        {props.chips.length > 0 ? (
          <ul class="scenario-chips" aria-label="Active scenario">
            {props.chips.map((c) => (
              <li key={c}>
                <button type="button" class="chip" onClick={props.onOpenWhatIf}>
                  {c}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <SpeedControl speed={props.speed} onSpeed={props.onSpeed} />
      </div>

      <div class="controls">
        <select
          aria-label="Weather"
          value={props.weather}
          onChange={(e) => {
            props.onWeather(e.currentTarget.value as WeatherMode);
          }}
        >
          {weatherModes.map((m) => (
            <option key={m} value={m}>
              {weatherTable[m].label}
            </option>
          ))}
        </select>

        <div role="group" aria-label="Time of day" class="segmented">
          {DAY_NIGHT.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={props.dayNight === d.value ? 'true' : 'false'}
              onClick={() => {
                props.onDayNight(d.value);
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <time class="clock" aria-label="Hub time">
          {props.snapshot ? formatClock(props.snapshot.clockHours) : '--:--'}
        </time>

        {props.demand ? (
          <span class="demand" aria-label="Demand">
            {demandText(props.demand)}
          </span>
        ) : null}

        <button type="button" class="icon-button" aria-label="Save screenshot" title="Save screenshot (P)" onClick={props.onScreenshot}>
          <span aria-hidden="true">📷</span>
        </button>
        <HelpButton onOpen={props.onOpenHelp} hoverCapable={hoverCapable()} />

        <div class="menu-anchor">
          <button
            type="button"
            class="icon-button alerts-button"
            aria-label={`Alerts, ${String(props.unread)} unread`}
            aria-expanded={alertsOpen ? 'true' : 'false'}
            onClick={() => {
              if (!alertsOpen) props.onOpenAlerts();
              setAlertsOpen(!alertsOpen);
              setUserOpen(false);
            }}
          >
            <span aria-hidden="true">🔔</span>
            {props.unread > 0 ? (
              <span class="badge" aria-hidden="true">
                {props.unread}
              </span>
            ) : null}
          </button>
          {alertsOpen ? (
            <div class="panel glass menu alerts-menu">
              {props.alerts.length === 0 ? <p class="note">No alerts</p> : null}
              <ul role="list">
                {props.alerts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      class={`alert alert-${a.severity}`}
                      onClick={() => {
                        props.onAlert(a);
                        setAlertsOpen(false);
                      }}
                    >
                      {a.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div class="menu-anchor">
          <button
            type="button"
            class="user-chip"
            aria-label="User menu"
            aria-expanded={userOpen ? 'true' : 'false'}
            onClick={() => {
              setUserOpen(!userOpen);
              setAlertsOpen(false);
            }}
          >
            <span aria-hidden="true">OP</span>
          </button>
          {userOpen ? (
            <div class="panel glass menu user-menu">
              <p class="note">Operations · Shift lead</p>
              <button
                type="button"
                role="switch"
                aria-checked={props.theme === 'light' ? 'true' : 'false'}
                class="switch"
                onClick={() => {
                  props.onTheme(props.theme === 'light' ? 'dark' : 'light');
                }}
              >
                Light theme
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={props.labelsOn ? 'true' : 'false'}
                class="switch"
                onClick={() => {
                  props.onLabels(!props.labelsOn);
                }}
              >
                Building labels
              </button>
              <button
                type="button"
                class="menu-item"
                onClick={() => {
                  setUserOpen(false);
                  props.onCopyLink();
                }}
              >
                Copy link
              </button>
              <button
                type="button"
                class="menu-item"
                onClick={() => {
                  setUserOpen(false);
                  props.onStartTour();
                }}
              >
                Start tour
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
