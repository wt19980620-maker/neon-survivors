import type { BossId, CharId, EggStat, GameMode, MapId, MetaId, WeaponId } from './data';

/** Shape of the retired gold-built 梅花花 (removed 2026-10), only read to refund its gold. */
interface OldMeihuaSave {
  unlocked?: boolean;
  weapons?: string[];
  passives?: string[];
  levels?: Record<string, number>;
  lb?: Record<string, number>;
}

/** Gold spent on the old 梅花花 under its old prices. */
function oldMeihuaSpend(m: OldMeihuaSave): number {
  let gold = m.unlocked ? 1000 : 0;
  const levelCost = (base: number, per: number, lvl: number) => (lvl > 0 ? base + (per * lvl * (lvl - 1)) / 2 : 0);
  for (const id of m.weapons ?? []) gold += levelCost(100, 60, m.levels?.[id] ?? 1);
  for (const id of m.passives ?? []) gold += levelCost(80, 50, m.levels?.[id] ?? 1);
  const stacks = Object.values(m.lb ?? {}).reduce((a, b) => a + b, 0);
  gold += 150 * stacks + (50 * stacks * (stacks - 1)) / 2;
  return gold;
}

/** One-shot message for the main menu (e.g. a refund), cleared once read. */
let saveNotice = '';
export function takeSaveNotice() {
  const n = saveNotice;
  saveNotice = '';
  return n;
}

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
  /** longest endless-mode survival, seconds */
  endlessBest: number;
  /** every boss kind ever defeated */
  bossKinds: BossId[];
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
  selectedMode: GameMode;
  /** leaderboard nickname; empty until the player picks one */
  nickname: string;
  /** anonymous id so the board keeps one best run per player */
  playerId: string;
  /** optional code shared with friends for a private board */
  friendGroup: string;
  /** 金蛋 per character: how many eggs went into each stat */
  eggs: Partial<Record<CharId, Partial<Record<EggStat, number>>>>;
}

const KEY = 'neon-survivors-save-v1';

function defaults(): SaveData {
  return {
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0, wins: 0 },
    stats: { kills: 0, runs: 0, boss1: 0, boss2: 0, evolved: [], winChars: [], bestMaxed: 0, untouched: 0, endlessBest: 0, bossKinds: [] },
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
    selectedMode: 'standard',
    nickname: '',
    playerId: '',
    friendGroup: '',
    eggs: {},
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
        eggs: { ...(parsed.eggs ?? {}) },
      };
      // the gold-built 梅花花 was retired: give back everything spent on her
      const old = (parsed as { meihua?: OldMeihuaSave }).meihua;
      delete (data as { meihua?: unknown }).meihua;
      if (old) {
        const refund = oldMeihuaSpend(old);
        if (refund > 0) {
          data.gold += refund;
          saveNotice = `梅花花改版，已退还 ${refund} 金币`;
        }
        cache = data;
        writeSave();
      }
      // the on/off music toggle became a volume setting
      if (parsed.music === false && parsed.musicVolume === undefined) {
        data.musicVolume = 0;
        data.music = true;
      }
      if (parsed.stats && !parsed.stats.bossKinds) {
        // saves from before the boss roster grew: the only bosses were the warden and the void lord
        if (data.stats.boss1 > 0) data.stats.bossKinds.push('warden');
        if (data.stats.boss2 > 0) data.stats.bossKinds.push('void');
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
