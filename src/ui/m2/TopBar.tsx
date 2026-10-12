import type { JSX } from 'preact';
import type { WeatherMode } from '../../config/weather';
import type { AreaId, AreaLayout } from '../../layout/hub';
import type { DayNight } from '../../render/environment';
import { notImplemented } from '../../shared/notImplemented';
import type { Snapshot } from '../../sim/world';
import type { Alert } from '../alerts';
import type { SearchResult } from '../search';
import type { Theme } from '../theme';

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
}

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
 */
export function TopBar(props: TopBarProps): JSX.Element {
  return notImplemented(props);
}
