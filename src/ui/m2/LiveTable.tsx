import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { CheckoutRow, FleetRow, QueueRow } from '../tables';

export interface LiveTableProps {
  readonly fleet: readonly FleetRow[];
  readonly queue: readonly QueueRow[];
  readonly checkouts: readonly CheckoutRow[];
  /** Selects a vehicle (any tab's row click). */
  readonly onSelect: (vehicleId: string) => void;
  readonly clockAt: (simTimeSec: number) => string;
}

type Tab = 'fleet' | 'queue' | 'checkouts';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'fleet', label: 'Active fleet' },
  { id: 'queue', label: 'Turnaround & service queue' },
  { id: 'checkouts', label: 'Customer checkout log' },
];

interface Table {
  readonly headers: readonly string[];
  readonly rows: readonly { readonly key: string; readonly vehicleId: string; readonly cells: readonly string[] }[];
}

/**
 * Tabbed live table (D-6), region labelled "Live table": role="tablist" with tabs
 * "Active fleet", "Turnaround & service queue", "Customer checkout log" (aria-selected),
 * one role="tabpanel" with a <table>. Rows are focusable; click or Enter selects the vehicle.
 * Columns:
 *  - Active fleet: Vehicle, Model, Status, Battery / fuel, Location
 *  - Queue: Bay, Vehicle, Service, Remaining
 *  - Checkout log: Time, Agreement, Vehicle, Class, Rate, Tier, Gate (Class and Rate: M9, FE-9)
 */
export function LiveTable({ fleet, queue, checkouts, onSelect, clockAt }: LiveTableProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('fleet');

  const table: Table =
    tab === 'fleet'
      ? {
          headers: ['Vehicle', 'Model', 'Status', 'Battery / fuel', 'Location'],
          rows: fleet.map((r) => ({ key: r.id, vehicleId: r.id, cells: [r.id, r.model, r.status, r.energy, r.location] })),
        }
      : tab === 'queue'
        ? {
            headers: ['Bay', 'Vehicle', 'Service', 'Remaining'],
            rows: queue.map((r) => ({ key: r.unitId, vehicleId: r.vehicleId, cells: [r.bay, r.vehicleId, r.service, r.remaining] })),
          }
        : {
            headers: ['Time', 'Agreement', 'Vehicle', 'Class', 'Rate', 'Tier', 'Gate'],
            rows: checkouts.map((r) => ({
              key: r.agreementNo,
              vehicleId: r.vehicleId,
              cells: [clockAt(r.simTimeSec), r.agreementNo, r.vehicleId, r.model, r.rate, r.tier, r.gate],
            })),
          };

  return (
    <section class="panel glass live-table" aria-label="Live table">
      <div role="tablist" aria-label="Live table views" class="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id ? 'true' : 'false'}
            aria-controls="live-table-panel"
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="live-table-panel" aria-labelledby={`tab-${tab}`} class="table-scroll">
        <table>
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr
                key={r.key}
                tabIndex={0}
                onClick={() => {
                  onSelect(r.vehicleId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect(r.vehicleId);
                }}
              >
                {r.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length === 0 ? <p class="note">Nothing to show yet</p> : null}
      </div>
    </section>
  );
}
