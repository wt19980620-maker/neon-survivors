import type { CharId, GameMode, MapId } from './data';
import { LEADERBOARD_KEY, LEADERBOARD_URL } from './leaderboardConfig';
import { loadSave, writeSave } from './save';

export interface ScoreRow {
  player_id: string;
  name: string;
  grp: string;
  mode: GameMode;
  map: MapId;
  char: CharId;
  time_s: number;
  kills: number;
  level: number;
  win: boolean;
  score: number;
  created_at?: string;
}

export interface RunScore {
  mode: GameMode;
  map: MapId;
  char: CharId;
  time: number;
  kills: number;
  level: number;
  win: boolean;
}

/** Dev builds can point at a stub server via window.__lbTest = { url, key } for UI testing. */
function config(): { url: string; key: string } {
  const test = import.meta.env.DEV ? (window as unknown as { __lbTest?: { url: string; key: string } }).__lbTest : undefined;
  return test ?? { url: LEADERBOARD_URL, key: LEADERBOARD_KEY };
}

export function leaderboardEnabled() {
  const c = config();
  return c.url !== '' && c.key !== '';
}

/** Survival dominates, kills and level break ties; winning a standard run is worth a lot. */
export function computeScore(r: RunScore) {
  return Math.floor(r.time) * 10 + r.kills + r.level * 20 + (r.win ? 3000 : 0);
}

/** RFC 4122 v4 UUID; the column is `uuid`, so it must be well-formed even on older browsers. */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable anonymous id so the board can show each player's best run once. */
export function playerId(): string {
  const s = loadSave();
  if (!s.playerId) {
    s.playerId = uuid();
    writeSave();
  }
  return s.playerId;
}

/** Trim, strip control characters, cap length. Empty string means "not set". */
export function cleanName(raw: string | null, max = 12) {
  return (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/**
 * Ask for a nickname with the browser's own prompt (works with phone keyboards, no
 * custom text input needed). Saves and returns it; null if cancelled or empty.
 */
export function askNickname(): string | null {
  const s = loadSave();
  const name = cleanName(window.prompt('排行榜昵称（1-12 个字）', s.nickname || ''));
  if (!name) return null;
  s.nickname = name;
  writeSave();
  return name;
}

/** Friend-group code; empty clears it (back to the global board only). */
export function askFriendGroup(): string | null {
  const s = loadSave();
  const raw = window.prompt('好友圈代码（和朋友填一样的即可，留空表示退出好友圈）', s.friendGroup || '');
  if (raw === null) return null;
  s.friendGroup = cleanName(raw, 16);
  writeSave();
  return s.friendGroup;
}

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: config().key,
    Authorization: `Bearer ${config().key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path: string, init: RequestInit, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${config().url.replace(/\/$/, '')}/rest/v1/${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type SubmitResult = 'ok' | 'no-name' | 'disabled' | 'error';

/** Upload a finished run under the player's nickname and friend group. */
export async function submitScore(run: RunScore): Promise<SubmitResult> {
  if (!leaderboardEnabled()) return 'disabled';
  const s = loadSave();
  if (!s.nickname) return 'no-name';
  const row: ScoreRow = {
    player_id: playerId(),
    name: s.nickname,
    grp: s.friendGroup,
    mode: run.mode,
    map: run.map,
    char: run.char,
    time_s: Math.floor(run.time),
    kills: run.kills,
    level: run.level,
    win: run.win,
    score: computeScore(run),
  };
  try {
    const res = await request('scores', { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(row) });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Top players for a mode (optionally within a friend group), best run per player.
 * Fetches more rows than shown so duplicates from the same player can be folded.
 */
export async function fetchBoard(mode: GameMode, group = '', limit = 20): Promise<ScoreRow[]> {
  const q = new URLSearchParams({
    select: 'player_id,name,grp,mode,map,char,time_s,kills,level,win,score,created_at',
    mode: `eq.${mode}`,
    order: 'score.desc',
    limit: '200',
  });
  if (group) q.set('grp', `eq.${group}`);
  const res = await request(`scores?${q}`, { method: 'GET', headers: headers() });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  const rows = (await res.json()) as ScoreRow[];
  const seen = new Set<string>();
  const best: ScoreRow[] = [];
  for (const r of rows) {
    if (seen.has(r.player_id)) continue;
    seen.add(r.player_id);
    best.push(r);
    if (best.length >= limit) break;
  }
  return best;
}
