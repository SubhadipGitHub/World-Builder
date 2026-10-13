import { brand } from '../config/brand';
import type { AreaId } from '../layout/hub';
import type { Snapshot } from '../sim/world';
import { demandText } from '../ui/demand';
import { facilityStatuses, type FacilityId } from '../ui/facilities';

// Screenshot caption and file name, and the kiosk's live fact per area (SH-9, SH-11; §21 J6, J7).

/** "GoldLane Hub · Pacific Gateway · <area> · <clock> · <weather>". */
export function screenshotCaption(parts: { readonly area: string; readonly clock: string; readonly weather: string }): string {
  return [brand.appName, brand.siteName, parts.area, parts.clock, parts.weather].join(' · ');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** goldlane-hub-YYYYMMDD-HHMMSS.png in the viewer's local time. */
export function screenshotFileName(date: Date): string {
  const day = `${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `goldlane-hub-${day}-${time}.png`;
}

/** The facility whose status each area's caption shows. */
const AREA_FACILITY: Partial<Record<AreaId, FacilityId>> = { return: 'return', wash: 'wash', energy: 'evHub', lot: 'lot' };

/**
 * One live line for the kiosk caption:
 * - overview: the demand readout;
 * - return, wash, energy: "<facility name> · <facility detail>";
 * - lot: "Ready Lot · <detail> · Counter: N waiting";
 * - airport: "Next landing in m:ss", or "No landings due".
 */
export function kioskFact(area: AreaId, snapshot: Snapshot, nextLandingSec: number | null): string {
  if (area === 'overview') return demandText(snapshot.demand);
  if (area === 'airport') {
    if (nextLandingSec === null) return 'No landings due';
    const s = Math.max(0, Math.ceil(nextLandingSec));
    return `Next landing in ${String(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  const id = AREA_FACILITY[area];
  const status = id ? facilityStatuses(snapshot).find((f) => f.id === id) : undefined;
  if (!status) return '';
  const line = `${status.name} · ${status.detail}`;
  return area === 'lot' ? `${line} · Counter: ${String(snapshot.counterQueue)} waiting` : line;
}
