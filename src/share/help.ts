// Keyboard and pointer shortcuts (SH-12, SH-12a; §21 J9, J10). The key handler and the help
// content both read this list, so they can't drift apart.

export interface Shortcut {
  /** What to press, as shown ("Drag", "Wheel", "P"). */
  readonly keys: string;
  readonly action: string;
  /** KeyboardEvent.key handled by the app's key handler (letters in lower case), when this is a key. */
  readonly key?: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Drag', action: 'Pan the map' },
  { keys: 'Wheel', action: 'Zoom in and out' },
  { keys: 'Area buttons', action: 'Fly to an area of the hub or the airport' },
  { keys: 'P', action: 'Save a screenshot of the 3D view', key: 'p' },
  { keys: '?', action: 'Open this help', key: '?' },
  { keys: 'Right-drag', action: 'Rotate and tilt the view' },
  { keys: 'Pinch', action: 'Zoom and rotate on a touch screen' },
  { keys: 'Click', action: 'Select a car, person or bay, and follow it' },
  { keys: 'Esc', action: 'Leave the tour, close a dialog, or clear the selection', key: 'Escape' },
];

/** The five shown in the quick-help popover. */
export const QUICK_HELP: readonly Shortcut[] = SHORTCUTS.slice(0, 5);
