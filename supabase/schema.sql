-- 霓虹幸存者 leaderboard. Paste into Supabase: SQL Editor → New query → Run.
-- This one file sets up a new project AND upgrades an existing one; it is safe to run again.
--
-- The browser talks to this table directly with the public "anon" key, so row level
-- security below is what keeps it safe: anyone may read and add scores, nobody may
-- edit or delete them. The CHECK constraints reject obviously impossible values; a
-- determined player can still forge a plausible score (the game runs on their device).
--
-- `char` and `map` only have to look like an id (lowercase, 2–16 chars) rather than match
-- a fixed list, so new characters and maps in the game need no database change. The game
-- shows an unknown id as a blank name.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player_id   uuid        not null,
  name        text        not null check (char_length(name) between 1 and 12),
  grp         text        not null default '' check (char_length(grp) <= 16),
  mode        text        not null check (mode in ('standard', 'endless')),
  map         text        not null,
  char        text        not null,
  time_s      integer     not null check (time_s between 0 and 14400),
  kills       integer     not null check (kills between 0 and 2000000),
  level       integer     not null check (level between 1 and 300),
  win         boolean     not null default false,
  score       integer     not null check (score between 0 and 50000000)
);

-- (re)define the id checks: replaces the old fixed lists on existing tables
alter table public.scores drop constraint if exists scores_char_check;
alter table public.scores add constraint scores_char_check check (char ~ '^[a-z][a-z0-9_]{1,15}$');
alter table public.scores drop constraint if exists scores_map_check;
alter table public.scores add constraint scores_map_check check (map ~ '^[a-z][a-z0-9_]{1,15}$');

create index if not exists scores_board on public.scores (mode, score desc);
create index if not exists scores_group_board on public.scores (grp, mode, score desc);

alter table public.scores enable row level security;

drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores
  for select using (true);

drop policy if exists "anyone can submit a score" on public.scores;
create policy "anyone can submit a score" on public.scores
  for insert with check (true);

-- no update / delete policies: submitted scores can't be changed from the browser
