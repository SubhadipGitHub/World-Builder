import { describe, expect, it } from 'vitest';
import { assemble, paint, place, triangleCount } from '../../../../src/render/kit/assemble';
import { roundedBox } from '../../../../src/render/kit/shapes';
import { colours, extent, rgb } from './helpers';

describe('paint', () => {
  it('adds one colour to every vertex', () => {
    const g = paint(roundedBox(1, 1, 1, 0.1), '#F2B33D');
    const cs = colours(g);
    expect(cs).toHaveLength(g.getAttribute('position').count);
    const gold = rgb('#F2B33D');
    for (const c of cs) for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(gold[i] as number, 5);
  });
});

describe('place', () => {
  it('scales, rotates, then translates', () => {
    const moved = extent(place(roundedBox(1, 1, 1, 0.1), { x: 5, y: 0.5 })).center;
    expect(moved.x).toBeCloseTo(5, 5);
    expect(moved.y).toBeCloseTo(0.5, 5);
    expect(moved.z).toBeCloseTo(0, 5);
    const turned = extent(place(roundedBox(2, 1, 1, 0.1), { rotY: Math.PI / 2 })).size;
    expect(turned.x).toBeCloseTo(1, 5);
    expect(turned.z).toBeCloseTo(2, 5);
    expect(extent(place(roundedBox(1, 1, 1, 0.1), { scale: [2, 1, 1] })).size.x).toBeCloseTo(2, 5);
  });
});

describe('assemble (P1)', () => {
  it('merges painted parts, keeping each part’s colour', () => {
    const red = paint(roundedBox(1, 1, 1, 0.1), '#FF0000');
    const blue = paint(place(roundedBox(1, 1, 1, 0.1), { x: 3 }), '#0000FF');
    const n1 = red.getAttribute('position').count;
    const n2 = blue.getAttribute('position').count;
    const g = assemble([red, blue]);
    expect(g.getAttribute('position').count).toBe(n1 + n2);
    expect(g.getAttribute('normal').count).toBe(n1 + n2);
    const cs = colours(g);
    expect(cs[0]).toEqual([1, 0, 0]);
    expect(cs[n1 + n2 - 1]).toEqual([0, 0, 1]);
    expect(extent(g).size.x).toBeCloseTo(4, 5);
  });

  it('rejects unpainted parts and empty lists', () => {
    expect(() => assemble([roundedBox(1, 1, 1, 0.1)])).toThrow();
    expect(() => assemble([])).toThrow();
  });

  it('counts triangles', () => {
    const g = paint(roundedBox(1, 1, 1, 0.1), '#FFFFFF');
    expect(triangleCount(g)).toBe(g.getAttribute('position').count / 3);
  });
});
