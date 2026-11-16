/** The four pawn colours. Bright, flat and easy to tell apart on any screen. */
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
};
