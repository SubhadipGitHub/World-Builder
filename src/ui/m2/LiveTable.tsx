import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';
import type { CheckoutRow, FleetRow, QueueRow } from '../tables';

export interface LiveTableProps {
  readonly fleet: readonly FleetRow[];
  readonly queue: readonly QueueRow[];
  readonly checkouts: readonly CheckoutRow[];
  /** Selects a vehicle (any tab's row click). */
  readonly onSelect: (vehicleId: string) => void;
  readonly clockAt: (simTimeSec: number) => string;
}

/**
 * Tabbed live table (D-6), region labelled "Live table": role="tablist" with tabs
 * "Active fleet", "Turnaround & service queue", "Customer checkout log" (aria-selected),
 * one role="tabpanel" with a <table>. Rows are focusable; click or Enter selects the vehicle.
 * Columns:
 *  - Active fleet: Vehicle, Model, Status, Battery / fuel, Location
 *  - Queue: Bay, Vehicle, Service, Remaining
 *  - Checkout log: Time, Agreement, Vehicle, Tier, Gate
 */
export function LiveTable(props: LiveTableProps): JSX.Element {
  return notImplemented(props);
}
