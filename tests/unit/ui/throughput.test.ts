import { describe, expect, it } from 'vitest';
import type { ResourceView } from '../../../src/sim/world';
import { createThroughputTracker } from '../../../src/ui/throughput';

const wash = (occupantId: string | null): ResourceView[] => [{ id: 'wash1', kind: 'wash', occupantId, queueLength: 0, progress: null, online: true }];

describe('createThroughputTracker (I-4)', () => {
  it('counts an occupant leaving as a completion', () => {
    const t = createThroughputTracker();
    t.observe(wash('A'), 0);
    t.observe(wash('A'), 100);
    expect(t.perHour('wash1')).toBe(0);
    t.observe(wash(null), 200);
    expect(t.perHour('wash1')).toBe(1);
    expect(t.lastCompletion('wash1')).toBe(200);
    expect(t.lastOccupant('wash1')).toBe('A');
  });

  it('counts a direct hand-over to the next car', () => {
    const t = createThroughputTracker();
    t.observe(wash('A'), 0);
    t.observe(wash(null), 200);
    t.observe(wash('B'), 300);
    t.observe(wash('C'), 400);
    expect(t.perHour('wash1')).toBe(2);
    expect(t.lastOccupant('wash1')).toBe('B');
  });

  it('only counts the trailing simulated hour', () => {
    const t = createThroughputTracker();
    t.observe(wash('A'), 0);
    t.observe(wash(null), 400);
    t.observe(wash(null), 3_999);
    expect(t.perHour('wash1')).toBe(1);
    t.observe(wash(null), 4_000);
    expect(t.perHour('wash1')).toBe(0);
    expect(t.lastCompletion('wash1')).toBe(400);
  });

  it('knows nothing about unseen units', () => {
    const t = createThroughputTracker();
    expect(t.perHour('gate9')).toBe(0);
    expect(t.lastCompletion('gate9')).toBeNull();
    expect(t.lastOccupant('gate9')).toBeNull();
  });
});
