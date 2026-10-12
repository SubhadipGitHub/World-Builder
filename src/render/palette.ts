import { brand } from '../config/brand';

/** Scene colours (W-3). Dark graphite first (D6), with a light variant for the theme toggle (X-4). */
export interface Palette {
  readonly background: string;
  readonly ground: string;
  /** Lawn colour (V-4): green in both themes, a little deeper in the dark one. */
  readonly grass: string;
  readonly asphalt: string;
  readonly walkway: string;
  readonly marking: string;
  readonly clay: string;
  readonly roof: string;
  readonly glass: string;
  readonly accent: string;
  readonly chassis: string;
  readonly tow: string;
  readonly foliage: string;
  readonly trunk: string;
  readonly skyLight: string;
  readonly groundLight: string;
  /** Neutral fleet paint colours, picked per car from its id. */
  readonly carPaints: readonly string[];
  readonly peopleColours: readonly string[];
}

export const darkPalette: Palette = {
  background: brand.colors.dark.bg,
  ground: '#2A2B33',
  grass: '#557F43',
  asphalt: '#3A3C46',
  walkway: '#6B6E7A',
  marking: '#D9DBE2',
  clay: '#E8E4DC',
  roof: '#CFCAC0',
  glass: '#33405A',
  accent: brand.colors.accent,
  chassis: '#1B1C21',
  tow: '#E07B24',
  foliage: '#4F8F5B',
  trunk: '#8A6A4A',
  skyLight: '#DCE4F2',
  groundLight: '#3A3530',
  carPaints: ['#F2F2F0', '#C9CDD4', '#8D939E', '#4A4F5A', '#7A8FA6', '#B8473E'],
  peopleColours: ['#E36B5A', '#5A8FE3', '#E3C35A', '#6BC48A', '#B07AE3', '#E39A5A'],
};

export const lightPalette: Palette = {
  ...darkPalette,
  background: brand.colors.light.bg,
  ground: '#D7DAE1',
  grass: '#7EAE5C',
  asphalt: '#B3B7C2',
  walkway: '#ECEEF2',
  marking: '#FFFFFF',
  clay: '#F4F1EB',
  roof: '#E3DED4',
  glass: '#5C7395',
  chassis: '#2A2C33',
  foliage: '#5FA36C',
  skyLight: '#FFFFFF',
  groundLight: '#B9B3A9',
};
