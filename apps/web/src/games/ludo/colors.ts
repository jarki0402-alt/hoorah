/**
 * The eight pawn colours (no violet). Bright, flat and easy to tell apart on any screen; the first
 * four are the classic board's.
 */
import type { ColorId } from './logic';

export interface Swatch {
  main: string;
  /** Outline/shadow shade. */
  dark: string;
  /** Tint for bases and the home column. */
  light: string;
}

export const SWATCH: Record<ColorId, Swatch> = {
  0: { main: '#E8473A', dark: '#9E2A20', light: '#F7B8B0' },
  1: { main: '#22A85A', dark: '#136B39', light: '#A9E2BF' },
  2: { main: '#F7BE16', dark: '#A87A00', light: '#FCE39A' },
  3: { main: '#2E7CE6', dark: '#184D99', light: '#AACBF5' },
  4: { main: '#F06BA0', dark: '#A8386A', light: '#F9C4D9' },
  5: { main: '#12B3A6', dark: '#0A746C', light: '#A6E6E0' },
  6: { main: '#F28C28', dark: '#A85A0E', light: '#FAD1A6' },
  7: { main: '#8A5A2B', dark: '#5A3816', light: '#D9BFA3' },
};
