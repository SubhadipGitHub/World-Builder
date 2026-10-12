/** Minimal surface of `document` needed to probe for WebGL 2 (injectable for tests). */
export interface CanvasFactory {
  createElement(tag: 'canvas'): { getContext(type: 'webgl2'): unknown };
}

/** True if a WebGL 2 context can be created (N-8). Never throws. */
export function hasWebGL2(doc: CanvasFactory): boolean {
  try {
    return Boolean(doc.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}
