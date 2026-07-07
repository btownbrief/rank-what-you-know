// Touch-first drag-to-reorder list. Drag starts from the ≡ handle
// (immediately with a mouse; after a short hold on touch so the page can
// still scroll), siblings FLIP-animate out of the way, and drops buzz on
// phones that support it. Every row also gets ▲▼ buttons as a no-drag
// fallback.

const HOLD_MS = 120; // touch hold before a drag begins
const BUZZ = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };

// container's children are .rank-row elements, each containing a
// .drag-handle. onReorder() fires after any order change.
export function makeSortable(container, onReorder) {
  let drag = null;

  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const row = handle && handle.closest('.rank-row');
    if (!row || row.parentElement !== container) return;
    e.preventDefault();
    drag = {
      row,
      pointerId: e.pointerId,
      grabOffset: e.clientY - row.getBoundingClientRect().top,
      active: false,
      holdTimer: null,
    };
    const start = () => {
      if (!drag) return;
      drag.active = true;
      row.classList.add('dragging');
      container.classList.add('drag-live');
      BUZZ(15);
    };
    if (e.pointerType === 'mouse') start();
    else drag.holdTimer = setTimeout(start, HOLD_MS);
    handle.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId || !drag.active) return;
    e.preventDefault();
    const { row, grabOffset } = drag;

    // desired index: where the pointer-held row's center lands
    const centre = e.clientY - grabOffset + row.offsetHeight / 2;
    const rows = [...container.children];
    const others = rows.filter((r) => r !== row);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const r = others[i].getBoundingClientRect();
      if (centre < r.top + r.height / 2) { target = i; break; }
    }
    // inserting before others[target] lands the row at list index `target`,
    // so anything other than its current index is a real move
    const currentIndex = rows.indexOf(row);
    if (target !== currentIndex) {
      const before = new Map(others.map((r) => [r, r.getBoundingClientRect().top]));
      container.insertBefore(row, others[target] || null);
      for (const r of others) {
        const d = before.get(r) - r.getBoundingClientRect().top;
        if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }],
          { duration: 180, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
      }
      BUZZ(8);
    }
    // glue the dragged row to the pointer regardless of DOM position
    const restingTop = row.getBoundingClientRect().top - getTranslate(row);
    row.style.transform = `translateY(${e.clientY - grabOffset - restingTop}px) scale(1.02)`;
  });

  const finish = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    clearTimeout(drag.holdTimer);
    const { row, active } = drag;
    drag = null;
    if (!active) return;
    row.classList.remove('dragging');
    container.classList.remove('drag-live');
    const offset = getTranslate(row);
    row.style.transform = '';
    if (offset) row.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }],
      { duration: 160, easing: 'ease-out' });
    BUZZ(20);
    onReorder();
  };
  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', finish);

  // ▲▼ fallback buttons
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const row = btn.closest('.rank-row');
    const sib = btn.dataset.move === 'up' ? row.previousElementSibling : row.nextElementSibling;
    if (!sib) return;
    const before = new Map([...container.children].map((r) => [r, r.getBoundingClientRect().top]));
    if (btn.dataset.move === 'up') container.insertBefore(row, sib);
    else container.insertBefore(sib, row);
    for (const r of container.children) {
      const d = before.get(r) - r.getBoundingClientRect().top;
      if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }],
        { duration: 200, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
    }
    BUZZ(10);
    onReorder();
  });
}

function getTranslate(el) {
  const t = el.style.transform;
  const m = /translateY\((-?[\d.]+)px\)/.exec(t);
  return m ? parseFloat(m[1]) : 0;
}
