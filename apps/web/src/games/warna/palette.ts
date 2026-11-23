/**
 * Colours of the worlds (owner 2026-11-22: a livelier backdrop per world) and their small
 * picture for the world cards. Pure data and SVG strings; used by the textures, the stage
 * thumbnails and the phone's world menu.
 */
import type { BiomeId } from './levels';

export interface BiomePalette {
  /** Backdrop gradient, top to bottom. */
  sky: [string, string, string];
  /** Far and near silhouettes of the backdrop. */
  far: string;
  near: string;
  /** Glow spots and light shafts. */
  glow: string;
  shaft: string;
  rock: string;
  rockDeep: string;
  rockEdge: string;
  /** Lip on top of a ledge (grass, moss, sand, snow). */
  lip: string;
  lipHi: string;
  /** Decoration on ledges (flowers, crystals). */
  accent: string;
  accentHi: string;
  /** Floating motes: fireflies, spores, dust. */
  mote: number;
}

export const PALETTE: Record<BiomeId, BiomePalette> = {
  hutan: {
    sky: ['#2F7A66', '#3E8C5C', '#1C4A3A'],
    far: '#25624F',
    near: '#1B4C3D',
    glow: 'rgba(255,233,150,0.20)',
    shaft: 'rgba(255,240,190,0.07)',
    rock: '#5A3D27',
    rockDeep: '#46301F',
    rockEdge: '#7A5534',
    lip: '#5FAE3A',
    lipHi: '#9BDB5C',
    accent: '#FFE27A',
    accentHi: '#FFFFFF',
    mote: 0xfff2a8,
  },
  gua: {
    sky: ['#0A2731', '#0B1F26', '#0E3440'],
    far: '#0E3440',
    near: '#163A40',
    glow: 'rgba(47,213,197,0.16)',
    shaft: 'rgba(232,255,249,0.04)',
    rock: '#14262B',
    rockDeep: '#0F2A30',
    rockEdge: '#2A4A52',
    lip: '#3FA34D',
    lipHi: '#7BD36A',
    accent: '#4FE3C8',
    accentHi: '#9FF3E6',
    mote: 0xffe27a,
  },
  gurun: {
    sky: ['#E9B872', '#F6DDA8', '#D9A45C'],
    far: '#D9A45C',
    near: '#C48A45',
    glow: 'rgba(255,240,200,0.25)',
    shaft: 'rgba(255,255,255,0.06)',
    rock: '#C98E4A',
    rockDeep: '#B07A3E',
    rockEdge: '#E8B86A',
    lip: '#E8B86A',
    lipHi: '#FFE0A6',
    accent: '#FFC928',
    accentHi: '#FFFFFF',
    mote: 0xfff0d0,
  },
  salju: {
    sky: ['#9FC4DD', '#DCEBF5', '#B8D3E6'],
    far: '#9FB7C9',
    near: '#8FA9BC',
    glow: 'rgba(255,255,255,0.25)',
    shaft: 'rgba(255,255,255,0.06)',
    rock: '#8FA9BC',
    rockDeep: '#7A93A6',
    rockEdge: '#B8D0E0',
    lip: '#FFFFFF',
    lipHi: '#E6F4FF',
    accent: '#A8DDF5',
    accentHi: '#FFFFFF',
    mote: 0xffffff,
  },
  awan: {
    sky: ['#7CC3EE', '#BFE3FA', '#E6F5FF'],
    far: '#FFFFFF',
    near: '#EAF6FF',
    glow: 'rgba(255,255,255,0.3)',
    shaft: 'rgba(255,255,255,0.08)',
    rock: '#F2B33D',
    rockDeep: '#D99A28',
    rockEdge: '#FFD27A',
    lip: '#FFFFFF',
    lipHi: '#FFFFFF',
    accent: '#FFFFFF',
    accentHi: '#FFFFFF',
    mote: 0xffffff,
  },
};

const RED = '#F2453D';
const BLUE = '#2F7DF6';

function pair(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="8" fill="${RED}" stroke="#fff" stroke-width="2"/><circle cx="${x + 22}" cy="${y}" r="8" fill="${BLUE}" stroke="#fff" stroke-width="2"/>`;
}

/** Inner SVG of a world's card picture, 160×120. */
export function biomeScene(id: BiomeId): string {
  const p = PALETTE[id];
  const sky = `<rect width="160" height="120" fill="${p.sky[1]}"/><rect width="160" height="50" fill="${p.sky[0]}" opacity="0.6"/>`;
  const floor = `<rect y="98" width="160" height="22" fill="${p.rock}"/><rect y="98" width="160" height="5" fill="${p.lip}"/>`;
  switch (id) {
    case 'hutan':
      return `${sky}<path d="M0 98 L18 40 L36 98Z M118 98 L138 30 L158 98Z" fill="${p.far}"/><rect x="40" y="46" width="8" height="52" fill="#6B4A2B"/><circle cx="44" cy="40" r="22" fill="#3E8E3A"/><circle cx="100" cy="44" r="18" fill="#4FA444"/><rect x="96" y="50" width="7" height="48" fill="#6B4A2B"/><rect x="60" y="70" width="40" height="5" rx="2" fill="#B07A43"/><path d="M128 98 q6 -14 12 0z" fill="#FFE27A"/>${floor}${pair(62, 90)}`;
    case 'gua':
      return `${sky}<path d="M0 0 h160 v10 l-12 22 -12 -22 -16 28 -14 -28 -18 18 -14 -18 -18 26 -16 -26 -14 16 -14 -16 -12 20Z" fill="${p.near}"/><path d="M130 98 l7 -20 7 20z M141 98 l5 -12 5 12z" fill="${p.accent}"/><rect x="88" y="78" width="20" height="20" fill="#B07A43" stroke="#6B4423" stroke-width="2"/>${floor}${pair(36, 90)}`;
    case 'gurun':
      return `${sky}<circle cx="128" cy="26" r="14" fill="#FFC928"/><path d="M60 98 L100 40 L140 98Z" fill="${p.far}"/><path d="M100 40 L140 98 H120Z" fill="${p.near}"/><rect x="12" y="66" width="36" height="32" fill="${p.rock}"/><rect x="12" y="66" width="36" height="5" fill="${p.lip}"/>${floor}${pair(56, 90)}`;
    case 'salju':
      return `${sky}<path d="M0 98 L44 48 L76 80 L112 36 L160 98Z" fill="${p.far}"/><path d="M32 62 L44 48 L54 58 L44 62Z M100 50 L112 36 L124 50 L112 48Z" fill="#FFFFFF"/><rect x="96" y="92" width="56" height="6" fill="#A8DDF5"/>${floor}${pair(30, 90)}`;
    case 'awan':
      return `${sky}<g fill="#FFFFFF"><circle cx="30" cy="84" r="14"/><circle cx="48" cy="76" r="18"/><circle cx="68" cy="84" r="13"/><circle cx="118" cy="46" r="12"/><circle cx="134" cy="40" r="15"/><circle cx="150" cy="46" r="11"/></g><rect x="84" y="64" width="44" height="7" rx="3.5" fill="${p.rock}"/>${pair(36, 62)}`;
  }
}
