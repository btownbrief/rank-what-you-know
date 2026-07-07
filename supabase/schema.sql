-- RANK WHAT YOU KNOW — community power-ranking schema.
-- Paste this WHOLE file into the Supabase SQL Editor and click Run.
--
-- Lives alongside the existing Btown Games `scores` table (do not touch it).
-- One row per (category_month, player). A ballot is a jsonb array of item
-- names, ordered best-first, containing ONLY items the player has been to.
-- Resubmitting replaces the ballot; results recompute live.
--
-- Same no-login model as the leaderboard: each browser mints a random
-- player id + secret token (shared btown-* localStorage keys). The token
-- proves ownership of a row, so only the device that cast a ballot can
-- replace it.

create table if not exists public.rank_ballots (
  category_month text not null,       -- 'YYYY-MM' key into data/categories.json
  player_id uuid not null,
  name text not null,
  token text not null,                -- device secret; proves row ownership
  ranking jsonb not null,             -- ordered array of item-name strings, best first
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_month, player_id)
);

-- Lock the table down completely: the public web key can only go through
-- the functions below — it can never read tokens or write rows directly.
alter table public.rank_ballots enable row level security;
revoke all on table public.rank_ballots from anon, authenticated;

-- Cast (or replace) a ballot. Sanity caps: at most 30 items, each item
-- name at most 80 chars, no duplicates, name at most 20 chars.
create or replace function public.submit_ballot(
  p_month text, p_player uuid, p_token text, p_name text, p_ranking jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  clean_name text := left(trim(p_name), 20);
  n integer;
  distinct_n integer;
begin
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then return; end if;
  if clean_name is null or length(clean_name) = 0 then clean_name := 'Ranker'; end if;
  if jsonb_typeof(p_ranking) <> 'array' then return; end if;
  n := jsonb_array_length(p_ranking);
  if n < 1 or n > 30 then return; end if;
  -- every element must be a non-empty string of sane length, no dupes
  select count(distinct value) into distinct_n
  from jsonb_array_elements_text(p_ranking) as t(value)
  where value is not null and length(trim(value)) between 1 and 80;
  if distinct_n <> n then return; end if;

  insert into rank_ballots (category_month, player_id, name, token, ranking)
  values (p_month, p_player, clean_name, p_token, p_ranking)
  on conflict (category_month, player_id) do update
    set ranking = excluded.ranking,
        name = excluded.name,
        updated_at = now()
    where rank_ballots.token = excluded.token;  -- only the owning device may replace
end $$;

-- Community power ranking for a month.
-- Weighting: on a ballot ranking n items, the item in position r earns
-- (n - r + 1) / n. Longer ballots spread credit more finely, so beating
-- ten rivals counts for more than beating one: 2nd of 12 earns 0.917
-- while 2nd of 2 earns only 0.5.
-- An item's score is the mean across all ballots that included it.
-- The client only charts items with ballot_count >= 3 ("needs more votes"
-- below that), but counts are returned for every item so it can say so.
create or replace function public.get_rankings(p_month text)
returns table (item text, ballot_count integer, score numeric)
language sql security definer stable set search_path = public as $$
  select
    t.value as item,
    count(*)::integer as ballot_count,
    round(avg((b.n - t.ord + 1)::numeric / b.n), 4) as score
  from (
    select ranking, jsonb_array_length(ranking) as n
    from rank_ballots where category_month = p_month
  ) b,
  lateral jsonb_array_elements_text(b.ranking) with ordinality as t(value, ord)
  group by t.value
  order by count(*) >= 3 desc, score desc, ballot_count desc, item asc;
$$;

-- How many ballots are in for a month (for "23 locals have voted").
create or replace function public.get_ballot_count(p_month text)
returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::integer from rank_ballots where category_month = p_month;
$$;

grant execute on function public.submit_ballot(text, uuid, text, text, jsonb) to anon;
grant execute on function public.get_rankings(text) to anon;
grant execute on function public.get_ballot_count(text) to anon;
