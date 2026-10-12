import { describe, expect, it } from 'vitest';
import { hasWebGL2 } from '../../../src/app/webgl';

const factory = (getContext: () => unknown) => ({ createElement: () => ({ getContext }) });

describe('hasWebGL2 (N-8)', () => {
  it('is true when a webgl2 context can be created', () => {
    expect(hasWebGL2(factory(() => ({})))).toBe(true);
  });

  it('is false when the context is unavailable', () => {
    expect(hasWebGL2(factory(() => null))).toBe(false);
  });

  it('is false, without throwing, when probing throws', () => {
    expect(
      hasWebGL2(
        factory(() => {
          throw new Error('blocked');
        }),
      ),
    ).toBe(false);
  });
});
