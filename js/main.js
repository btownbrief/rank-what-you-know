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
const LOCK_BEAT_MS = 520;
const BAR_STAGGER_MS = 70;
const BAR_GROW_MS = 700;
const MATCH_COUNT_MS = 650;

let CATS = [];           // all categories from data/categories.json
let cat = null;          // category being viewed
let checked = new Set(); // names checked on the checklist
let order = [];          // current drag order (names)
let submitting = false;
let toastTimer = 0;
let checkFlourishTimer = 0;
let revealRunId = 0;
let suppressedRevealRunId = -1;
let revealFrame = 0;
const revealTimers = new Set();

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
  if (id !== '#screen-reveal') stopRevealEffects();
  if (id !== '#screen-checklist') stopCheckFlourish();
  hideToast();
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
      const previous = checked.size;
      if (checked.has(item.name)) checked.delete(item.name); else checked.add(item.name);
      card.classList.toggle('checked');
      card.querySelector('.check-box').textContent = checked.has(item.name) ? '✓' : '';
      updateCheckCounter(previous);
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

function updateCheckCounter(previous = null) {
  const n = checked.size;
  const total = cat.items.length;
  const percent = total ? Math.round((n / total) * 100) : 0;
  $('#check-counter').textContent = `You've tried ${n} of ${total}`;
  const progress = $('#check-progress');
  progress.setAttribute('aria-valuemax', total);
  progress.setAttribute('aria-valuenow', n);
  progress.setAttribute('aria-valuetext', `${n} of ${total} places tried`);
  progress.classList.toggle('complete', n === total);
  const fill = $('#check-progress-fill');
  fill.classList.toggle('instant', previous === null);
  fill.style.width = `${percent}%`;
  if (previous === null) {
    void fill.offsetWidth;
    fill.classList.remove('instant');
  }
  const btn = $('#to-rank');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'Check at least one' : `Rank your ${n} →`;

  if (previous === null || n <= previous) return;
  const halfway = Math.ceil(total / 2);
  if (n === total) celebrateCheckMilestone('Every spot checked!', 24);
  else if (previous < halfway && n >= halfway) celebrateCheckMilestone('Halfway through the list!', 16);
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
  if (submitting) return;
  submitting = true;
  setSubmittingUI(true);
  const submittedMonth = cat.month;
  const submittedOrder = [...order];
  try {
    await submitBallot(submittedMonth, submittedOrder);
    localStorage.setItem(ballotKey(submittedMonth), JSON.stringify(submittedOrder));
    if (cat.month === submittedMonth) showReveal({ freshSubmit: true });
    else showToast(`🔒 ${monthLabel(submittedMonth)} ballot locked`, 'locked', 1800);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the ranking server — try again in a minute.', 'error', 2800);
  } finally {
    submitting = false;
    setSubmittingUI(false);
  }
}

// 4 — REVEAL
async function showReveal({ freshSubmit = false } = {}) {
  const runId = beginRevealRun();
  show('#screen-reveal');
  $('#reveal-loading').classList.remove('hidden');
  $('#reveal-loading').textContent = freshSubmit
    ? '🔒 Ballot locked · Counting the ballots…'
    : 'Counting the ballots…';
  $('#reveal-body').classList.add('hidden');
  let rows = [];
  let total = 0;
  try {
    [rows, total] = await Promise.all([fetchRankings(cat.month), fetchBallotCount(cat.month)]);
  } catch (err) {
    console.error(err);
    if (runId !== revealRunId) return;
    $('#reveal-loading').textContent = 'Could not load results — check back in a minute.';
    return;
  }
  if (runId !== revealRunId) return;
  $('#reveal-loading').classList.add('hidden');
  $('#reveal-body').classList.remove('hidden');

  const animateReveal = freshSubmit
    && suppressedRevealRunId !== runId
    && !document.hidden
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    const row = el('div', 'bar-row' + (myRank >= 0 ? ' mine' : '') + (animateReveal ? ' reveal' : ''));
    const reverseDelay = (charted.length - 1 - i) * BAR_STAGGER_MS;
    row.style.setProperty('--reveal-delay', `${LOCK_BEAT_MS + reverseDelay}ms`);
    row.innerHTML = `
      <div class="bar-top">
        <span class="bar-rank">${i + 1}</span>
        <span class="bar-name">${esc(r.item)}</span>
        ${myRank >= 0 ? `<span class="you-badge">you: #${myRank + 1}</span>` : ''}
        <span class="bar-score">${Math.round(r.score * 100)}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="--w:${Math.round(r.score * 100)}%"></div></div>
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
  const matchPct = $('#match-pct');
  const matchLine = $('#match-line');
  const match = matchPercent(mine, charted.map((r) => r.item));
  if (match === null) {
    matchCard.classList.add('hidden');
    delete matchCard.dataset.match;
    delete matchCard.dataset.blurb;
  } else {
    matchCard.classList.remove('hidden');
    matchCard.dataset.match = match;
    matchCard.dataset.blurb = matchBlurb(match);
    matchLine.classList.remove('blurb-drop');
    if (animateReveal) {
      matchPct.textContent = '0%';
      matchLine.textContent = '';
      matchLine.classList.add('awaiting');
    } else {
      settleMatchCard(matchCard);
    }
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

  if (freshSubmit) showToast('🔒 Ballot locked', 'locked', 1000);
  if (animateReveal && match !== null) {
    const barsDoneAt = LOCK_BEAT_MS
      + Math.max(0, charted.length - 1) * BAR_STAGGER_MS
      + BAR_GROW_MS;
    scheduleReveal(runId, barsDoneAt, () => {
      countUpMatch(match, runId, () => {
        matchLine.textContent = matchBlurb(match);
        matchLine.classList.remove('awaiting');
        matchLine.classList.add('blurb-drop');
      });
    });
  }
}

function setSubmittingUI(active) {
  const rankButton = $('#to-submit');
  const nameButton = $('#name-go');
  rankButton.disabled = active;
  nameButton.disabled = active;
  rankButton.textContent = active ? 'Submitting…' : 'Lock it in 🔒';
  nameButton.textContent = active ? 'Submitting…' : 'Submit my ballot';
}

function celebrateCheckMilestone(message, vibrationMs) {
  const progress = $('#check-progress');
  clearTimeout(checkFlourishTimer);
  progress.classList.remove('flourish');
  void progress.offsetWidth;
  progress.classList.add('flourish');
  showToast(message, 'locked', 1400);
  try { navigator.vibrate && navigator.vibrate(vibrationMs); } catch { /* unsupported */ }
  checkFlourishTimer = setTimeout(() => progress.classList.remove('flourish'), 600);
}

function stopCheckFlourish() {
  clearTimeout(checkFlourishTimer);
  checkFlourishTimer = 0;
  $('#check-progress').classList.remove('flourish');
}

function showToast(message, tone = '', duration = 1800) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.className = `toast${tone ? ` ${tone}` : ''}`;
  toast.textContent = message;
  void toast.offsetWidth;
  toast.classList.add('show');
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = 0;
  $('#toast').classList.remove('show');
}

function beginRevealRun() {
  clearRevealTiming();
  return ++revealRunId;
}

function stopRevealEffects() {
  clearRevealTiming();
  revealRunId++;
}

function clearRevealTiming() {
  if (revealFrame) cancelAnimationFrame(revealFrame);
  revealFrame = 0;
  for (const timer of revealTimers) clearTimeout(timer);
  revealTimers.clear();
}

function scheduleReveal(runId, delay, fn) {
  const timer = setTimeout(() => {
    revealTimers.delete(timer);
    if (runId !== revealRunId || $('#screen-reveal').classList.contains('hidden')) return;
    fn();
  }, delay);
  revealTimers.add(timer);
}

function countUpMatch(target, runId, done) {
  const start = performance.now();
  const frame = (now) => {
    if (runId !== revealRunId || document.hidden) return;
    const elapsed = Math.min(1, (now - start) / MATCH_COUNT_MS);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    $('#match-pct').textContent = `${Math.round(target * eased)}%`;
    if (elapsed < 1) {
      revealFrame = requestAnimationFrame(frame);
    } else {
      revealFrame = 0;
      done();
    }
  };
  revealFrame = requestAnimationFrame(frame);
}

function settleMatchCard(card) {
  if (!card.dataset.match) return;
  $('#match-pct').textContent = `${card.dataset.match}%`;
  const line = $('#match-line');
  line.textContent = card.dataset.blurb;
  line.classList.remove('awaiting', 'blurb-drop');
}

function settleRevealPresentation() {
  clearRevealTiming();
  document.querySelectorAll('.bar-row.reveal').forEach((row) => row.classList.remove('reveal'));
  settleMatchCard($('#match-card'));
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  suppressedRevealRunId = revealRunId;
  settleRevealPresentation();
  stopCheckFlourish();
  hideToast();
});

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
