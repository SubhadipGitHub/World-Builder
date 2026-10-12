import type { JSX } from 'preact';
import type { AreaId, AreaLayout } from '../../layout/hub';

export interface AreaSwitcherProps {
  readonly areas: readonly AreaLayout[];
  readonly active: AreaId;
  readonly onSelect: (id: AreaId) => void;
}

/**
 * Area switcher (I-5): a <nav aria-label="Areas"> with one button per area,
 * aria-pressed on the active one. Buttons are native, so keyboard use is built in (N-5).
 */
export function AreaSwitcher({ areas, active, onSelect }: AreaSwitcherProps): JSX.Element {
  return (
    <nav class="panel area-switcher" aria-label="Areas">
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={a.id === active ? 'true' : 'false'}
          onClick={() => {
            onSelect(a.id);
          }}
        >
          {a.label}
        </button>
      ))}
    </nav>
  );
}
