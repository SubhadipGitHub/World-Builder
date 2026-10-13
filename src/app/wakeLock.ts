// Screen wake lock for the kiosk tour (SH-9): feature-detected, re-acquired when the page becomes
// visible again (the browser drops it when hidden), and silent where unsupported.

export interface WakeLockHandle {
  release(): void;
}

export function requestWakeLock(): WakeLockHandle {
  const api = (navigator as { wakeLock?: WakeLock }).wakeLock;
  let active = true;
  let sentinel: WakeLockSentinel | null = null;

  const acquire = (): void => {
    if (!api || document.visibilityState !== 'visible') return;
    api
      .request('screen')
      .then((s) => {
        if (active) sentinel = s;
        else void s.release();
      })
      .catch(() => undefined);
  };
  const onVisibility = (): void => {
    if (active && document.visibilityState === 'visible') acquire();
  };

  document.addEventListener('visibilitychange', onVisibility);
  acquire();
  return {
    release() {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
  };
}
