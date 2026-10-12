import { describe, expect, it } from 'vitest';
import { createZoneManager } from '../../../../src/sim/traffic/zones';

describe('createZoneManager (architecture §4.3)', () => {
  it('grants a free zone to the first requester and blocks others until release', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z1', { id: 'b', priority: 2, arrivedAt: 2 });
    expect(z.tryAcquire('z1', 'a', true)).toBe(true);
    expect(z.holder('z1')).toBe('a');
    expect(z.tryAcquire('z1', 'b', true)).toBe(false);
    z.release('z1', 'a');
    expect(z.tryAcquire('z1', 'b', true)).toBe(true);
  });

  it('orders by arrival, then higher priority, then id', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'car-9', priority: 2, arrivedAt: 5 });
    z.request('z1', { id: 'car-2', priority: 2, arrivedAt: 5 });
    z.request('z1', { id: 'tow', priority: 4, arrivedAt: 5 });
    z.request('z1', { id: 'early', priority: 1, arrivedAt: 3 });
    expect(z.queue('z1')).toEqual(['early', 'tow', 'car-2', 'car-9']);
  });

  it('is strict FIFO: a non-head agent cannot jump the queue', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z1', { id: 'b', priority: 2, arrivedAt: 2 });
    expect(z.tryAcquire('z1', 'b', true)).toBe(false);
    expect(z.holder('z1')).toBeNull();
  });

  it('applies the box rule: no grant while downstream is not clear', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z1', { id: 'b', priority: 2, arrivedAt: 2 });
    expect(z.tryAcquire('z1', 'a', false)).toBe(false);
    expect(z.holder('z1')).toBeNull();
    expect(z.tryAcquire('z1', 'b', true)).toBe(false);
    expect(z.tryAcquire('z1', 'a', true)).toBe(true);
  });

  it('removes the holder from the queue and reports holding on repeat calls', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.tryAcquire('z1', 'a', true);
    expect(z.queue('z1')).toEqual([]);
    expect(z.tryAcquire('z1', 'a', false)).toBe(true);
  });

  it('treats repeated requests as idempotent', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 9 });
    expect(z.queue('z1')).toEqual(['a']);
    z.tryAcquire('z1', 'a', true);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 10 });
    expect(z.queue('z1')).toEqual([]);
    expect(z.holder('z1')).toBe('a');
  });

  it('cancel() leaves the queue and lets the next agent move up', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z1', { id: 'b', priority: 2, arrivedAt: 2 });
    z.cancel('z1', 'a');
    z.cancel('z1', 'ghost');
    expect(z.tryAcquire('z1', 'b', true)).toBe(true);
  });

  it('throws when a non-holder releases, or on unknown zones', () => {
    const z = createZoneManager(['z1']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.tryAcquire('z1', 'a', true);
    expect(() => z.release('z1', 'b')).toThrow();
    expect(() => z.holder('nope')).toThrow();
    expect(() => z.request('nope', { id: 'a', priority: 1, arrivedAt: 0 })).toThrow();
  });

  it('keeps zones independent', () => {
    const z = createZoneManager(['z1', 'z2']);
    z.request('z1', { id: 'a', priority: 2, arrivedAt: 1 });
    z.request('z2', { id: 'b', priority: 2, arrivedAt: 1 });
    expect(z.tryAcquire('z1', 'a', true)).toBe(true);
    expect(z.tryAcquire('z2', 'b', true)).toBe(true);
  });
});
