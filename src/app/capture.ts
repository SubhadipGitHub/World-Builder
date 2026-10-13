// Screenshot capture (SH-11, §21 J7). Call captureFrame right after the frame is rendered, in the
// same task, so the WebGL drawing buffer still holds the image (no preserveDrawingBuffer needed).

export const CAPTURE_MAX_WIDTH = 4096;
const CAPTION_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Copies `source` (scaled to at most `maxWidth`), adds the caption strip, and encodes a PNG. */
export function captureFrame(source: HTMLCanvasElement, caption: string, maxWidth: number = CAPTURE_MAX_WIDTH): Promise<Blob> {
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No 2D canvas for the screenshot'));
  // Synchronous copy: this is the moment the frame is captured.
  ctx.drawImage(source, 0, 0, width, height);

  // Caption strip along the bottom, sized to the image.
  const strip = Math.max(28, Math.round(height * 0.045));
  const pad = Math.round(strip * 0.5);
  ctx.fillStyle = 'rgba(20, 21, 26, 0.72)';
  ctx.fillRect(0, height - strip, width, strip);
  ctx.fillStyle = '#F2B33D';
  ctx.fillRect(0, height - strip, Math.max(3, Math.round(strip * 0.12)), strip);
  ctx.font = `600 ${String(Math.round(strip * 0.46))}px ${CAPTION_FONT}`;
  ctx.fillStyle = '#F4F5F8';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, pad, height - strip / 2, width - 2 * pad);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}

/** Saves the blob through a temporary <a download> on an object URL, then revokes it. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL goes away.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
