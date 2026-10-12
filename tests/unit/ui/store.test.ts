import { effect } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { createUiStore } from '../../../src/ui/store';

describe('createUiStore', () => {
  it('starts with no selection on the overview', () => {
    const s = createUiStore();
    expect(s.selection.value).toBeNull();
    expect(s.area.value).toBe('overview');
  });

  it('selects, clears and switches area', () => {
    const s = createUiStore();
    s.select({ kind: 'agent', id: 'GL-PGW-00001' });
    expect(s.selection.value).toEqual({ kind: 'agent', id: 'GL-PGW-00001' });
    s.select({ kind: 'resource', id: 'wash1' });
    expect(s.selection.value).toEqual({ kind: 'resource', id: 'wash1' });
    s.clearSelection();
    expect(s.selection.value).toBeNull();
    s.setArea('energy');
    expect(s.area.value).toBe('energy');
  });

  it('notifies subscribers once per real change', () => {
    const s = createUiStore();
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(s.selection.value);
    });
    s.select({ kind: 'agent', id: 'x' });
    s.select({ kind: 'agent', id: 'x' });
    s.clearSelection();
    stop();
    expect(seen).toHaveLength(3);
  });
});
