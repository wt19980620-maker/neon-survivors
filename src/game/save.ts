import type { MetaId } from './data';

export interface SaveData {
  gold: number;
  meta: Partial<Record<MetaId, number>>;
  best: { time: number; kills: number; level: number; wins: number };
  muted: boolean;
}

const KEY = 'neon-survivors-save-v1';

function defaults(): SaveData {
  return { gold: 0, meta: {}, best: { time: 0, kills: 0, level: 0, wins: 0 }, muted: false };
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      data = { ...data, ...parsed, best: { ...data.best, ...(parsed.best ?? {}) }, meta: { ...(parsed.meta ?? {}) } };
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
