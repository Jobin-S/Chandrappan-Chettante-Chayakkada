import type { CookMode } from './recipes';

/** Local persistence for customization and settings (never required to play). */

export type ViewPreference = 'fp' | 'overview';

export interface Profile {
  shopName: string;
  trim: string;
  shirt: string;
  apron: string;
  mode: CookMode;
  view: ViewPreference;
  muted: boolean;
  /** Your name in multiplayer rooms. */
  playerName: string;
}

export const DEFAULT_PROFILE: Profile = {
  shopName: 'Chandrappan Chettante Chayakkada',
  trim: '#245C3C',
  shirt: '#5E93B6',
  apron: '#DB6846',
  mode: 'simple',
  view: 'fp',
  muted: false,
  playerName: '',
};

const KEY = 'chayakkada.profile.v1';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const p = JSON.parse(raw) as Partial<Profile>;
    return { ...DEFAULT_PROFILE, ...p, shopName: (p.shopName ?? '').trim() || DEFAULT_PROFILE.shopName };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) – the game still works */
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------- run progress

/** Saved at the start of each business day so a run can be continued. */
export interface RunSave {
  day: number;
  money: number;
  reputation: number;
  streak: number;
  completed: number;
  lost: number;
  earnings: number;
  owned: string[];
}

const RUN_KEY = 'chayakkada.run.v1';

export function saveRun(r: RunSave) {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function loadRun(): RunSave | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunSave;
    return typeof r.day === 'number' && r.reputation > 0 ? r : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}
