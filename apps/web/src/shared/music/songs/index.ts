import type { Song } from '../synth';
import { arena } from './arena';
import { bajaj } from './bajaj';
import { arena as bajajArena } from './bajaj-arena';
import { pantai } from './bajaj-pantai';
import { puncak } from './bajaj-puncak';
import { catur } from './catur';
import { congklak } from './congklak';
import { dapur } from './dapur';
import { juragan } from './juragan';
import { karung } from './karung';
import { kata } from './kata';
import { kerupuk } from './kerupuk';
import { kompak } from './kompak';
import { kuis } from './kuis';
import { lari } from './lari';
import { ludo } from './ludo';
import { masak } from './masak';
import { menu } from './menu';
import { rusun } from './rusun';
import { tarik } from './tarik';
import { ular } from './ular';
import { wilayah } from './wilayah';

/** Every song by track id. Games pick one with `game.music(id)`. */
export const SONGS = {
  menu,
  kuis,
  tarik,
  rusun,
  bajaj,
  'bajaj-pantai': pantai,
  'bajaj-puncak': puncak,
  'bajaj-arena': bajajArena,
  masak,
  ular,
  congklak,
  kerupuk,
  karung,
  kompak,
  ludo,
  catur,
  arena,
  wilayah,
  lari,
  kata,
  juragan,
  dapur,
} satisfies Record<string, Song>;

export type Track = keyof typeof SONGS;

export const TRACKS = Object.keys(SONGS) as Track[];

// A Map, not `id in SONGS`: ids like "constructor" must not resolve to Object.prototype members.
const BY_ID = new Map<string, Song>(Object.entries(SONGS));

/** The song for a track id, or undefined for ids that don't exist. */
export function getSong(id: string): Song | undefined {
  return BY_ID.get(id);
}
