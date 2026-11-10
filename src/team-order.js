// Team order and the drag handle that changes it.
const DRAG_THRESHOLD = 4;
const ANIMATION_MS = 180;
const SCROLL_EDGE = 32;
const SCROLL_STEP = 6;

// Saved teams come first, in their saved order. Others follow: the caller's teams first, then by name.
export function orderTeams(teams, saved = [], sessionID) {
  const position = new Map(saved.map((id, index) => [id, index]));
  return teams.slice().sort((a, b) => {
    const pa = position.get(a.id), pb = position.get(b.id);
    if (pa !== undefined || pb !== undefined) return (pa ?? Infinity) - (pb ?? Infinity);
    return Number(b.members.includes(sessionID)) - Number(a.members.includes(sessionID)) || a.name.localeCompare(b.name);
  });
}

export function moveItem(items, from, to) {
  const next = items.slice();
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// The index the dragged team takes: how many other teams end above the pointer's midpoint test.
export function targetIndex(rects, from, y) {
  return rects.filter((rect, index) => index !== from && rect.top + rect.height / 2 < y).length;
}

// How far each team moves while `from` hovers over slot `to`, and where the dragged team lands.
export function dragOffsets(rects, from, to) {
  const next = rects[from + 1], previous = rects[from - 1];
  const gap = next ? next.top - rects[from].bottom : previous ? rects[from].top - previous.bottom : 0;
  const slot = rects[from].height + gap;
  const offsets = rects.map((_, index) => {
    if (index > from && index <= to) return -slot;
    if (index >= to && index < from) return slot;
    return 0;
  });
  const landing = to > from ? rects[to].bottom - rects[from].bottom : to < from ? rects[to].top - rects[from].top : 0;
  return { offsets, landing };
}

// Keeps the dragged team inside the list. Moving past its end would grow the scrollable area and chase the pointer.
export function clampDrag(rects, from, offset) {
  const low = rects[0].top - rects[from].top, high = rects[rects.length - 1].bottom - rects[from].bottom;
  return Math.min(high, Math.max(low, offset));
}

// commit(ids, id, index) saves a changed order.
export function createTeamReorder({ ids, commit, disabled }) {
  let drag, settling;
  const duration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ANIMATION_MS;
  const elementFor = (root, id) => root.querySelector(`[data-team-id="${CSS.escape(id)}"]`);

  function listen(add) {
    const method = add ? 'addEventListener' : 'removeEventListener';
    window[method]('pointermove', onMove);
    window[method]('pointerup', onUp);
    window[method]('pointercancel', onCancel);
    window[method]('keydown', onKey, true);
    document[method]('selectstart', onSelect);
  }
  const onSelect = event => event.preventDefault();
  const swallowClick = event => { event.stopPropagation(); event.preventDefault(); };

  function begin() {
    drag.active = true;
    window.getSelection()?.removeAllRanges();
    try { drag.handle.setPointerCapture(drag.pointerId); } catch { /* The pointer already ended. */ }
    window.addEventListener('click', swallowClick, { capture: true, once: true });
    drag.root.classList.add('teams-reordering');
    const current = drag;
    requestAnimationFrame(() => { if (drag === current) measure(); });
  }
  function measure() {
    const { root, id } = drag;
    const order = ids();
    drag.order = order;
    drag.elements = order.map(item => elementFor(root, item));
    if (drag.elements.some(element => !element)) { finish(true); return; }
    drag.scrollStart = root.scrollTop;
    drag.scrollMax = Math.max(root.scrollTop, root.scrollHeight - root.clientHeight);
    drag.rects = drag.elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + root.scrollTop, bottom: rect.bottom + root.scrollTop, height: rect.height };
    });
    drag.from = order.indexOf(id);
    drag.to = drag.from;
    drag.elements.forEach((element, index) => {
      if (index === drag.from) element.classList.add('teams-team-dragging');
      else element.style.transition = `transform ${duration()}ms ease`;
    });
    drag.ready = true;
    update();
    drag.frame = requestAnimationFrame(tick);
  }
  function update() {
    const { root, rects, from, elements } = drag;
    const to = targetIndex(rects, from, drag.y + root.scrollTop);
    drag.to = to;
    const { offsets } = dragOffsets(rects, from, to);
    elements.forEach((element, index) => {
      element.style.transform = index === from
        ? `translateY(${clampDrag(rects, from, drag.y - drag.startY + root.scrollTop - drag.scrollStart)}px)`
        : offsets[index] ? `translateY(${offsets[index]}px)` : '';
    });
  }
  function tick() {
    if (!drag?.ready) return;
    const { root, y } = drag, box = root.getBoundingClientRect();
    const before = root.scrollTop;
    if (y < box.top + SCROLL_EDGE) root.scrollTop -= SCROLL_STEP;
    else if (y > box.bottom - SCROLL_EDGE) root.scrollTop = Math.min(drag.scrollMax, before + SCROLL_STEP);
    if (root.scrollTop !== before) update();
    drag.frame = requestAnimationFrame(tick);
  }
  function finish(cancelled) {
    const current = drag;
    drag = undefined;
    listen(false);
    if (!current?.active) return;
    cancelAnimationFrame(current.frame);
    // A drag ends with its own click, or none at all if the pointer finished elsewhere.
    setTimeout(() => window.removeEventListener('click', swallowClick, true), 50);
    const clean = () => {
      current.root.classList.remove('teams-reordering');
      current.elements?.forEach(element => {
        element.classList.remove('teams-team-dragging');
        element.style.transition = '';
        element.style.transform = '';
      });
    };
    if (!current.ready) { clean(); return; }
    const { from, order, elements, rects } = current;
    const to = cancelled ? from : current.to;
    const { offsets, landing } = dragOffsets(rects, from, to);
    const time = duration();
    elements.forEach((element, index) => {
      element.style.transition = `transform ${time}ms ease`;
      element.style.transform = index === from ? `translateY(${landing}px)` : offsets[index] ? `translateY(${offsets[index]}px)` : '';
    });
    settling = setTimeout(() => {
      settling = undefined;
      // Saving reorders the elements, so clearing their offsets in the same task leaves nothing to see.
      if (to !== from) commit(moveItem(order, from, to), order[from], to);
      clean();
    }, time);
  }
  function onMove(event) {
    if (event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    if (!drag.active && Math.abs(drag.y - drag.startY) >= DRAG_THRESHOLD) begin();
    else if (drag?.ready) update();
  }
  function onUp(event) { if (event.pointerId === drag.pointerId) finish(false); }
  function onCancel(event) { if (event.pointerId === drag.pointerId) finish(true); }
  function onKey(event) {
    if (event.key !== 'Escape' || !drag.active) return;
    event.stopPropagation();
    event.preventDefault();
    finish(true);
  }
  function flip(root, order, commitMove) {
    const elements = order.map(id => elementFor(root, id)).filter(Boolean);
    const before = new Map(elements.map(element => [element, element.getBoundingClientRect().top]));
    commitMove();
    queueMicrotask(() => {
      const time = duration();
      if (!time) return;
      for (const element of elements) {
        const shift = before.get(element) - element.getBoundingClientRect().top;
        if (shift) element.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: time, easing: 'ease' });
      }
    });
  }
  return {
    pointerDown(id, event) {
      if (drag || settling || event.button !== 0 || disabled()) return;
      drag = { id, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, handle: event.currentTarget,
        root: event.currentTarget.closest('.teams-dashboard'), active: false };
      listen(true);
    },
    keyDown(id, event) {
      if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey
        || disabled() || drag || settling) return;
      event.preventDefault();
      const order = ids(), from = order.indexOf(id), to = from + (event.key === 'ArrowUp' ? -1 : 1);
      if (from === -1 || to < 0 || to >= order.length) return;
      const focused = document.activeElement;
      flip(event.currentTarget.closest('.teams-dashboard'), order, () => commit(moveItem(order, from, to), id, to));
      queueMicrotask(() => { if (focused instanceof HTMLElement && document.activeElement !== focused) focused.focus(); });
    },
    dispose() {
      if (drag) finish(true);
      clearTimeout(settling);
    },
  };
}
