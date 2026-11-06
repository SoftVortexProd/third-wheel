/* Profile effects: small canvas animations drawn over a profile card (TW.fx('snow') returns the element to drop into a positioned parent).
   Each effect is a list of particles (init / step / draw) plus an optional backdrop. They pause while the tab is hidden, stop when the element
   leaves the page, and show a still frame when the system asks for reduced motion. */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const pick = (a) => a[(Math.random() * a.length) | 0];

const E = {
  sakura: {
    n: 22,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : R(-20, -4), s: R(5, 9), vy: R(.5, 1.1), vx: R(-.2, .5), r: R(0, TAU), vr: R(-.03, .03), ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y += p.vy; p.x += p.vx + Math.sin(t / 700 + p.ph) * .5; p.r += p.vr; return p.y > h + 12 || p.x > w + 14; },
    draw: (c, p) => { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = 'rgba(255,183,197,.85)'; c.beginPath(); c.ellipse(0, 0, p.s, p.s * .55, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(244,114,182,.7)'; c.beginPath(); c.ellipse(p.s * .25, 0, p.s * .45, p.s * .25, 0, 0, TAU); c.fill(); c.restore(); }
  },
  autumn: {
    n: 18,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : R(-20, -4), s: R(5, 8), vy: R(.6, 1.3), r: R(0, TAU), vr: R(-.05, .05), ph: R(0, 6), col: pick(['#f97316', '#dc2626', '#eab308', '#b45309']) }),
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 600 + p.ph) * .9; p.r += p.vr; return p.y > h + 12; },
    draw: (c, p) => { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.globalAlpha = .85; c.beginPath(); c.moveTo(0, -p.s); c.quadraticCurveTo(p.s, -p.s * .2, 0, p.s); c.quadraticCurveTo(-p.s, -p.s * .2, 0, -p.s); c.fill(); c.restore(); }
  },
  snow: {
    n: 48,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : R(-10, -2), s: R(1, 3.2), vy: R(.3, 1), ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 900 + p.ph) * .35; return p.y > h + 6; },
    draw: (c, p) => { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); }
  },
  rain: {
    n: 55,
    init: (p, w, h, first) => Object.assign(p, { x: R(-20, w), y: first ? R(0, h) : R(-30, -4), l: R(10, 20), vy: R(9, 15) }),
    step: (p, w, h) => { p.y += p.vy; p.x += p.vy * .18; return p.y > h + 24; },
    draw: (c, p) => { c.strokeStyle = 'rgba(147,197,253,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.l * .18, p.y + p.l); c.stroke(); }
  },
  embers: {
    n: 36,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(2, 10), s: R(1, 2.6), vy: R(.5, 1.5), life: first ? R(0, 1) : 1, ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 400 + p.ph) * .5; p.life -= .004; return p.life <= 0 || p.y < -6; },
    draw: (c, p) => { c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.life > .5 ? '#fbbf24' : '#f97316'; c.shadowColor = '#f97316'; c.shadowBlur = 6; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); c.shadowBlur = 0; c.globalAlpha = 1; }
  },
  stars: {
    n: 40,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), s: R(.6, 1.8), ph: R(0, 6), sp: R(.0015, .004) }),
    step: () => false,
    draw: (c, p, t) => { c.globalAlpha = .35 + .65 * Math.abs(Math.sin(t * p.sp + p.ph)); c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); c.globalAlpha = 1; }
  },
  fireflies: {
    n: 16,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), a: R(0, TAU), v: R(.15, .5), ph: R(0, 6) }),
    step: (p, w, h, t) => { p.a += R(-.08, .08); p.x += Math.cos(p.a) * p.v; p.y += Math.sin(p.a) * p.v; if (p.x < 0) p.x = w; if (p.x > w) p.x = 0; if (p.y < 0) p.y = h; if (p.y > h) p.y = 0; return false; },
    draw: (c, p, t) => { const a = .25 + .75 * Math.abs(Math.sin(t / 700 + p.ph)); const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9); g.addColorStop(0, `rgba(250,204,21,${a})`); g.addColorStop(1, 'rgba(250,204,21,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 9, 0, TAU); c.fill(); }
  },
  bubbles: {
    n: 18,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(4, 16), s: R(3, 9), vy: R(.3, .9), ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 700 + p.ph) * .35; return p.y < -12; },
    draw: (c, p) => { c.strokeStyle = 'rgba(186,230,253,.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(p.x - p.s * .35, p.y - p.s * .35, Math.max(1, p.s * .18), 0, TAU); c.fill(); }
  },
  confetti: {
    n: 36,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : R(-14, -4), w: R(4, 8), h: R(2, 4), vy: R(.9, 2), r: R(0, TAU), vr: R(-.15, .15), ph: R(0, 6), col: pick(['#f43f5e', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#facc15']) }),
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 500 + p.ph) * .6; p.r += p.vr; return p.y > h + 10; },
    draw: (c, p) => { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore(); }
  },
  hearts: {
    n: 14,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(6, 20), s: R(9, 17), vy: R(.5, 1.1), ph: R(0, 6), life: first ? R(.3, 1) : 1 }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 600 + p.ph) * .5; p.life -= .0025; return p.life <= 0 || p.y < -20; },
    draw: (c, p) => { c.globalAlpha = Math.min(1, p.life) * .8; c.font = p.s + 'px system-ui, sans-serif'; c.fillStyle = '#f472b6'; c.textAlign = 'center'; c.fillText('♥', p.x, p.y); c.globalAlpha = 1; }
  },
  matrix: {
    n: 0,
    cols: true,
    init: (p, w, h, first, i, total) => Object.assign(p, { x: (i + .5) * (w / total), y: first ? R(-h, h) : R(-h * .6, -10), v: R(1.4, 3.2), cs: Array.from({ length: 14 }, () => String.fromCharCode(0x30A0 + (Math.random() * 90 | 0))) }),
    step: (p, w, h) => { p.y += p.v; if (Math.random() < .08) p.cs[(Math.random() * p.cs.length) | 0] = String.fromCharCode(0x30A0 + (Math.random() * 90 | 0)); return p.y - p.cs.length * 13 > h; },
    draw: (c, p) => { c.font = '12px monospace'; c.textAlign = 'center'; for (let i = 0; i < p.cs.length; i++) { const y = p.y - i * 13; c.fillStyle = i === 0 ? 'rgba(220,255,230,.95)' : `rgba(34,197,94,${Math.max(0, .75 - i * .055)})`; c.fillText(p.cs[i], p.x, y); } }
  },
  flame: {
    n: 44,
    back: (c, w, h) => { const g = c.createLinearGradient(0, h, 0, h * .55); g.addColorStop(0, 'rgba(239,68,68,.30)'); g.addColorStop(1, 'rgba(239,68,68,0)'); c.fillStyle = g; c.fillRect(0, h * .55, w, h * .45); },
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(h * .6, h) : h + R(0, 8), s: R(4, 11), vy: R(.7, 1.9), life: first ? R(.2, 1) : 1 }),
    step: (p) => { p.y -= p.vy; p.x += R(-.6, .6); p.s *= .985; p.life -= .012; return p.life <= 0; },
    draw: (c, p) => { c.globalAlpha = Math.max(0, p.life) * .55; c.fillStyle = p.life > .65 ? '#fde047' : p.life > .35 ? '#fb923c' : '#ef4444'; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); c.globalAlpha = 1; }
  },
  sparks: {
    n: 20,
    bolt: true,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), life: R(0, 1), s: R(1, 2.2) }),
    step: (p, w, h) => { p.life -= .03; if (p.life <= 0) { p.x = R(0, w); p.y = R(0, h); p.life = 1; } return false; },
    draw: (c, p) => { c.globalAlpha = Math.max(0, p.life); c.fillStyle = '#7dd3fc'; c.shadowColor = '#38bdf8'; c.shadowBlur = 8; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); c.shadowBlur = 0; c.globalAlpha = 1; }
  },
  aurora: {
    n: 0,
    back: (c, w, h, t) => {
      const bands = [['34,197,94', 0], ['56,189,248', 2], ['167,139,250', 4]];
      for (const [col, o] of bands) {
        const g = c.createLinearGradient(0, 0, 0, h * .6); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.5, `rgba(${col},.28)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.beginPath(); c.moveTo(0, 0);
        for (let x = 0; x <= w; x += 8) c.lineTo(x, h * .18 + Math.sin(x / 70 + t / 1400 + o) * 16 + Math.sin(x / 30 - t / 900 + o) * 6 + o * 4);
        c.lineTo(w, h * .6); c.lineTo(0, h * .6); c.closePath(); c.fill();
      }
    },
    init: () => {}, step: () => false, draw: () => {}
  },
  scanlines: {
    n: 0,
    back: (c, w, h, t) => {
      c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
      const y = (t / 18) % (h + 80) - 40; const g = c.createLinearGradient(0, y - 30, 0, y + 30); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(160,255,200,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, y - 30, w, 60);
      c.fillStyle = 'rgba(255,0,0,.025)'; c.fillRect(0, 0, w / 3, h); c.fillStyle = 'rgba(0,0,255,.025)'; c.fillRect(w * 2 / 3, 0, w / 3, h);
    },
    init: () => {}, step: () => false, draw: () => {}
  }
};
const IDS = Object.keys(E);
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Returns the overlay element. Put it inside a position:relative parent; it covers it and ignores the mouse. */
function fx(id) {
  const def = E[id];
  const box = document.createElement('div'); box.className = 'profile-effect fx-' + id;
  if (!def) return box;
  const cv = document.createElement('canvas'); box.append(cv);
  const c = cv.getContext('2d');
  let w = 0, h = 0, parts = [], raf = 0, running = false, bolt = null, nextBolt = performance.now() + 900;
  const seed = () => {
    const n = def.cols ? Math.max(4, Math.floor(w / 16)) : def.n;
    parts = Array.from({ length: n }, (_, i) => { const p = {}; def.init(p, w, h, true, i, n); return p; });
  };
  const size = () => {
    const r = box.getBoundingClientRect(); const d = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h) return;
    w = nw; h = nh; cv.width = Math.round(w * d); cv.height = Math.round(h * d); c.setTransform(d, 0, 0, d, 0, 0); seed();
  };
  function lightning(t) {
    if (t > nextBolt && !bolt) { let x = R(w * .2, w * .8), y = 0; const pts = [[x, y]]; while (y < h * R(.4, .8)) { x += R(-18, 18); y += R(10, 22); pts.push([x, y]); } bolt = { pts, until: t + 140 }; nextBolt = t + R(1200, 3200); }
    if (bolt) {
      if (t > bolt.until) bolt = null;
      else { c.strokeStyle = 'rgba(186,230,253,.9)'; c.shadowColor = '#38bdf8'; c.shadowBlur = 10; c.lineWidth = 1.6; c.beginPath(); bolt.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.shadowBlur = 0; }
    }
  }
  function frame(t) {
    if (!box.isConnected) { running = false; return; }
    size(); c.clearRect(0, 0, w, h);
    if (def.back) def.back(c, w, h, t);
    parts.forEach((p, i) => { if (def.step(p, w, h, t)) def.init(p, w, h, false, i, parts.length); def.draw(c, p, t); });
    if (def.bolt) lightning(t);
    if (running && !reduce()) raf = requestAnimationFrame(frame);
  }
  const go = () => { if (running) return; running = true; raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (box.isConnected) go(); });
  // start once the element is on the page (it is created before it is inserted)
  const boot = () => { if (!box.isConnected) { if (++boot.n < 120) requestAnimationFrame(boot); return; } size(); for (let i = 0; i < 40 && parts.length; i++) parts.forEach((p, j) => { if (def.step(p, w, h, 0)) def.init(p, w, h, false, j, parts.length); }); go(); if (reduce()) frame(performance.now()); };
  boot.n = 0; requestAnimationFrame(boot);
  return box;
}
TW.fx = fx; TW.fxIds = IDS;
})();
