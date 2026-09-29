/**
 * Supabase project for the online leaderboard (Project Settings → API).
 * The anon / publishable key is designed to be public and ships in the page; row level
 * security on the `scores` table (see supabase/schema.sql) limits it to read + insert.
 * Never put the service_role / secret key here.
 * Leave both empty to disable the leaderboard.
 */
export const LEADERBOARD_URL = '';
export const LEADERBOARD_KEY = '';
