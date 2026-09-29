-- Lets the leaderboard accept runs played as 观星者 (astro).
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
alter table public.scores drop constraint if exists scores_char_check;
alter table public.scores add constraint scores_char_check
  check (char in ('runner', 'guardian', 'assassin', 'storm', 'monk', 'pyro', 'astro'));
