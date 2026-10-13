// M8 share and presentation state passed to the dashboard (requirements §13, architecture §21 J5).

export type UiMode = 'normal' | 'embed' | 'kiosk';

/** What the kiosk caption shows. */
export interface KioskView {
  readonly area: string;
  readonly clock: string;
  readonly demand: string;
  readonly fact: string;
  /** Seconds until the tour resumes; null while touring. */
  readonly resumeInSec: number | null;
}

export interface ShareState {
  readonly mode: UiMode;
  readonly kiosk: KioskView | null;
  /** The current view's link without `embed` (for "Open full view"). */
  readonly fullViewHref: string;
  /** Short confirmation for the live region ("Link copied"), or null. */
  readonly notice: string | null;
  /** The link to copy by hand when the clipboard failed, or null. */
  readonly copyFallback: string | null;
  readonly helpOpen: boolean;
}

export interface ShareActions {
  readonly onCopyLink: () => void;
  readonly onCloseCopyFallback: () => void;
  readonly onStartTour: () => void;
  readonly onExitTour: () => void;
  readonly onScreenshot: () => void;
  readonly onOpenHelp: () => void;
  readonly onCloseHelp: () => void;
}
