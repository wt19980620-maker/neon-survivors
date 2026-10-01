import { COLORS } from './palette';

export type WeaponId =
  | 'bolt' | 'orbit' | 'nova' | 'chain' | 'disc' | 'laser' | 'frost' | 'mine'
  | 'fireball' | 'meteor' | 'cyclone' | 'spirit';
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
 * orbit = orbit radius, nova = blast radius, chain = jump range, disc = throw range,
 * laser = beam length, frost = aura radius, mine = blast radius, fireball = blast radius,
 * meteor = impact radius, cyclone = vortex radius, spirit = seek range.
 * laser uses speed as beam duration, frost uses it as slow strength (0..1),
 * meteor as fall time, cyclone as lifetime (evolved: orbit speed), spirit as dash speed.
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
  laser: levels(
    { damage: 20, cooldown: 2.2, count: 1, pierce: 999, area: 1, speed: 0.35, extra: 520, knockback: 40 },
    [{ damage: 28 }, { count: 2 }, { cooldown: 1.7, extra: 620 }, { damage: 38, count: 3 }],
  ),
  frost: levels(
    { damage: 6, cooldown: 0.5, count: 1, pierce: 0, area: 1, speed: 0.35, extra: 90, knockback: 0 },
    [{ extra: 105 }, { damage: 10, speed: 0.45 }, { extra: 125 }, { damage: 14, cooldown: 0.4, speed: 0.55 }],
  ),
  mine: levels(
    { damage: 30, cooldown: 1.6, count: 1, pierce: 0, area: 1, speed: 0, extra: 70, knockback: 260 },
    [{ count: 2 }, { damage: 45 }, { extra: 90, cooldown: 1.3 }, { count: 3, damage: 60 }],
  ),
  fireball: levels(
    { damage: 18, cooldown: 1.4, count: 1, pierce: 0, area: 1, speed: 330, extra: 55, knockback: 120 },
    [{ count: 2 }, { damage: 26, extra: 65 }, { count: 3 }, { damage: 36, cooldown: 1.15, extra: 75 }],
  ),
  meteor: levels(
    { damage: 34, cooldown: 3.2, count: 1, pierce: 0, area: 1, speed: 0.8, extra: 80, knockback: 250 },
    [{ count: 2 }, { damage: 50 }, { extra: 100, cooldown: 2.7 }, { count: 3, damage: 65 }],
  ),
  cyclone: levels(
    { damage: 7, cooldown: 4, count: 1, pierce: 0, area: 1, speed: 3, extra: 44, knockback: 0 },
    [{ damage: 10 }, { count: 2 }, { extra: 56, speed: 3.8 }, { damage: 14, count: 3 }],
  ),
  spirit: levels(
    { damage: 14, cooldown: 1.0, count: 2, pierce: 0, area: 1, speed: 520, extra: 320, knockback: 60 },
    [{ damage: 18 }, { count: 3 }, { damage: 22, cooldown: 0.8 }, { count: 4, damage: 26 }],
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
  laser: {
    id: 'laser', kind: 'weapon', name: '光束', icon: 'icon_laser', color: COLORS.laser, maxLevel: 5,
    desc: ['射出贯穿一条直线的激光', '伤害 +8', '同时射出 2 道光束', '冷却缩短，射程更远', '伤害 +10，光束 +1'],
  },
  frost: {
    id: 'frost', kind: 'weapon', name: '冰霜领域', icon: 'icon_frost', color: COLORS.frost, maxLevel: 5,
    desc: ['身边的寒气持续伤害并减速敌人', '领域扩大', '伤害提升，减速更强', '领域扩大', '伤害与减速大幅提升'],
  },
  mine: {
    id: 'mine', kind: 'weapon', name: '地雷', icon: 'icon_mine', color: COLORS.mine, maxLevel: 5,
    desc: ['在脚下布雷，敌人踩到即爆炸', '每次布雷 +1', '伤害 +15', '爆炸范围扩大，布雷更快', '布雷 +1，伤害 +15'],
  },
  fireball: {
    id: 'fireball', kind: 'weapon', name: '火球术', icon: 'icon_fireball', color: COLORS.fireball, maxLevel: 5,
    desc: ['向敌人投掷火球，命中后爆炸', '火球 +1', '伤害 +8，爆炸范围扩大', '火球 +1', '伤害 +10，冷却缩短，范围扩大'],
  },
  meteor: {
    id: 'meteor', kind: 'weapon', name: '陨石', icon: 'icon_meteor', color: COLORS.meteor, maxLevel: 5,
    desc: ['召唤陨石砸向敌群，造成大范围伤害', '陨石 +1', '伤害 +16', '冲击范围扩大，冷却缩短', '陨石 +1，伤害 +15'],
  },
  cyclone: {
    id: 'cyclone', kind: 'weapon', name: '旋风', icon: 'icon_cyclone', color: COLORS.cyclone, maxLevel: 5,
    desc: ['放出游走的旋风，卷住敌人持续伤害', '伤害提升', '旋风 +1', '旋风更大，持续更久', '伤害提升，旋风 +1'],
  },
  spirit: {
    id: 'spirit', kind: 'weapon', name: '灵体', icon: 'icon_spirit', color: COLORS.spirit, maxLevel: 5,
    desc: ['召唤两个灵体，自动冲向附近的敌人', '伤害 +4', '灵体 +1', '伤害 +4，攻击更频繁', '灵体 +1，伤害 +4'],
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

// ---------------------------------------------------------------- evolutions

/** A max-level weapon + its paired passive evolves when the next chest is opened. */
export interface EvolutionDef {
  weapon: WeaponId;
  passive: PassiveId;
  name: string;
  icon: string;
  color: number;
  desc: string;
  stats: WeaponStats;
}

export const EVOLUTIONS: Record<WeaponId, EvolutionDef> = {
  bolt: {
    weapon: 'bolt', passive: 'haste', name: '风暴弹幕', icon: 'icon_evo_bolt', color: 0xff7ad9,
    desc: '飞弹自动追踪敌人，高速连射',
    stats: { damage: 24, cooldown: 0.45, count: 4, pierce: 3, area: 1.2, speed: 620, extra: 0, knockback: 80 },
  },
  orbit: {
    weapon: 'orbit', passive: 'area', name: '星环绞杀', icon: 'icon_evo_orbit', color: 0xffd24d,
    desc: '八片利刃绕身胀缩，绞碎一切',
    stats: { damage: 22, cooldown: 0.3, count: 8, pierce: 0, area: 1.2, speed: 4.6, extra: 95, knockback: 190 },
  },
  nova: {
    weapon: 'nova', passive: 'vitality', name: '生命脉冲', icon: 'icon_evo_nova', color: 0x7dffb0,
    desc: '巨型冲击波，每命中敌人都会为你回复生命',
    stats: { damage: 55, cooldown: 2.0, count: 2, pierce: 0, area: 1, speed: 0, extra: 215, knockback: 400 },
  },
  chain: {
    weapon: 'chain', passive: 'might', name: '雷霆审判', icon: 'icon_evo_chain', color: 0xfff8c4,
    desc: '闪电跳跃九次，终点引发雷暴爆炸',
    stats: { damage: 30, cooldown: 0.9, count: 3, pierce: 9, area: 1, speed: 0, extra: 190, knockback: 60 },
  },
  disc: {
    weapon: 'disc', passive: 'amount', name: '裂变星盘', icon: 'icon_evo_disc', color: 0xff9a3d,
    desc: '飞盘在最远处裂变成三个小飞盘',
    stats: { damage: 30, cooldown: 1.5, count: 3, pierce: 999, area: 1.4, speed: 480, extra: 320, knockback: 130 },
  },
  laser: {
    weapon: 'laser', passive: 'speed', name: '湮灭光束', icon: 'icon_evo_laser', color: 0xffb3f0,
    desc: '两道光束持续绕身旋转，切开一切',
    stats: { damage: 18, cooldown: 0.25, count: 2, pierce: 999, area: 1.2, speed: 1.7, extra: 400, knockback: 60 },
  },
  frost: {
    weapon: 'frost', passive: 'armor', name: '绝对零度', icon: 'icon_evo_frost', color: 0xe6fbff,
    desc: '极寒领域，每 4 秒冻结范围内所有敌人',
    stats: { damage: 20, cooldown: 0.35, count: 1, pierce: 0, area: 1, speed: 0.6, extra: 160, knockback: 0 },
  },
  mine: {
    weapon: 'mine', passive: 'magnet', name: '磁暴雷阵', icon: 'icon_evo_mine', color: 0x7dff4d,
    desc: '地雷吸引周围敌人，爆炸会连锁引爆',
    stats: { damage: 90, cooldown: 1.1, count: 3, pierce: 0, area: 1, speed: 0, extra: 120, knockback: 300 },
  },
  fireball: {
    weapon: 'fireball', passive: 'might', name: '炼狱火球', icon: 'icon_evo_fireball', color: 0xffd23d,
    desc: '巨大火球，爆炸后留下持续灼烧的火海',
    stats: { damage: 42, cooldown: 1.0, count: 4, pierce: 0, area: 1.1, speed: 380, extra: 85, knockback: 150 },
  },
  meteor: {
    weapon: 'meteor', passive: 'growth', name: '天降灾星', icon: 'icon_evo_meteor', color: 0xff9ad0,
    desc: '陨石雨倾泻而下，每次撞击再迸出一圈余波',
    stats: { damage: 75, cooldown: 2.5, count: 4, pierce: 0, area: 1, speed: 0.7, extra: 120, knockback: 300 },
  },
  cyclone: {
    weapon: 'cyclone', passive: 'speed', name: '风暴之眼', icon: 'icon_evo_cyclone', color: 0xe6fff8,
    desc: '两道巨型龙卷常驻身边环绕，把敌人卷入撕碎',
    stats: { damage: 16, cooldown: 0.3, count: 2, pierce: 0, area: 1, speed: 1.1, extra: 70, knockback: 0 },
  },
  spirit: {
    weapon: 'spirit', passive: 'amount', name: '灵魂军团', icon: 'icon_evo_spirit', color: 0xfff27a,
    desc: '六个灵体高速突袭，每次命中都会爆裂',
    stats: { damage: 34, cooldown: 0.55, count: 6, pierce: 0, area: 1, speed: 640, extra: 380, knockback: 80 },
  },
};

/** passive id -> weapons it evolves (a passive can serve more than one recipe) */
export const EVOLVES_WEAPONS: Partial<Record<PassiveId, WeaponId[]>> = {};
for (const e of Object.values(EVOLUTIONS)) (EVOLVES_WEAPONS[e.passive] ??= []).push(e.weapon);

export const WEAPON_IDS: WeaponId[] = [
  'bolt', 'orbit', 'nova', 'chain', 'disc', 'laser', 'frost', 'mine', 'fireball', 'meteor', 'cyclone', 'spirit',
];
export const PASSIVE_IDS: PassiveId[] = ['might', 'haste', 'area', 'amount', 'speed', 'magnet', 'armor', 'vitality', 'growth'];

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 5;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const l = level - 1;
  return Math.floor(5 + l * 5 + l * l * 0.9);
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'chaser' | 'bat' | 'brute' | 'spitter' | 'splitter' | 'splitling' | 'bomber' | 'egg' | 'boss';

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
  /** special AI: keeps distance and shoots / splits on death / suicide-bombs / sits still and hatches */
  behavior?: 'ranged' | 'splitter' | 'bomber' | 'egg';
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  chaser: { tex: 'e_chaser', hp: 9, speed: 72, damage: 8, radius: 12, xp: 1, color: COLORS.chaser, knockResist: 0, faceMove: true },
  bat: { tex: 'e_bat', hp: 6, speed: 95, damage: 5, radius: 9, xp: 1, color: COLORS.bat, knockResist: 0, faceMove: true, turnRate: 1.8 },
  brute: { tex: 'e_brute', hp: 70, speed: 46, damage: 15, radius: 20, xp: 5, color: COLORS.brute, knockResist: 0.6, faceMove: false },
  spitter: { tex: 'e_spitter', hp: 22, speed: 64, damage: 7, radius: 13, xp: 2, color: COLORS.spitter, knockResist: 0.2, faceMove: true, behavior: 'ranged' },
  splitter: { tex: 'e_splitter', hp: 40, speed: 52, damage: 10, radius: 16, xp: 2, color: COLORS.splitter, knockResist: 0.3, faceMove: false, behavior: 'splitter' },
  splitling: { tex: 'e_splitling', hp: 8, speed: 92, damage: 5, radius: 8, xp: 1, color: COLORS.splitter, knockResist: 0, faceMove: false },
  bomber: { tex: 'e_bomber', hp: 12, speed: 112, damage: 22, radius: 11, xp: 2, color: COLORS.bomber, knockResist: 0, faceMove: false, behavior: 'bomber' },
  egg: { tex: 'e_egg', hp: 45, speed: 0, damage: 0, radius: 14, xp: 2, color: COLORS.hive, knockResist: 1, faceMove: false, behavior: 'egg' },
  boss: { tex: 'e_boss', hp: 1800, speed: 62, damage: 25, radius: 44, xp: 0, color: COLORS.boss, knockResist: 1, faceMove: false },
};

// ---------------------------------------------------------------- bosses

export type BossId = 'warden' | 'hive' | 'prism' | 'void';

export interface BossDef {
  id: BossId;
  name: string;
  tex: string;
  color: number;
  /** sprite tint, for bosses sharing a texture */
  tint?: number;
  hp: number;
  damage: number;
  speed: number;
  scale: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  /** ring volleys and charges */
  warden: { id: 'warden', name: '猩红守望者', tex: 'e_boss', color: COLORS.boss, hp: 3500, damage: 24, speed: 64, scale: 1 },
  /** lays eggs that hatch into bat swarms, spits acid fans */
  hive: { id: 'hive', name: '蜂巢母体', tex: 'e_boss_hive', color: COLORS.hive, hp: 3000, damage: 22, speed: 50, scale: 1 },
  /** stops to sweep the arena with rotating beams; terrain blocks them */
  prism: { id: 'prism', name: '棱镜巨像', tex: 'e_boss_prism', color: COLORS.prism, hp: 3800, damage: 24, speed: 46, scale: 1 },
  /** the warden's moves, faster, plus a spiral barrage below half health */
  void: { id: 'void', name: '虚空之主', tex: 'e_boss', color: 0xc79bff, tint: 0xc79bff, hp: 14000, damage: 32, speed: 74, scale: 1.3 },
};

/** the 5:00 boss is one of these, picked at random each run */
export const MID_BOSSES: BossId[] = ['warden', 'hive', 'prism'];
export const BOSS_IDS: BossId[] = ['warden', 'hive', 'prism', 'void'];

// ---------------------------------------------------------------- affixes

/**
 * Random modifiers. Elites (every 75 s) roll 1–3; from 3:00 on, a few ordinary enemies
 * spawn as "champions" with a single champion-safe affix.
 */
export type AffixId = 'swift' | 'shield' | 'regen' | 'volley' | 'summon' | 'blink' | 'split';

export interface AffixDef {
  id: AffixId;
  name: string;
  color: number;
  /** can appear on champions (ordinary enemies), not only elites */
  champion: boolean;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  swift: { id: 'swift', name: '迅捷', color: 0x7dffb0, champion: true },
  shield: { id: 'shield', name: '护盾', color: 0x7cd8ff, champion: true },
  regen: { id: 'regen', name: '再生', color: 0xff6b8b, champion: true },
  volley: { id: 'volley', name: '弹幕', color: 0xff7a3d, champion: true },
  summon: { id: 'summon', name: '召唤', color: 0xc05cff, champion: false },
  blink: { id: 'blink', name: '闪现', color: 0xb58cff, champion: false },
  split: { id: 'split', name: '裂变', color: 0x4d7cff, champion: false },
};

export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

export const AFFIX_TUNING = {
  swiftSpeed: 1.6,
  /** shield = this fraction of max hp, refills after `shieldDelay` s without being hit */
  shieldFrac: 0.4,
  shieldDelay: 3,
  /** fraction of max hp per second, while not hit for `regenDelay` s */
  regen: 0.03,
  regenDelay: 1.5,
  volleyEvery: 3.2,
  summonEvery: 4.5,
  blinkEvery: 5,
};

/** champion = ordinary enemy with one affix */
export const CHAMPION = { hp: 4, damage: 1.2, scale: 1.3, xp: 6, maxAlive: 5 };

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

/** standard: beat the final boss to win; endless: bosses keep coming until you fall */
export type GameMode = 'standard' | 'endless';
/** endless: seconds between bosses after the final boss, and how much tougher each one gets (linear per wave) */
export const ENDLESS_BOSS_EVERY = 240;
export const ENDLESS_BOSS_SCALE = 0.75;

// ---------------------------------------------------------------- limit breaks

/**
 * Once every weapon and passive is maxed, level-ups offer these stackable bonuses instead,
 * so a long endless run keeps getting stronger. Values are per stack.
 */
export type LimitBreakId = 'lb_might' | 'lb_haste' | 'lb_area' | 'lb_hp' | 'lb_magnet';

export interface LimitBreakDef {
  id: LimitBreakId;
  name: string;
  icon: string;
  color: number;
  desc: string;
}

export const LIMIT_BREAKS: LimitBreakDef[] = [
  { id: 'lb_might', name: '突破·力量', icon: 'icon_might', color: 0xff6b6b, desc: '所有伤害 +8%' },
  { id: 'lb_haste', name: '突破·急速', icon: 'icon_haste', color: 0x7cf8ff, desc: '武器冷却 -4%' },
  { id: 'lb_area', name: '突破·领域', icon: 'icon_area', color: 0xb58cff, desc: '攻击范围 +6%' },
  { id: 'lb_hp', name: '突破·活力', icon: 'icon_vitality', color: 0xff6b8b, desc: '最大生命 +15，并回复 15' },
  { id: 'lb_magnet', name: '突破·磁力', icon: 'icon_magnet', color: 0xff9a3d, desc: '拾取范围 +15%' },
];

export const LB = { might: 0.08, haste: 0.96, area: 0.06, hp: 15, magnet: 0.15, minHaste: 0.45 };
/** endless: seconds between random swarm events after RUN_LENGTH */
export const ENDLESS_EVENT_EVERY = 75;

// ---------------------------------------------------------------- characters

export type CharId = 'runner' | 'guardian' | 'assassin' | 'storm' | 'monk' | 'pyro' | 'astro' | 'wind' | 'caller' | 'meihua';

/** Multipliers default to 1, additive bonuses to 0. */
export interface CharMods {
  hp?: number;
  speed?: number;
  might?: number;
  cooldown?: number;
  area?: number;
  magnet?: number;
  armor?: number;
  regen?: number;
  /** experience gain multiplier */
  growth?: number;
  /** extra projectiles for every weapon, like levels of 多重 */
  amount?: number;
}

export interface CharDef {
  id: CharId;
  name: string;
  color: number;
  weapon: WeaponId;
  desc: string;
  mods: CharMods;
  /** achievement that unlocks this character; none = available from the start */
  unlock?: string;
  /** bought with gold in 局外强化 instead of an achievement */
  goldUnlock?: number;
  /** gains no experience: starts each run with a loadout bought with gold (梅花花) */
  custom?: boolean;
}

export const CHARACTERS: CharDef[] = [
  { id: 'runner', name: '霓光行者', color: 0x5ef2ff, weapon: 'bolt', desc: '均衡型，适合新手', mods: {} },
  {
    id: 'guardian', name: '重甲守卫', color: 0x9aa8ff, weapon: 'orbit', desc: '血厚甲硬，但移动较慢',
    mods: { hp: 1.5, armor: 2, speed: 0.9 }, unlock: 'boss1',
  },
  {
    id: 'assassin', name: '疾风刺客', color: 0x7dffb0, weapon: 'disc', desc: '迅捷致命，但非常脆弱',
    mods: { speed: 1.2, might: 1.15, hp: 0.7 }, unlock: 'run_kills',
  },
  {
    id: 'storm', name: '雷鸣术士', color: 0xfff27a, weapon: 'chain', desc: '技能冷却更快，范围更大',
    mods: { cooldown: 0.85, area: 1.1, hp: 0.9 }, unlock: 'evolve1',
  },
  {
    id: 'monk', name: '脉冲修士', color: 0xff6b8b, weapon: 'nova', desc: '持续回复生命，拾取范围大',
    mods: { regen: 1, magnet: 1.5, might: 0.9 }, unlock: 'level25',
  },
  {
    id: 'pyro', name: '烈焰术士', color: 0xff8a3d, weapon: 'fireball', desc: '火力凶猛，但步伐稍慢',
    mods: { might: 1.1, area: 1.2, speed: 0.95 }, unlock: 'survive8',
  },
  {
    id: 'astro', name: '观星者', color: 0xd98cff, weapon: 'meteor', desc: '成长迅速，但体质孱弱',
    mods: { growth: 1.25, area: 1.1, hp: 0.85 }, unlock: 'full_build',
  },
  {
    id: 'wind', name: '御风者', color: 0xb8fff0, weapon: 'cyclone', desc: '身轻如风，但力量偏弱',
    mods: { speed: 1.1, magnet: 1.3, might: 0.9 }, unlock: 'untouched',
  },
  {
    id: 'caller', name: '唤灵师', color: 0xffb8e8, weapon: 'spirit', desc: '召唤更多，但单体更弱',
    mods: { amount: 1, might: 0.85, hp: 0.9 }, unlock: 'kills_1k',
  },
  {
    // weapon is only a placeholder: her loadout is bought in 局外强化
    id: 'meihua', name: '梅花花', color: 0xff5fa2, weapon: 'bolt', desc: '无法获得经验，靠金币打造',
    mods: {}, goldUnlock: 1000, custom: true,
  },
];

/** 梅花花: gold prices for her permanent loadout. Levels are the item's current level. */
export const MEIHUA = {
  unlock: 1000,
  maxWeapons: 4,
  maxPassives: 5,
  buyWeapon: 100,
  buyPassive: 80,
  /** upgrade price = per-level × current level */
  weaponPerLevel: 60,
  passivePerLevel: 50,
  /** limit break price = base + step × stacks already bought (all kinds together) */
  lbBase: 150,
  lbStep: 50,
};

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<CharId, CharDef>;

// ---------------------------------------------------------------- maps

export type MapId = 'grid' | 'crystal' | 'abyss' | 'arena';

export interface MapDef {
  id: MapId;
  name: string;
  desc: string;
  bg: number;
  grid: number;
  /** obstacle colour */
  accent: number;
  obstacle: 'pillar' | 'crystal' | 'ruin';
  /** average obstacles per 480×480 chunk */
  density: number;
  radius: [number, number];
  hpMult: number;
  speedMult: number;
  goldMult: number;
  /** achievement that unlocks this map; none = available from the start */
  unlock?: string;
  /** bosses keep coming one after another (Boss 竞技场) */
  bossRush?: boolean;
}

export const MAPS: MapDef[] = [
  {
    id: 'grid', name: '霓虹网格', desc: '开阔的训练场，零星的能量柱',
    bg: 0x07060f, grid: 0x1c1838, accent: 0x5ef2ff, obstacle: 'pillar', density: 0.7, radius: [26, 40],
    hpMult: 1, speedMult: 1, goldMult: 1,
  },
  {
    id: 'crystal', name: '晶簇洞窟', desc: '晶簇林立如迷宫，利用地形卡位',
    bg: 0x0b0716, grid: 0x2a1a44, accent: 0xa9c8ff, obstacle: 'crystal', density: 2.2, radius: [28, 52],
    hpMult: 1.2, speedMult: 1, goldMult: 1.3, unlock: 'boss1',
  },
  {
    id: 'abyss', name: '深渊回廊', desc: '巨大的废墟，敌人更凶猛',
    bg: 0x0e0508, grid: 0x3a1420, accent: 0xff5a36, obstacle: 'ruin', density: 1.1, radius: [48, 80],
    hpMult: 1.45, speedMult: 1.1, goldMult: 1.6, unlock: 'win',
  },
  {
    id: 'arena', name: 'Boss 竞技场', desc: '首领接连不断地出现',
    bg: 0x0c0610, grid: 0x33183a, accent: 0xffd24d, obstacle: 'pillar', density: 0.35, radius: [30, 44],
    hpMult: 1, speedMult: 1, goldMult: 2, unlock: 'boss_all', bossRush: true,
  },
];

/** Boss 竞技场 pacing */
export const ARENA = {
  firstBoss: 20,
  /** seconds after a boss dies before the next one */
  gap: 4,
  /** an extra boss joins this often even while one is alive */
  extraEvery: 90,
  maxAlive: 3,
  /** ordinary spawns are thinned out */
  spawnMult: 0.5,
};

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m])) as Record<MapId, MapDef>;

/** Human-readable stat lines for a character card. */
export function charModLines(m: CharMods): string[] {
  const pct = (v: number) => `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  const out: string[] = [];
  if (m.hp) out.push(`生命 ${pct(m.hp)}`);
  if (m.armor) out.push(`护甲 +${m.armor}`);
  if (m.speed) out.push(`移速 ${pct(m.speed)}`);
  if (m.might) out.push(`伤害 ${pct(m.might)}`);
  if (m.cooldown) out.push(`冷却 ${pct(m.cooldown)}`);
  if (m.area) out.push(`范围 ${pct(m.area)}`);
  if (m.magnet) out.push(`拾取 ${pct(m.magnet)}`);
  if (m.regen) out.push(`回复 +${m.regen}/秒`);
  if (m.growth) out.push(`经验 ${pct(m.growth)}`);
  if (m.amount) out.push(`数量 +${m.amount}`);
  return out;
}
