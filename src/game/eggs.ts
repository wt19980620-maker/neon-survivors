import { EGG, EGG_STATS, type CharId, type EggStat, type EggStatDef } from './data';
import { loadSave, writeSave } from './save';

export const EGG_BY_ID = Object.fromEntries(EGG_STATS.map((e) => [e.id, e])) as Record<EggStat, EggStatDef>;

export function eggCounts(char: CharId): Partial<Record<EggStat, number>> {
  return loadSave().eggs[char] ?? {};
}

export function eggTotal(char: CharId): number {
  return Object.values(eggCounts(char)).reduce((a, b) => a + (b ?? 0), 0);
}

/** Total bonus in a stat's own units (0.06 = +6%, 15 = +15 hp). */
export function eggBonus(char: CharId, stat: EggStat): number {
  return (eggCounts(char)[stat] ?? 0) * EGG_BY_ID[stat].step;
}

/** One egg for `char`: a random stat goes up for good. Returns the stat. */
export function grantEgg(char: CharId): EggStat {
  const save = loadSave();
  const stat = EGG_STATS[Math.floor(Math.random() * EGG_STATS.length)].id;
  const counts = (save.eggs[char] ??= {});
  counts[stat] = (counts[stat] ?? 0) + 1;
  writeSave();
  return stat;
}

export function eggPrice(char: CharId): number {
  return EGG.priceBase + EGG.priceStep * eggTotal(char);
}

/** Buy an egg with account gold. Returns the stat it raised, or null if unaffordable. */
export function buyEgg(char: CharId): EggStat | null {
  const save = loadSave();
  const price = eggPrice(char);
  if (save.gold < price) return null;
  save.gold -= price;
  return grantEgg(char);
}

/** "伤害 +6% · 生命 +10 …" for every stat that has eggs. */
export function eggSummary(char: CharId): string[] {
  const c = eggCounts(char);
  return EGG_STATS.filter((s) => (c[s.id] ?? 0) > 0).map((s) => s.label((c[s.id] ?? 0) * s.step));
}
