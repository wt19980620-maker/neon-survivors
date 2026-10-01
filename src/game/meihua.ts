import { ITEMS, LIMIT_BREAKS, MEIHUA, type LimitBreakId, type PassiveId, type WeaponId } from './data';
import { loadSave, writeSave, type MeihuaSave } from './save';

/** Anything 梅花花 can spend gold on in 局外强化. */
export type MeihuaGoodId = WeaponId | PassiveId | LimitBreakId;

const isLb = (id: MeihuaGoodId): id is LimitBreakId => id.startsWith('lb_');

export function meihua(): MeihuaSave {
  return loadSave().meihua;
}

export function itemLevel(id: WeaponId | PassiveId): number {
  return meihua().levels[id] ?? 0;
}

export function lbStacks(): number {
  return Object.values(meihua().lb).reduce((s, n) => s + (n ?? 0), 0);
}

/** Every slot filled and every item maxed: limit breaks open up. */
export function buildComplete(): boolean {
  const m = meihua();
  const maxed = (id: WeaponId | PassiveId) => itemLevel(id) >= ITEMS[id].maxLevel;
  return m.weapons.length >= MEIHUA.maxWeapons && m.passives.length >= MEIHUA.maxPassives
    && m.weapons.every(maxed) && m.passives.every(maxed);
}

export type Offer =
  | { kind: 'buy' | 'upgrade' | 'lb'; price: number; level: number }
  | { kind: 'maxed' | 'slotsFull' | 'lbLocked'; level: number };

/** What buying `id` would do right now, and for how much. */
export function offer(id: MeihuaGoodId): Offer {
  const m = meihua();
  if (isLb(id)) {
    const level = m.lb[id] ?? 0;
    if (!buildComplete()) return { kind: 'lbLocked', level };
    return { kind: 'lb', price: MEIHUA.lbBase + MEIHUA.lbStep * lbStacks(), level };
  }
  const def = ITEMS[id];
  const level = itemLevel(id);
  if (level >= def.maxLevel) return { kind: 'maxed', level };
  const weapon = def.kind === 'weapon';
  if (level === 0) {
    const used = weapon ? m.weapons.length : m.passives.length;
    if (used >= (weapon ? MEIHUA.maxWeapons : MEIHUA.maxPassives)) return { kind: 'slotsFull', level };
    return { kind: 'buy', price: weapon ? MEIHUA.buyWeapon : MEIHUA.buyPassive, level };
  }
  return { kind: 'upgrade', price: (weapon ? MEIHUA.weaponPerLevel : MEIHUA.passivePerLevel) * level, level };
}

/** Spend account gold on `id`. Returns false if it can't be bought or isn't affordable. */
export function purchase(id: MeihuaGoodId): boolean {
  const s = loadSave();
  const o = offer(id);
  if (!('price' in o) || s.gold < o.price) return false;
  s.gold -= o.price;
  const m = s.meihua;
  if (isLb(id)) {
    m.lb[id] = (m.lb[id] ?? 0) + 1;
  } else {
    if (o.kind === 'buy') {
      if (ITEMS[id].kind === 'weapon') m.weapons.push(id as WeaponId);
      else m.passives.push(id as PassiveId);
    }
    m.levels[id] = o.level + 1;
  }
  writeSave();
  return true;
}

export function unlockMeihua(): boolean {
  const s = loadSave();
  if (s.meihua.unlocked || s.gold < MEIHUA.unlock) return false;
  s.gold -= MEIHUA.unlock;
  s.meihua.unlocked = true;
  writeSave();
  return true;
}

export const LB_IDS = LIMIT_BREAKS.map((l) => l.id);
