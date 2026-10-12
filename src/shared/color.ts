const HEX = /^#([0-9a-f]{6})$/i;

function luminance(hex: string): number {
  const m = HEX.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #RRGGBB, got "${hex}"`);
  const n = parseInt(m[1], 16);
  const channel = (shift: number): number => {
    const c = ((n >> shift) & 0xff) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours, in [1, 21]. Throws on malformed input. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
