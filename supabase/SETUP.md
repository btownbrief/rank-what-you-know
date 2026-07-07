# RANK WHAT YOU KNOW — backend setup (one time, ~2 minutes)

This game extends the **existing** Btown Games Supabase project (the one the
leaderboards use). It adds one new table (`rank_ballots`) and three RPC
functions. It does **not** touch the `scores` table.

## Steps

1. Open your Supabase dashboard → the existing `btown-games` project →
   **SQL Editor** (left sidebar).
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   You should see "Success. No rows returned."
3. Done. The site already ships with the same project URL + publishable key
   the other games use, so no code changes are needed.

## What it creates

- `rank_ballots` — one row per (month, player). RLS-locked: the public key
  can't read or write the table directly, only call the functions below.
- `submit_ballot(month, player, token, name, ranking)` — casts or replaces
  a ballot. Caps: ≤30 items, ≤80 chars per item, no duplicates. Only the
  device holding the row's secret token can replace it.
- `get_rankings(month)` — per item: how many ballots included it and its
  average normalized score ((n−r+1)/n per ballot). The site only charts
  items with ≥3 ballots.
- `get_ballot_count(month)` — total ballots for the month.

## Moderation

Ballots are anonymous but named. If someone submits a gross name, delete
their row in Table Editor → `rank_ballots` (or update `name`). Results
recompute automatically on the next page load.
