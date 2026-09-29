/**
 * Supabase project for the online leaderboard (Project Settings → API).
 * The publishable / anon key is designed to be public and ships in the page; row level
 * security on the `scores` table (see supabase/schema.sql) limits it to read + insert.
 * Never put the service_role / secret key here.
 * Leave both empty to disable the leaderboard.
 */
export const LEADERBOARD_URL = 'https://xhtonqpfcrqywtnfyjvi.supabase.co';
export const LEADERBOARD_KEY = 'sb_publishable_U1MZ8arO93bbTipPzP1YRg_mYJVIrre';
