// RANK WHAT YOU KNOW — monthly community power rankings for Btown Games.
// Flow: CHECKLIST (tap what you've been to) → RANK (drag into order) →
// SUBMIT (first-timers pick their arcade name) → REVEAL (community bars,
// your % match with Burlington, to-do list, share). Past months are
// frozen results pages. Resubmitting any time this month replaces your
// ballot and results update live.

import { playerId, getName, setName, submitBallot, fetchRankings, fetchBallotCount } from './api.js';
import { makeSortable } from './drag.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SITE_URL = 'https://btownbrief.github.io/rank-what-you-know/';
const MIN_BALLOTS = 3;

let CATS = [];           // all categories from data/categories.json
let cat = null;          // category being viewed
let checked = new Set(); // names checked on the checklist
let order = [];          // current drag order (names)

// ---------- month helpers (?month=YYYY-MM overrides for testing) ----------

function currentMonthKey() {
  const forced = new URLSearchParams(location.search).get('month');
  if (/^\d{4}-\d{2}$/.test(forced || '')) return forced;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function nextMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

const ballotKey = (month) => `rwyk-ballot-${month}`;
const savedBallot = (month) => {
  try { return JSON.parse(localStorage.getItem(ballotKey(month))) || null; } catch { return null; }
};

// ---------- boot ----------

async function boot() {
  const res = await fetch('data/categories.json');
  CATS = (await res.json()).categories;
  const nowKey = currentMonthKey();
  cat = CATS.find((c) => c.month === nowKey) || CATS[0];
  renderMonthNav(nowKey);
  const mine = savedBallot(cat.month);
  if (mine) {
    checked = new Set(mine);
    order = [...mine];
    showReveal();
  } else {
    showChecklist();
  }
}

function isLive(c) { return c.month === currentMonthKey(); }
function isPast(c) { return c.month < currentMonthKey(); }

// ---------- month nav (frozen past months) ----------

function renderMonthNav(nowKey) {
  const nav = $('#month-nav');
  nav.innerHTML = '';
  const visible = CATS.filter((c) => c.month <= nowKey);
  if (visible.length < 2) { nav.classList.add('hidden'); return; }
  for (const c of visible) {
    const b = el('button', 'month-chip' + (c === cat ? ' active' : ''),
      `${c.emoji} ${esc(monthLabel(c.month))}`);
    b.addEventListener('click', () => {
      cat = c;
      renderMonthNav(nowKey);
      if (isPast(c) || savedBallot(c.month)) showReveal();
      else { checked = new Set(); order = []; showChecklist(); }
    });
    nav.appendChild(b);
  }
}

// ---------- screens ----------

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
  $('#cat-emoji').textContent = cat.emoji;
  $('#cat-title').textContent = cat.title;
  $('#cat-month').textContent = monthLabel(cat.month) + (isPast(cat) ? ' · final results' : '');
}

// 1 — CHECKLIST
function showChecklist() {
  show('#screen-checklist');
  $('#check-prompt').textContent = cat.prompt;
  const grid = $('#check-grid');
  grid.innerHTML = '';
  for (const item of cat.items) {
    const card = el('button', 'check-card' + (checked.has(item.name) ? ' checked' : ''));
    card.innerHTML = `
      <span class="check-box">${checked.has(item.name) ? '✓' : ''}</span>
      <span class="check-body">
        <span class="check-name">${esc(item.name)}</span>
        <span class="check-where">${esc(item.where)}</span>
        <span class="check-note">${esc(item.note)}</span>
      </span>`;
    card.addEventListener('click', () => {
      if (checked.has(item.name)) checked.delete(item.name); else checked.add(item.name);
      card.classList.toggle('checked');
      card.querySelector('.check-box').textContent = checked.has(item.name) ? '✓' : '';
      try { navigator.vibrate && navigator.vibrate(8); } catch { /* unsupported */ }
      updateCheckCounter();
    });
    grid.appendChild(card);
  }
  updateCheckCounter();
  $('#to-rank').onclick = () => {
    order = cat.items.map((i) => i.name).filter((n) => checked.has(n));
    // keep any previous ballot's relative order for items still checked
    const prev = savedBallot(cat.month);
    if (prev) order.sort((a, b) => idx(prev, a) - idx(prev, b));
    showRank();
  };
}
const idx = (arr, v) => { const i = arr.indexOf(v); return i === -1 ? 1e9 : i; };

function updateCheckCounter() {
  const n = checked.size;
  $('#check-counter').textContent = `You've tried ${n} of ${cat.items.length}`;
  const btn = $('#to-rank');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'Check at least one' : `Rank your ${n} →`;
}

// 2 — RANK
function showRank() {
  show('#screen-rank');
  const list = $('#rank-list');
  list.innerHTML = '';
  for (const name of order) {
    const item = cat.items.find((i) => i.name === name);
    const row = el('div', 'rank-row');
    row.dataset.name = name;
    row.innerHTML = `
      <span class="rank-num"></span>
      <span class="rank-body">
        <span class="rank-name">${esc(name)}</span>
        <span class="rank-where">${esc(item ? item.where : '')}</span>
      </span>
      <span class="row-btns">
        <button class="mini-btn" data-move="up" aria-label="Move up">▲</button>
        <button class="mini-btn" data-move="down" aria-label="Move down">▼</button>
      </span>
      <span class="drag-handle" aria-label="Drag to reorder">≡</span>`;
    list.appendChild(row);
  }
  const sync = () => {
    order = [...list.children].map((r) => r.dataset.name);
    [...list.children].forEach((r, i) => { r.querySelector('.rank-num').textContent = i + 1; });
  };
  sync();
  // bind once; the callback reads live DOM + module state so it stays valid
  if (!list.dataset.sortable) { makeSortable(list, sync); list.dataset.sortable = '1'; }
  $('#back-to-check').onclick = showChecklist;
  $('#to-submit').onclick = () => (getName() ? doSubmit() : showName());
}

// 3 — NAME (first-timers only)
function showName() {
  show('#screen-name');
  const input = $('#name-input');
  input.value = getName();
  $('#name-go').onclick = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    setName(v);
    doSubmit();
  };
}

async function doSubmit() {
  const btn = $('#to-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    await submitBallot(cat.month, order);
    localStorage.setItem(ballotKey(cat.month), JSON.stringify(order));
    showReveal();
  } catch (err) {
    console.error(err);
    alert('Could not reach the ranking server — try again in a minute.');
  } finally {
    btn.disabled = false; btn.textContent = 'Lock it in 🔒';
  }
}

// 4 — REVEAL
async function showReveal() {
  show('#screen-reveal');
  $('#reveal-loading').classList.remove('hidden');
  $('#reveal-body').classList.add('hidden');
  let rows = [];
  let total = 0;
  try {
    [rows, total] = await Promise.all([fetchRankings(cat.month), fetchBallotCount(cat.month)]);
  } catch (err) {
    console.error(err);
    $('#reveal-loading').textContent = 'Could not load results — check back in a minute.';
    return;
  }
  $('#reveal-loading').classList.add('hidden');
  $('#reveal-body').classList.remove('hidden');

  const mine = savedBallot(cat.month) || [];
  const charted = rows.filter((r) => r.ballot_count >= MIN_BALLOTS);
  const pending = rows.filter((r) => r.ballot_count < MIN_BALLOTS);

  $('#reveal-count').textContent = total === 1 ? '1 local has voted' : `${total} locals have voted`;

  // community bars
  const wrap = $('#bars');
  wrap.innerHTML = '';
  if (!charted.length) {
    wrap.appendChild(el('div', 'empty-note',
      `No item has ${MIN_BALLOTS}+ ballots yet — the community ranking appears once enough locals weigh in. Share it around!`));
  }
  charted.forEach((r, i) => {
    const myRank = mine.indexOf(r.item);
    const row = el('div', 'bar-row' + (myRank >= 0 ? ' mine' : ''));
    row.innerHTML = `
      <div class="bar-top">
        <span class="bar-rank">${i + 1}</span>
        <span class="bar-name">${esc(r.item)}</span>
        ${myRank >= 0 ? `<span class="you-badge">you: #${myRank + 1}</span>` : ''}
        <span class="bar-score">${Math.round(r.score * 100)}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="--w:${Math.round(r.score * 100)}%; animation-delay:${i * 60}ms"></div></div>
      <div class="bar-sub">${r.ballot_count} ballot${r.ballot_count === 1 ? '' : 's'}</div>`;
    wrap.appendChild(row);
  });
  if (pending.length) {
    const p = el('div', 'pending');
    p.appendChild(el('div', 'pending-title', `Needs more votes (fewer than ${MIN_BALLOTS} ballots)`));
    for (const r of pending) {
      p.appendChild(el('div', 'pending-row',
        `${esc(r.item)} <span class="pending-count">${r.ballot_count}/${MIN_BALLOTS}</span>`));
    }
    wrap.appendChild(p);
  }

  // % match with Burlington (Spearman on shared items, mapped to 0–100)
  const matchCard = $('#match-card');
  const match = matchPercent(mine, charted.map((r) => r.item));
  if (match === null) {
    matchCard.classList.add('hidden');
  } else {
    matchCard.classList.remove('hidden');
    $('#match-pct').textContent = `${match}%`;
    $('#match-line').textContent = matchBlurb(match);
  }

  // your to-do list
  const todo = cat.items.filter((i) => !mine.includes(i.name));
  const todoWrap = $('#todo');
  if (!mine.length || !todo.length) todoWrap.classList.add('hidden');
  else {
    todoWrap.classList.remove('hidden');
    $('#todo-list').innerHTML = todo.map((i) =>
      `<li><strong>${esc(i.name)}</strong> <span>· ${esc(i.where)} — ${esc(i.note)}</span></li>`).join('');
  }

  // actions
  $('#edit-ballot').classList.toggle('hidden', !isLive(cat));
  $('#edit-ballot').onclick = () => { checked = new Set(mine.length ? mine : []); showChecklist(); };
  $('#vote-cta').classList.toggle('hidden', !isLive(cat) || mine.length > 0);
  $('#vote-cta').onclick = () => { checked = new Set(); showChecklist(); };

  $('#share-btn').classList.toggle('hidden', !mine.length);
  $('#share-btn').onclick = async () => {
    const bits = [`I've tried ${mine.length} of ${cat.items.length} ${cat.title.toLowerCase()} in Btown`];
    if (match !== null) bits.push(`and I'm ${match}% aligned with Burlington`);
    const text = `${bits.join(' ')} ${cat.emoji}\nRank what YOU know: ${SITE_URL}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); flashBtn('#share-btn', 'Copied!'); }
    } catch { /* user cancelled */ }
  };

  $('#copy-results').onclick = async () => {
    const lines = [`${cat.emoji} BTOWN POWER RANKING — ${cat.title} (${monthLabel(cat.month)})`];
    charted.slice(0, 10).forEach((r, i) =>
      lines.push(`${i + 1}. ${r.item} — ${Math.round(r.score * 100)} pts (${r.ballot_count} ballots)`));
    lines.push('', `As ranked by ${total} locals · play.btownbrief.com`);
    try { await navigator.clipboard.writeText(lines.join('\n')); flashBtn('#copy-results', 'Copied!'); }
    catch { /* clipboard denied */ }
  };

  // countdown to next category
  const cd = $('#countdown');
  if (isLive(cat)) {
    const next = CATS.find((c) => c.month > cat.month);
    const ms = nextMonthStart() - new Date();
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    cd.classList.remove('hidden');
    cd.textContent = next
      ? `Next up: ${next.emoji} ${next.title} — in ${days}d ${hours}h`
      : `Next category drops in ${days}d ${hours}h`;
  } else cd.classList.add('hidden');
}

function flashBtn(sel, msg) {
  const b = $(sel);
  const orig = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = orig; }, 1400);
}

// Spearman rank correlation between your order and the community order,
// over the items you both ranked, mapped to 0–100.
function matchPercent(mine, community) {
  const shared = mine.filter((n) => community.includes(n));
  const m = shared.length;
  if (m < 2) return null;
  const myRank = shared.slice().sort((a, b) => mine.indexOf(a) - mine.indexOf(b));
  const commRank = shared.slice().sort((a, b) => community.indexOf(a) - community.indexOf(b));
  let sumD2 = 0;
  for (const n of shared) {
    const d = myRank.indexOf(n) - commRank.indexOf(n);
    sumD2 += d * d;
  }
  const rho = 1 - (6 * sumD2) / (m * (m * m - 1));
  return Math.round(((rho + 1) / 2) * 100);
}
function matchBlurb(p) {
  if (p >= 90) return 'You basically ARE Burlington.';
  if (p >= 75) return 'Strongly aligned with the people.';
  if (p >= 55) return 'Mostly with the crowd, a few hot takes.';
  if (p >= 35) return 'A contrarian streak. Respect.';
  return 'You are at war with this town.';
}

boot();
