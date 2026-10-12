import { describe, expect, it } from 'vitest';
import { createInstanceRegistry } from '../../../src/render/registry';

describe('createInstanceRegistry', () => {
  it('assigns stable slots and maps both ways', () => {
    const r = createInstanceRegistry(4);
    expect(r.assign('a')).toBe(0);
    expect(r.assign('b')).toBe(1);
    expect(r.assign('a')).toBe(0);
    expect(r.indexOf('b')).toBe(1);
    expect(r.idAt(1)).toBe('b');
    expect(r.idAt(3)).toBeUndefined();
    expect(r.count).toBe(2);
  });

  it('reuses the lowest freed slot', () => {
    const r = createInstanceRegistry(4);
    r.assign('a');
    r.assign('b');
    r.assign('c');
    r.release('a');
    expect(r.indexOf('a')).toBeUndefined();
    expect(r.assign('d')).toBe(0);
  });

  it('shrinks the draw count when the top slot is freed', () => {
    const r = createInstanceRegistry(4);
    r.assign('a');
    r.assign('b');
    r.release('b');
    expect(r.count).toBe(1);
    r.release('ghost');
    expect(r.count).toBe(1);
  });

  it('throws when full', () => {
    const r = createInstanceRegistry(1);
    r.assign('a');
    expect(() => r.assign('b')).toThrow();
    expect(r.capacity).toBe(1);
  });
});
