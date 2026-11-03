/* Third Wheel — motion helpers. Morphs, springs and FLIP. No innerHTML, no pulsing. */
(() => {
'use strict';
const root = document.documentElement;
function motionPref() { try { return localStorage.getItem('tw_motion') || 'system'; } catch { return 'system'; } }
function setMotionPref(v) {
  try { localStorage.setItem('tw_motion', v); } catch { /* storage unavailable */ }
  if (v === 'system') delete root.dataset.motion; else root.dataset.motion = v;
}
setMotionPref(motionPref());
const reduce = () => root.dataset.motion === 'off' || (root.dataset.motion !== 'on' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const mobile = () => matchMedia('(max-width: 899px)').matches;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
const canVT = () => !reduce() && typeof document.startViewTransition === 'function';
const rafThrottle = (fn) => { let q = 0, a; return (...x) => { a = x; if (!q) q = requestAnimationFrame(() => { q = 0; fn(...a); }); }; };

/* Run a DOM update inside a view transition. `from` (live element) morphs into `to()` (element after update). */
function transition(update, o = {}) {
  if (!canVT()) { update(); return Promise.resolve(); }
  const name = o.name || 'gmorph';
  const from = o.from && o.from.isConnected ? o.from : null;
  let target = null;
  if (from) from.style.viewTransitionName = name;
  let t, ran = false;
  try {
    t = document.startViewTransition(() => {
      ran = true;
      if (from) from.style.viewTransitionName = '';
      update();
      if (o.to) { target = o.to(); if (target) target.style.viewTransitionName = name; }
    });
  } catch { if (from) from.style.viewTransitionName = ''; update(); return Promise.resolve(); }
  t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
  /* No frame to capture (window hidden/occluded)? Apply the update anyway. */
  setTimeout(() => { if (!ran) t.skipTransition(); }, 400);
  return t.finished.catch(() => {}).then(() => { if (target) target.style.viewTransitionName = ''; });
}

/* FLIP: rows keyed by data-key glide to their new spot; new rows spring in. */
function flip(container, sel, mutate) {
  const first = new Map();
  if (!reduce()) container.querySelectorAll(sel).forEach(e => { if (e.dataset.key) first.set(e.dataset.key, e.getBoundingClientRect()); });
  mutate();
  if (reduce()) return;
  const initial = first.size === 0;
  let n = 0;
  container.querySelectorAll(sel).forEach(e => {
    const k = e.dataset.key; if (!k) return;
    const f = first.get(k);
    e.style.animation = 'none';
    if (!f) {
      e.animate([{ opacity: 0, transform: 'translateY(14px) scale(.92)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, delay: Math.min(n++, 14) * (initial ? 38 : 24), easing: SPRING, fill: 'backwards' });
    } else {
      const l = e.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 560, easing: EASE });
    }
  });
}

/* Animate a container's height between two layouts. */
function morphHeight(el, mutate) {
  const h0 = el.getBoundingClientRect().height;
  mutate();
  if (reduce()) return;
  const h1 = el.getBoundingClientRect().height;
  if (Math.abs(h0 - h1) < 2) return;
  const prev = el.style.overflow; el.style.overflow = 'hidden';
  const a = el.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 520, easing: EASE });
  const done = () => { el.style.overflow = prev; };
  a.addEventListener('finish', done); a.addEventListener('cancel', done);
}

/* New chat bubble flies out of the composer. */
function flyFrom(el, r) {
  if (reduce() || !r) return;
  el.style.animation = 'none';
  const b = el.getBoundingClientRect();
  el.animate([{ transform: `translate(${r.left - b.left}px, ${r.top - b.top}px) scale(.9)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: SPRING });
}

/* Slide a panel's content in the direction of travel. */
function slide(el, dir) {
  if (reduce()) return;
  el.animate([{ opacity: 0, transform: `translateX(${dir * 36}px)` }, { opacity: 1, transform: 'none' }], { duration: 460, easing: EASE });
}

/* Button shrinks into a round spinner while busy, then grows back. */
function busyBtn(b) {
  if (reduce()) { b.classList.add('loading'); return () => b.classList.remove('loading'); }
  const w = b.offsetWidth, hgt = b.offsetHeight;
  b.style.width = w + 'px'; b.style.minWidth = '0';
  void b.offsetWidth;
  b.classList.add('loading'); b.style.width = hgt + 'px';
  return () => {
    b.style.width = w + 'px'; b.classList.remove('loading');
    setTimeout(() => { b.style.width = ''; b.style.minWidth = ''; }, 380);
  };
}

/* Sheets grow out of the button that opened them and shrink back into it. */
function sheetIn(trigger, panel, overlay) {
  if (reduce()) return;
  overlay.style.animation = 'none'; panel.style.animation = 'none';
  overlay.animate([{ opacity: 0, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: 'blur(6px)' }], { duration: 360, easing: 'ease-out' });
  const r = trigger && trigger.isConnected ? trigger.getBoundingClientRect() : null;
  if (!r || !r.width || mobile()) {
    panel.animate(mobile() ? [{ transform: 'translateY(100%)' }, { transform: 'none' }]
      : [{ transform: 'translateY(28px) scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: mobile() ? EASE : SPRING });
    return;
  }
  const p = panel.getBoundingClientRect(), cs = getComputedStyle(panel);
  const dx = r.left + r.width / 2 - (p.left + p.width / 2), dy = r.top + r.height / 2 - (p.top + p.height / 2);
  panel.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(r.width / p.width, .05)}, ${Math.max(r.height / p.height, .03)})`, backgroundColor: getComputedStyle(trigger).backgroundColor, borderRadius: '14px' },
    { transform: 'none', backgroundColor: cs.backgroundColor, borderRadius: cs.borderRadius }], { duration: 640, easing: EASE });
  panel.querySelectorAll('.sheet-head, .sheet-body').forEach(c => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 200, easing: 'ease-out', fill: 'backwards' }));
}
function sheetOut(trigger, panel, overlay) {
  if (reduce()) return Promise.resolve();
  overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  const r = trigger && trigger.isConnected ? trigger.getBoundingClientRect() : null;
  let a;
  if (!r || !r.width || mobile()) {
    a = panel.animate(mobile() ? [{ transform: 'none' }, { transform: 'translateY(100%)' }]
      : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(18px) scale(.94)', opacity: 0 }], { duration: 340, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
  } else {
    const p = panel.getBoundingClientRect();
    const dx = r.left + r.width / 2 - (p.left + p.width / 2), dy = r.top + r.height / 2 - (p.top + p.height / 2);
    panel.querySelectorAll('.sheet-head, .sheet-body').forEach(c => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
    a = panel.animate([{ transform: 'none' },
      { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(r.width / p.width, .05)}, ${Math.max(r.height / p.height, .03)})`, backgroundColor: getComputedStyle(trigger).backgroundColor, borderRadius: '14px' }],
      { duration: 460, easing: 'cubic-bezier(.64, 0, .78, 0)', fill: 'forwards' });
  }
  return a.finished.catch(() => {});
}

/* Sliding active highlight for the rail and the bottom bar. */
function nav() {
  const main = document.querySelector('.nav-main');
  if (main) {
    let p = main.querySelector(':scope > .slide-pill');
    if (!p) { p = document.createElement('span'); p.className = 'slide-pill'; p.setAttribute('aria-hidden', 'true'); main.prepend(p); }
    const a = main.querySelector(':scope > .nav-link[aria-current="page"]');
    if (!a || !a.offsetWidth) p.style.opacity = '0';
    else {
      if (!p.dataset.ready || reduce()) p.style.transition = 'none'; else p.style.transition = '';
      p.style.opacity = '1'; p.style.width = a.offsetWidth + 'px'; p.style.height = a.offsetHeight + 'px';
      p.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`; p.dataset.ready = '1';
      if (p.style.transition === 'none') requestAnimationFrame(() => { p.style.transition = ''; });
    }
  }
  const bn = document.querySelector('.bottom-nav');
  if (bn && bn.offsetWidth) {
    let b = bn.querySelector(':scope > .slide-bar');
    if (!b) { b = document.createElement('span'); b.className = 'slide-bar'; b.setAttribute('aria-hidden', 'true'); bn.prepend(b); }
    const a = bn.querySelector(':scope > .bn-item[aria-current="page"]');
    if (!a) { b.style.opacity = '0'; b.style.transform = `translateX(${bn.offsetWidth / 2 - 11}px) scaleX(0)`; }
    else {
      if (!b.dataset.ready) b.style.transition = 'none'; else b.style.transition = '';
      b.style.opacity = '1'; b.style.transform = `translateX(${a.offsetLeft + a.offsetWidth / 2 - 11}px)`; b.dataset.ready = '1';
      if (b.style.transition === 'none') requestAnimationFrame(() => { b.style.transition = ''; });
    }
  }
}

/* Thin progress bar for slow route loads. */
const prog = {
  el: null, t: 0,
  start() {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'route-bar'; this.el.setAttribute('aria-hidden', 'true'); document.body.append(this.el); }
    clearTimeout(this.t); this.el.className = 'route-bar';
    this.t = setTimeout(() => { this.el.className = 'route-bar run'; }, 140);
  },
  done() {
    if (!this.el) return;
    clearTimeout(this.t);
    if (this.el.classList.contains('run')) { this.el.className = 'route-bar end'; setTimeout(() => { if (this.el.classList.contains('end')) this.el.className = 'route-bar'; }, 700); }
    else this.el.className = 'route-bar';
  }
};

/* ---------- global, delegated behaviours ---------- */
document.addEventListener('pointerdown', (e) => {
  if (reduce() || e.button) return;
  const t = e.target.closest && e.target.closest('.btn, .icon-btn, .nav-link, button.chip, .tab');
  if (!t || t.disabled) return;
  const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.4;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (t.classList.contains('chip')) { t.style.setProperty('--ox', x + 'px'); t.style.setProperty('--oy', y + 'px'); }
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${x - d / 2}px;top:${y - d / 2}px`;
  t.append(s); s.addEventListener('animationend', () => s.remove());
}, { passive: true });

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let cur = null;
  const clear = (c) => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); };
  const tilt = rafThrottle((e) => {
    const c = e.target.closest && e.target.closest('.gcard');
    if (cur && cur !== c) clear(cur);
    cur = c; if (!c || reduce()) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 8).toFixed(2) + 'deg');
    c.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - .5) * 8).toFixed(2) + 'deg');
  });
  document.addEventListener('pointermove', tilt, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) clear(cur); cur = null; });
}

addEventListener('resize', rafThrottle(nav));

window.TWM = { motionPref, setMotionPref, reduce, transition, flip, morphHeight, flyFrom, slide, busyBtn, sheetIn, sheetOut, nav, prog, SPRING, EASE };
})();
