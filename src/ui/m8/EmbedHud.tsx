import type { JSX } from 'preact';
import { brand } from '../../config/brand';

export interface EmbedHudProps {
  readonly clock: string;
  readonly demand: string;
  readonly fullViewHref: string;
}

/** Compact overlay for embed mode (SH-8). */
export function EmbedHud(props: EmbedHudProps): JSX.Element {
  return (
    <aside class="panel glass embed-hud" aria-label={brand.appName}>
      <strong class="brand-name">{brand.appName}</strong>
      <time>{props.clock}</time>
      <span class="demand">{props.demand}</span>
      <a href={props.fullViewHref} target="_blank" rel="noopener noreferrer">
        Open full view ↗
      </a>
    </aside>
  );
}
