export const COLORS = {
  bg: 0x07060f,
  grid: 0x1c1838,
  player: 0x5ef2ff,
  bolt: 0x7cf8ff,
  orbit: 0xb58cff,
  nova: 0x5ef2ff,
  chain: 0xfff27a,
  disc: 0x7dffb0,
  chaser: 0xff4d6d,
  bat: 0xffa94d,
  brute: 0xc05cff,
  boss: 0xff2e63,
  elite: 0xffd24d,
  gem1: 0x4dc3ff,
  gem2: 0x6bff8f,
  gem3: 0xff5c8a,
  heart: 0xff6b8b,
  magnet: 0xff9a3d,
  chest: 0xffd24d,
  coin: 0xffd24d,
  enemyBullet: 0xff7a3d,
  xp: 0x4dc3ff,
  hp: 0xff4d6d,
  text: 0xe8e6ff,
  dim: 0x8a86b3,
  panel: 0x121028,
  panelEdge: 0x3b3570,
} as const;

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif';
