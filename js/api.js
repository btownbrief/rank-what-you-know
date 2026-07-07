// Supabase backend for RANK WHAT YOU KNOW.
// Same project + publishable key as every other Btown game; schema in
// supabase/schema.sql. Identity is the shared arcade identity: random
// player id + secret token under btown-* localStorage keys, so your name
// follows you across games on this domain.

const SUPABASE_URL = 'https://jnouvwxomrcffqwilqkq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RkMJQopffWlV6DSwCRkndQ_Xw6GJMf3';

function stored(key, make) {
  let v = localStorage.getItem(key);
  if (!v) { v = make(); localStorage.setItem(key, v); }
  return v;
}

export function playerId() {
  return stored('btown-player-id', () => crypto.randomUUID());
}
function playerToken() {
  return stored('btown-player-token', () =>
    [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''));
}
export function getName() { return localStorage.getItem('btown-player-name') || ''; }
export function setName(n) { localStorage.setItem('btown-player-name', n.trim().slice(0, 20)); }

async function rpc(fn, args) {
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  // legacy JWT-style anon keys also go in the Authorization header;
  // new sb_publishable_ keys must not (they aren't bearer tokens)
  if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ranking: array of item names, best first, only places you've been
export async function submitBallot(month, ranking) {
  await rpc('submit_ballot', {
    p_month: month,
    p_player: playerId(),
    p_token: playerToken(),
    p_name: getName() || 'Ranker',
    p_ranking: ranking,
  });
}

// returns [{ item, ballot_count, score }] — score is mean (n-r+1)/n, 0..1
export async function fetchRankings(month) {
  return (await rpc('get_rankings', { p_month: month })) || [];
}

export async function fetchBallotCount(month) {
  return (await rpc('get_ballot_count', { p_month: month })) || 0;
}
