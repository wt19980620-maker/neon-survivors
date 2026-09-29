import type { CharId, MapId, MetaId, WeaponId } from './data';

/** Lifetime totals, used by achievements. Only updated when a run ends. */
export interface LifetimeStats {
  kills: number;
  runs: number;
  boss1: number;
  boss2: number;
  evolved: WeaponId[];
  winChars: CharId[];
  bestMaxed: number;
  untouched: number;
}

export interface SaveData {
  gold: number;
  meta: Partial<Record<MetaId, number>>;
  best: { time: number; kills: number; level: number; wins: number };
  stats: LifetimeStats;
  achievements: string[];
  selectedChar: CharId;
  muted: boolean;
  music: boolean;
  /** 'high' renders at up to 2.5× pixel density, 'smooth' caps it at 1.5× for weaker phones */
  quality: 'high' | 'smooth';
  sfxVolume: number;
  musicVolume: number;
  /** camera shake strength: 1 full, 0.5 weak, 0 off */
  shake: number;
  damageNumbers: boolean;
  selectedMap: MapId;
}

const KEY = 'neon-survivors-save-v1';

function defaults(): SaveData {
  return {
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0, wins: 0 },
    stats: { kills: 0, runs: 0, boss1: 0, boss2: 0, evolved: [], winChars: [], bestMaxed: 0, untouched: 0 },
    achievements: [],
    selectedChar: 'runner',
    muted: false,
    music: true,
    quality: 'high',
    sfxVolume: 1,
    musicVolume: 1,
    shake: 1,
    damageNumbers: true,
    selectedMap: 'grid',
  };
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // merge nested objects so saves from older versions pick up new fields
      data = {
        ...data,
        ...parsed,
        best: { ...data.best, ...(parsed.best ?? {}) },
        stats: { ...data.stats, ...(parsed.stats ?? {}) },
        meta: { ...(parsed.meta ?? {}) },
        achievements: [...(parsed.achievements ?? [])],
      };
      // the on/off music toggle became a volume setting
      if (parsed.music === false && parsed.musicVolume === undefined) {
        data.musicVolume = 0;
        data.music = true;
      }
      if (!parsed.stats) {
        // pre-achievement save: infer what we can from the best records so progress isn't lost
        const b = data.best;
        data.stats.runs = b.time > 0 ? 1 : 0;
        data.stats.kills = b.kills;
        data.stats.boss1 = b.wins;
        data.stats.boss2 = b.wins;
        if (b.wins > 0) data.stats.winChars = ['runner'];
      }
    }
  } catch {
    // storage unavailable or corrupt: play with defaults
  }
  cache = data;
  return data;
}

export function writeSave(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export function metaRank(id: MetaId): number {
  return loadSave().meta[id] ?? 0;
}
