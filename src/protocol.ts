import type { CookMode, RecipeId } from './recipes';
import type { CustomerState, CustomerTypeId, Mood } from './customers';
import type { UpgradeId } from './upgrades';
import type { GameOverStats } from './ui';

/**
 * Host-authoritative multiplayer protocol (JSON over WebRTC data channels).
 * Guests send intents ('act') and poses; the host runs the shop and
 * broadcasts compact snapshots ~10×/s plus one-off events.
 */

export type Phase = 'menu' | 'playing' | 'dayEnd' | 'over';

export interface SessionSnap {
  r: RecipeId;
  m: CookMode;
  b: number;
  i: number;
  a: string[];
  tm: [number, number] | null;
}

export interface PlayerSnap {
  id: string;
  name: string;
  shirt: string;
  apron: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: SessionSnap | null;
  h: number | null;
}

export interface CustSnap {
  id: number;
  ty: CustomerTypeId;
  o: RecipeId;
  x: number;
  z: number;
  ry: number;
  st: CustomerState;
  mood: Mood;
  react: number;
  ln: string | null;
  f: number;
  w: boolean;
  c: RecipeId | null;
}

export interface ItemSnap {
  uid: number;
  r: RecipeId;
  n: number;
  sl: number;
  hb: string | null;
}

export interface ResultsSnap {
  day: number;
  completed: number;
  lost: number;
  earnings: number;
  reputation: number;
  maxReputation: number;
  money: number;
  nextQuota: number;
}

export interface Snapshot {
  t: 'snap';
  ph: Phase;
  pa: boolean;
  name: string;
  trim: string;
  money: number;
  rep: number;
  day: number;
  lvl: number;
  handled: number;
  quota: number;
  owned: UpgradeId[];
  heavy: boolean;
  rush: number;
  cs: CustSnap[];
  it: ItemSnap[];
  pl: PlayerSnap[];
  res?: ResultsSnap;
  over?: GameOverStats;
}

/** Player-targeted or broadcast feedback. */
export type GameEvent =
  | { k: 'panel'; text: string; tone: 'info' | 'good' | 'bad' }
  | { k: 'toast'; text: string; kind: 'info' | 'good' | 'bad' | 'gold' }
  | { k: 'sfx'; name: string }
  | { k: 'float'; text: string; kind: 'gold' | 'bad'; x: number; y: number; z: number }
  | { k: 'look'; x: number; y: number; z: number }
  | { k: 'close' };

export type Intent = 'start' | 'act' | 'collect' | 'discard' | 'pick' | 'drop' | 'serve';
