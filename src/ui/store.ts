import { signal, type Signal } from '@preact/signals';
import type { AreaId } from '../layout/hub';

export type Selection = { readonly kind: 'agent'; readonly id: string } | { readonly kind: 'resource'; readonly id: string } | null;

/** UI state shared by the overlay and the camera rig (architecture §3, ui/store). */
export interface UiStore {
  readonly selection: Signal<Selection>;
  readonly area: Signal<AreaId>;
  select(selection: Selection): void;
  clearSelection(): void;
  setArea(id: AreaId): void;
}

const same = (a: Selection, b: Selection): boolean => a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** Starts with no selection and the 'overview' area. */
export function createUiStore(): UiStore {
  const selection = signal<Selection>(null);
  const area = signal<AreaId>('overview');
  return {
    selection,
    area,
    select(next) {
      if (!same(selection.value, next)) selection.value = next;
    },
    clearSelection() {
      selection.value = null;
    },
    setArea(id) {
      area.value = id;
    },
  };
}
