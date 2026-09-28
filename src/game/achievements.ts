import { CHARACTERS, type CharId, type WeaponId } from './data';
import { loadSave, writeSave, type LifetimeStats, type SaveData } from './save';

/** What happened in the current (or just-finished) run. */
export interface RunSnapshot {
  char: CharId;
  kills: number;
  level: number;
  time: number;
  boss1: boolean;
  boss2: boolean;
  evolved: WeaponId[];
  maxedWeapons: number;
  /** game time of the first damage taken, -1 if untouched so far */
  firstHurt: number;
  ended: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  gold: number;
  target: number;
  /**
   * Progress towards `target`. `s` never includes the current run; `r` is the
   * run in progress (or just finished), null when viewed from the menu.
   */
  value: (s: SaveData, r: RunSnapshot | null) => number;
}

const union = <T>(a: T[], b: T[]) => new Set([...a, ...b]).size;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_run', name: '初次登场', desc: '完成一局游戏', gold: 50, target: 1,
    value: (s, r) => s.stats.runs + (r?.ended ? 1 : 0),
  },
  {
    id: 'boss1', name: '首领克星', desc: '击败猩红守望者', gold: 50, target: 1,
    value: (s, r) => s.stats.boss1 + (r?.boss1 ? 1 : 0),
  },
  {
    id: 'run_kills', name: '疾风骤雨', desc: '单局击杀 1,500 个敌人', gold: 50, target: 1500,
    value: (s, r) => Math.max(s.best.kills, r?.kills ?? 0),
  },
  {
    id: 'evolve1', name: '突破极限', desc: '进化任意一把武器', gold: 50, target: 1,
    value: (s, r) => union(s.stats.evolved, r?.evolved ?? []),
  },
  {
    id: 'level25', name: '登峰造极', desc: '单局达到 25 级', gold: 50, target: 25,
    value: (s, r) => Math.max(s.best.level, r?.level ?? 0),
  },
  {
    id: 'kills_1k', name: '百战之躯', desc: '累计击杀 1,000 个敌人', gold: 80, target: 1000,
    value: (s, r) => s.stats.kills + (r?.kills ?? 0),
  },
  {
    id: 'survive8', name: '坚持到底', desc: '单局存活 8 分钟', gold: 100, target: 480,
    value: (s, r) => Math.floor(Math.max(s.best.time, r?.time ?? 0)),
  },
  {
    id: 'untouched', name: '毫发无伤', desc: '前 3 分钟不受到任何伤害', gold: 120, target: 1,
    value: (s, r) => s.stats.untouched + (r && r.time >= 180 && (r.firstHurt < 0 || r.firstHurt >= 180) ? 1 : 0),
  },
  {
    id: 'full_build', name: '全副武装', desc: '单局同时持有 4 把满级武器', gold: 150, target: 4,
    value: (s, r) => Math.max(s.stats.bestMaxed, r?.maxedWeapons ?? 0),
  },
  {
    id: 'kills_10k', name: '万夫莫敌', desc: '累计击杀 10,000 个敌人', gold: 200, target: 10000,
    value: (s, r) => s.stats.kills + (r?.kills ?? 0),
  },
  {
    id: 'win', name: '虚空终结者', desc: '击败最终首领虚空之主', gold: 300, target: 1,
    value: (s, r) => s.stats.boss2 + (r?.boss2 ? 1 : 0),
  },
  {
    id: 'evolve_all', name: '进化大师', desc: '累计进化全部 8 种武器', gold: 300, target: 8,
    value: (s, r) => union(s.stats.evolved, r?.evolved ?? []),
  },
  {
    id: 'win3', name: '众志成城', desc: '用 3 个不同角色通关', gold: 500, target: 3,
    value: (s, r) => union(s.stats.winChars, r?.boss2 ? [r.char] : []),
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])) as Record<string, AchievementDef>;

export function isDone(id: string) {
  return loadSave().achievements.includes(id);
}

export function isCharUnlocked(id: CharId) {
  const c = CHARACTERS.find((x) => x.id === id)!;
  return !c.unlock || isDone(c.unlock);
}

/** Characters unlocked by an achievement. */
export function charUnlockedBy(achId: string) {
  return CHARACTERS.find((c) => c.unlock === achId);
}

/**
 * Marks newly met achievements as done, pays out their gold immediately and
 * persists. Returns the ones completed by this call.
 */
export function checkAchievements(run: RunSnapshot | null): AchievementDef[] {
  const s = loadSave();
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    if (a.value(s, run) >= a.target) {
      s.achievements.push(a.id);
      s.gold += a.gold;
      fresh.push(a);
    }
  }
  if (fresh.length) writeSave();
  return fresh;
}

/** Folds a finished run into the lifetime stats. Call after the final achievement check. */
export function commitRun(run: RunSnapshot) {
  const s = loadSave();
  const st: LifetimeStats = s.stats;
  st.kills += run.kills;
  st.runs += 1;
  if (run.boss1) st.boss1 += 1;
  if (run.boss2) st.boss2 += 1;
  st.evolved = [...new Set([...st.evolved, ...run.evolved])];
  if (run.boss2 && !st.winChars.includes(run.char)) st.winChars.push(run.char);
  st.bestMaxed = Math.max(st.bestMaxed, run.maxedWeapons);
  if (run.time >= 180 && (run.firstHurt < 0 || run.firstHurt >= 180)) st.untouched += 1;
  s.best.time = Math.max(s.best.time, run.time);
  s.best.kills = Math.max(s.best.kills, run.kills);
  s.best.level = Math.max(s.best.level, run.level);
  if (run.boss2) s.best.wins++;
  writeSave();
}
