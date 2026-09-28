import { COLORS } from './palette';

export type WeaponId = 'bolt' | 'orbit' | 'nova' | 'chain' | 'disc';
export type PassiveId =
  | 'might'
  | 'haste'
  | 'area'
  | 'amount'
  | 'speed'
  | 'magnet'
  | 'armor'
  | 'vitality'
  | 'growth';
export type ItemId = WeaponId | PassiveId;

/**
 * Generic per-level weapon numbers. Each weapon interprets `extra` differently:
 * orbit = orbit radius, nova = blast radius, chain = jump range, disc = throw range.
 */
export interface WeaponStats {
  damage: number;
  cooldown: number;
  count: number;
  pierce: number;
  area: number;
  speed: number;
  extra: number;
  knockback: number;
}

export interface ItemDef {
  id: ItemId;
  kind: 'weapon' | 'passive';
  name: string;
  icon: string;
  color: number;
  maxLevel: number;
  /** desc[i] describes what reaching level i+1 gives. */
  desc: string[];
}

function levels(base: WeaponStats, deltas: Partial<WeaponStats>[]): WeaponStats[] {
  const out = [base];
  for (const d of deltas) out.push({ ...out[out.length - 1], ...d });
  return out;
}

export const WEAPON_LEVELS: Record<WeaponId, WeaponStats[]> = {
  bolt: levels(
    { damage: 10, cooldown: 0.9, count: 1, pierce: 1, area: 1, speed: 520, extra: 0, knockback: 70 },
    [{ count: 2 }, { damage: 15 }, { count: 3, pierce: 2 }, { damage: 20, cooldown: 0.75 }],
  ),
  orbit: levels(
    { damage: 8, cooldown: 0.5, count: 2, pierce: 0, area: 1, speed: 3.2, extra: 72, knockback: 140 },
    [{ count: 3 }, { damage: 12, extra: 88 }, { count: 4 }, { count: 5, speed: 4.2, damage: 15 }],
  ),
  nova: levels(
    { damage: 16, cooldown: 3.0, count: 1, pierce: 0, area: 1, speed: 0, extra: 120, knockback: 300 },
    [{ extra: 145 }, { damage: 26 }, { cooldown: 2.4 }, { damage: 36, extra: 175, count: 2 }],
  ),
  chain: levels(
    { damage: 12, cooldown: 1.6, count: 1, pierce: 3, area: 1, speed: 0, extra: 150, knockback: 30 },
    [{ pierce: 4 }, { damage: 17 }, { count: 2 }, { pierce: 6, cooldown: 1.3, damage: 20 }],
  ),
  disc: levels(
    { damage: 12, cooldown: 1.8, count: 1, pierce: 999, area: 1, speed: 440, extra: 250, knockback: 110 },
    [{ count: 2 }, { damage: 18 }, { area: 1.3, extra: 300 }, { count: 3, damage: 24 }],
  ),
};

export const ITEMS: Record<ItemId, ItemDef> = {
  bolt: {
    id: 'bolt', kind: 'weapon', name: '能量飞弹', icon: 'icon_bolt', color: COLORS.bolt, maxLevel: 5,
    desc: ['向最近的敌人发射能量飞弹', '飞弹数量 +1', '伤害 +5', '飞弹 +1，穿透 +1', '伤害 +5，冷却 -25%'],
  },
  orbit: {
    id: 'orbit', kind: 'weapon', name: '环绕刃', icon: 'icon_orbit', color: COLORS.orbit, maxLevel: 5,
    desc: ['召唤绕身旋转的利刃', '利刃 +1', '伤害 +4，旋转半径扩大', '利刃 +1', '利刃 +1，转速与伤害提升'],
  },
  nova: {
    id: 'nova', kind: 'weapon', name: '脉冲新星', icon: 'icon_nova', color: COLORS.nova, maxLevel: 5,
    desc: ['周期性释放冲击波，击退周围敌人', '冲击范围扩大', '伤害 +10', '冷却 -20%', '伤害 +10，范围扩大，连放两次'],
  },
  chain: {
    id: 'chain', kind: 'weapon', name: '连锁闪电', icon: 'icon_chain', color: COLORS.chain, maxLevel: 5,
    desc: ['召唤在敌人之间跳跃的闪电', '跳跃次数 +1', '伤害 +5', '每次释放 2 道闪电', '跳跃 +2，冷却缩短，伤害提升'],
  },
  disc: {
    id: 'disc', kind: 'weapon', name: '回旋飞盘', icon: 'icon_disc', color: COLORS.disc, maxLevel: 5,
    desc: ['投掷穿透一切、会飞回来的飞盘', '飞盘 +1', '伤害 +6', '体积与射程提升', '飞盘 +1，伤害 +6'],
  },
  might: {
    id: 'might', kind: 'passive', name: '力量', icon: 'icon_might', color: 0xff6b6b, maxLevel: 5,
    desc: Array(5).fill('所有伤害 +10%'),
  },
  haste: {
    id: 'haste', kind: 'passive', name: '急速', icon: 'icon_haste', color: 0x7cf8ff, maxLevel: 5,
    desc: Array(5).fill('武器冷却 -8%'),
  },
  area: {
    id: 'area', kind: 'passive', name: '领域', icon: 'icon_area', color: 0xb58cff, maxLevel: 5,
    desc: Array(5).fill('攻击范围 +10%'),
  },
  amount: {
    id: 'amount', kind: 'passive', name: '多重', icon: 'icon_amount', color: 0xffd24d, maxLevel: 2,
    desc: Array(2).fill('投射物数量 +1'),
  },
  speed: {
    id: 'speed', kind: 'passive', name: '疾行', icon: 'icon_speed', color: 0x7dffb0, maxLevel: 5,
    desc: Array(5).fill('移动速度 +8%'),
  },
  magnet: {
    id: 'magnet', kind: 'passive', name: '磁力', icon: 'icon_magnet', color: 0xff9a3d, maxLevel: 5,
    desc: Array(5).fill('拾取范围 +30%'),
  },
  armor: {
    id: 'armor', kind: 'passive', name: '护甲', icon: 'icon_armor', color: 0x9aa8ff, maxLevel: 5,
    desc: Array(5).fill('受到的伤害 -1'),
  },
  vitality: {
    id: 'vitality', kind: 'passive', name: '活力', icon: 'icon_vitality', color: 0xff6b8b, maxLevel: 5,
    desc: Array(5).fill('最大生命 +20，每秒回复 +0.3'),
  },
  growth: {
    id: 'growth', kind: 'passive', name: '成长', icon: 'icon_growth', color: 0x4dc3ff, maxLevel: 5,
    desc: Array(5).fill('经验获取 +10%'),
  },
};

export const WEAPON_IDS: WeaponId[] = ['bolt', 'orbit', 'nova', 'chain', 'disc'];
export const PASSIVE_IDS: PassiveId[] = ['might', 'haste', 'area', 'amount', 'speed', 'magnet', 'armor', 'vitality', 'growth'];

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 5;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const l = level - 1;
  return Math.floor(5 + l * 5 + l * l * 0.9);
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'chaser' | 'bat' | 'brute' | 'boss';

export interface EnemyDef {
  tex: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: number;
  /** 0 = full knockback, 1 = immune. */
  knockResist: number;
  faceMove: boolean;
  /** Max steering speed in rad/s. Unset = turns instantly (always heads straight at the player). */
  turnRate?: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  chaser: { tex: 'e_chaser', hp: 9, speed: 72, damage: 8, radius: 12, xp: 1, color: COLORS.chaser, knockResist: 0, faceMove: true },
  bat: { tex: 'e_bat', hp: 6, speed: 95, damage: 5, radius: 9, xp: 1, color: COLORS.bat, knockResist: 0, faceMove: true, turnRate: 1.8 },
  brute: { tex: 'e_brute', hp: 70, speed: 46, damage: 15, radius: 20, xp: 5, color: COLORS.brute, knockResist: 0.6, faceMove: false },
  boss: { tex: 'e_boss', hp: 1800, speed: 62, damage: 25, radius: 44, xp: 0, color: COLORS.boss, knockResist: 1, faceMove: false },
};

// ---------------------------------------------------------------- meta progression

export type MetaId = 'hp' | 'might' | 'speed' | 'magnet' | 'growth' | 'greed' | 'revive';

export interface MetaDef {
  id: MetaId;
  name: string;
  desc: string;
  maxRank: number;
  baseCost: number;
  icon: string;
}

export const META_DEFS: MetaDef[] = [
  { id: 'hp', name: '强健', desc: '初始最大生命 +10', maxRank: 5, baseCost: 60, icon: 'icon_vitality' },
  { id: 'might', name: '锋锐', desc: '所有伤害 +5%', maxRank: 5, baseCost: 80, icon: 'icon_might' },
  { id: 'speed', name: '轻盈', desc: '移动速度 +5%', maxRank: 3, baseCost: 70, icon: 'icon_speed' },
  { id: 'magnet', name: '引力', desc: '拾取范围 +15%', maxRank: 3, baseCost: 50, icon: 'icon_magnet' },
  { id: 'growth', name: '学识', desc: '经验获取 +5%', maxRank: 5, baseCost: 90, icon: 'icon_growth' },
  { id: 'greed', name: '贪婪', desc: '金币获取 +10%', maxRank: 5, baseCost: 60, icon: 'icon_coin' },
  { id: 'revive', name: '不屈', desc: '每局可复活一次', maxRank: 1, baseCost: 400, icon: 'icon_revive' },
];

export function metaCost(def: MetaDef, rank: number): number {
  return def.baseCost * (rank + 1);
}

export const RUN_LENGTH = 600; // seconds until the final boss arrives
