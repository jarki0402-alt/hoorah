export const PROTOCOL_VERSION = 1;

/**
 * Room codes are 6 digits (owner decision, 2026-11-14): typed on the phone's number pad, easy to
 * read out loud, shown in two groups ("482 917"). About as many codes as the old 4 letters.
 */
export const ROOM_CODE_ALPHABET = '0123456789';
export const ROOM_CODE_LENGTH = 6;

export const LIMITS = {
  nameMax: 12,
  /** Max size of one JSON control/relay message in bytes. */
  messageBytes: 8 * 1024,
  /** Players allowed in a free room (product decision). */
  freePlayers: 2,
  /** Hard technical ceiling per room. */
  maxPlayers: 16,
  /** How long a dropped controller keeps its slot. */
  slotHoldMs: 120_000,
  /** How long a room survives without its screen. */
  screenHoldMs: 10 * 60_000,
  /** Rooms with no traffic at all are closed after this. */
  idleRoomMs: 30 * 60_000,
  /** Host role moves to someone else after the host has been gone this long. */
  hostHandoverMs: 30_000,
  /** Client heartbeat interval. */
  heartbeatMs: 2_000,
  /** Messages per second a single socket may send before being throttled. */
  messagesPerSecond: 60,
} as const;

export const FRUITS = [
  'semangka',
  'alpukat',
  'durian',
  'nanas',
  'jeruk',
  'stroberi',
  'mangga',
  'rambutan',
] as const;
export type Fruit = (typeof FRUITS)[number];

export const FRUIT_LABELS: Record<Fruit, string> = {
  semangka: 'Semangka',
  alpukat: 'Alpukat',
  durian: 'Durian',
  nanas: 'Nanas',
  jeruk: 'Jeruk',
  stroberi: 'Stroberi',
  mangga: 'Mangga',
  rambutan: 'Rambutan',
};

/** Player colors in join order. Repeats after 8 (shape badges come later). */
export const PLAYER_COLORS = [
  '#F2453D',
  '#2F8CFF',
  '#22B35E',
  '#FFC928',
  '#FF8A3D',
  '#FF5C9A',
  '#14B8A6',
  '#C4C7CC',
] as const;

export const PLAYER_COLOR_NAMES: Record<string, string> = {
  '#F2453D': 'Merah',
  '#2F8CFF': 'Biru',
  '#22B35E': 'Hijau',
  '#FFC928': 'Kuning',
  '#FF8A3D': 'Oranye',
  '#FF5C9A': 'Pink',
  '#14B8A6': 'Toska',
  '#C4C7CC': 'Abu',
};

/** WebSocket close codes used by the server. */
export const CLOSE = {
  replaced: 4001,
  kicked: 4002,
  roomClosed: 4003,
  version: 4004,
  badRequest: 4005,
} as const;
