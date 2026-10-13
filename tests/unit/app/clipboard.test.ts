import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../../../src/app/clipboard';

// Requirement SH-7; architecture §21 J8: true when copied, false (never a throw) otherwise.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText (SH-7)', () => {
  it('writes through the async Clipboard API', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('https://x/?area=wash')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/?area=wash');
  });

  it('is false when the API refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('is false when the API is missing or throws synchronously', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyText('x')).resolves.toBe(false);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: () => {
          throw new Error('boom');
        },
      },
    });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
