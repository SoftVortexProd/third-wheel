/* Profile effects: canvas animations drawn over a profile card (TW.fx('snow') returns the element to drop into a positioned parent).
   Every effect is a set of particles (init / step / draw) plus an optional backdrop. Particles have a depth (far = small, slow, faint; near = big, fast, bright),
   glows use additive blending, and some effects leave short trails. Animation pauses while the tab is hidden, stops when the element leaves the page,
   and shows one still frame when the system asks for reduced motion. */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const pick = (a) => a[(Math.random() * a.length) | 0];

/** soft glowing dot (rgb like '250,204,21') */
function glow(c, x, y, r, rgb, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.35, `rgba(${rgb},${a * .45})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
/** heart outline centred on 0,0 with width w */
function heart(c, w) {
  const s = w / 2; c.beginPath(); c.moveTo(0, s * .9);
  c.bezierCurveTo(-s * 1.7, -s * .1, -s * .9, -s * 1.3, 0, -s * .35);
  c.bezierCurveTo(s * .9, -s * 1.3, s * 1.7, -s * .1, 0, s * .9); c.closePath();
}

const E = {
  /* petals tumble: a flipping ellipse (scaleY = cos of the flip angle) with a darker centre */
  sakura: {
    n: 26,
    init: (p, w, h, first) => { const z = R(.55, 1.3); Object.assign(p, { z, x: R(-20, w), y: first ? R(0, h) : R(-24, -4), s: 6 * z, vy: .5 * z + R(.1, .45), vx: R(.2, .6) * z, r: R(0, TAU), vr: R(-.03, .03), fl: R(0, TAU), vf: R(.03, .07), ph: R(0, 6) }); },
    step: (p, w, h, t) => { p.y += p.vy; p.x += p.vx + Math.sin(t / 900 + p.ph) * .5; p.r += p.vr; p.fl += p.vf; return p.y > h + 14 || p.x > w + 20; },
    draw: (c, p) => {
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.scale(1, Math.max(.18, Math.abs(Math.cos(p.fl)))); c.globalAlpha = .55 + .4 * (p.z - .5);
      const g = c.createLinearGradient(-p.s, 0, p.s, 0); g.addColorStop(0, '#ffd6e2'); g.addColorStop(.6, '#fda4c0'); g.addColorStop(1, '#f472b6');
      c.fillStyle = g; c.beginPath(); c.moveTo(-p.s, 0); c.quadraticCurveTo(-p.s * .3, -p.s * .95, p.s, -p.s * .15); c.quadraticCurveTo(p.s * .5, p.s * .9, -p.s, 0); c.fill();
      c.restore();
    }
  },
  autumn: {
    n: 20,
    init: (p, w, h, first) => { const z = R(.6, 1.3); Object.assign(p, { z, x: R(-10, w), y: first ? R(0, h) : R(-24, -4), s: 6.5 * z, vy: .6 * z + R(.1, .5), r: R(0, TAU), vr: R(-.04, .04), fl: R(0, TAU), vf: R(.02, .05), ph: R(0, 6), col: pick(['#f97316', '#dc2626', '#eab308', '#b45309', '#ea580c']) }); },
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 650 + p.ph) * 1.1; p.r += p.vr; p.fl += p.vf; return p.y > h + 14; },
    draw: (c, p) => {
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.scale(Math.max(.25, Math.abs(Math.cos(p.fl))), 1); c.globalAlpha = .6 + .3 * (p.z - .5); c.fillStyle = p.col;
      c.beginPath(); c.moveTo(0, -p.s); c.bezierCurveTo(p.s * 1.1, -p.s * .5, p.s * .9, p.s * .6, 0, p.s); c.bezierCurveTo(-p.s * .9, p.s * .6, -p.s * 1.1, -p.s * .5, 0, -p.s); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = .8; c.beginPath(); c.moveTo(0, -p.s); c.lineTo(0, p.s * 1.15); c.stroke(); c.restore();
    }
  },
  /* three depth layers; near flakes are big and soft */
  snow: {
    n: 70,
    init: (p, w, h, first) => { const z = Math.random(); Object.assign(p, { z, x: R(0, w), y: first ? R(0, h) : R(-10, -2), s: 1 + z * 3.2, vy: .25 + z * 1.1, ph: R(0, 6) }); },
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 1100 + p.ph) * (.15 + p.z * .35) + .12; return p.y > h + 8; },
    draw: (c, p) => glow(c, p.x, p.y, p.s * 1.7, '255,255,255', .35 + p.z * .55)
  },
  rain: {
    n: 70,
    trail: .55,
    back: (c, w, h) => { const g = c.createLinearGradient(0, h * .6, 0, h); g.addColorStop(0, 'rgba(100,150,220,0)'); g.addColorStop(1, 'rgba(100,150,220,.16)'); c.fillStyle = g; c.fillRect(0, h * .6, w, h * .4); },
    init: (p, w, h, first) => { const z = R(.5, 1.2); Object.assign(p, { z, x: R(-30, w), y: first ? R(0, h) : R(-40, -4), l: 12 * z + R(0, 8), vy: 9 * z + R(0, 4) }); },
    step: (p, w, h) => { p.y += p.vy; p.x += p.vy * .2; return p.y > h + 24; },
    draw: (c, p) => { const g = c.createLinearGradient(p.x, p.y, p.x + p.l * .2, p.y + p.l); g.addColorStop(0, 'rgba(173,210,255,0)'); g.addColorStop(1, `rgba(173,210,255,${.35 + p.z * .35})`); c.strokeStyle = g; c.lineWidth = p.z > .9 ? 1.4 : 1; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.l * .2, p.y + p.l); c.stroke(); }
  },
  embers: {
    n: 42, blend: true,
    back: (c, w, h, t) => { const g = c.createLinearGradient(0, h, 0, h * .45); g.addColorStop(0, 'rgba(234,88,12,.22)'); g.addColorStop(1, 'rgba(234,88,12,0)'); c.fillStyle = g; c.fillRect(0, h * .45, w, h * .55); },
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(2, 14), s: R(1.2, 3.2), vy: R(.5, 1.7), life: first ? R(0, 1) : 1, ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 380 + p.ph) * .55 + .12; p.life -= .0042; return p.life <= 0 || p.y < -8; },
    draw: (c, p, t) => { const f = .6 + .4 * Math.sin(t / 90 + p.ph * 7); glow(c, p.x, p.y, p.s * 4.2, p.life > .55 ? '253,186,60' : '249,115,22', Math.max(0, p.life) * f * .9); c.fillStyle = `rgba(255,240,200,${Math.max(0, p.life)})`; c.beginPath(); c.arc(p.x, p.y, p.s * .55, 0, TAU); c.fill(); }
  },
  /* twinkling stars with soft halos; every few seconds a shooting star crosses */
  stars: {
    n: 46, blend: true, trail: .35,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), s: R(.5, 1.7), ph: R(0, 6), sp: R(.0012, .0035), tw: R(0, 1) }),
    step: () => false,
    draw: (c, p, t) => { const a = .3 + .7 * Math.abs(Math.sin(t * p.sp + p.ph)); if (p.s > 1.3) glow(c, p.x, p.y, p.s * 4, '190,210,255', a * .5); c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); },
    extra: (c, w, h, t, st) => {
      if (!st.s && t > (st.next || 600)) { st.s = { x: R(w * .1, w * .8), y: R(0, h * .35), v: R(6, 9), life: 1 }; st.next = t + R(2500, 5500); }
      if (st.s) { const s = st.s; s.x += s.v; s.y += s.v * .55; s.life -= .03; c.strokeStyle = `rgba(255,255,255,${Math.max(0, s.life)})`; c.lineWidth = 1.6; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - 26, s.y - 14); c.stroke(); if (s.life <= 0) st.s = null; }
    }
  },
  fireflies: {
    n: 18, blend: true,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), a: R(0, TAU), v: R(.18, .55), ph: R(0, 6), r: R(5, 9) }),
    step: (p, w, h, t) => { p.a += Math.sin(t / 1300 + p.ph) * .06 + R(-.03, .03); p.x += Math.cos(p.a) * p.v; p.y += Math.sin(p.a) * p.v * .8 - .05; if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10; return false; },
    draw: (c, p, t) => { const a = Math.pow(Math.max(0, Math.sin(t / 650 + p.ph)), 2); glow(c, p.x, p.y, p.r * 2.6, '253,224,71', .08 + a * .55); c.fillStyle = `rgba(255,250,200,${.35 + a * .65})`; c.beginPath(); c.arc(p.x, p.y, 1.5, 0, TAU); c.fill(); }
  },
  bubbles: {
    n: 20,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(6, 20), s: R(3, 10), vy: R(.3, .95), ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 650 + p.ph) * .4; return p.y < -14; },
    draw: (c, p) => {
      const g = c.createRadialGradient(p.x - p.s * .3, p.y - p.s * .3, p.s * .1, p.x, p.y, p.s);
      g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(.7, 'rgba(147,210,255,.08)'); g.addColorStop(1, 'rgba(147,210,255,.45)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.s, 0, TAU); c.fill(); c.strokeStyle = 'rgba(200,235,255,.55)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(p.x - p.s * .35, p.y - p.s * .4, p.s * .2, p.s * .12, -.6, 0, TAU); c.fill();
    }
  },
  /* paper confetti: each piece flips in 3D while falling and swaying */
  confetti: {
    n: 44,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : R(-14, -4), w: R(5, 9), h: R(3, 5), vy: R(.9, 2.1), r: R(0, TAU), vr: R(-.1, .1), fl: R(0, TAU), vf: R(.06, .16), ph: R(0, 6), col: pick(['#f43f5e', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#facc15', '#fb7185']) }),
    step: (p, w, h, t) => { p.y += p.vy; p.x += Math.sin(t / 520 + p.ph) * .7; p.r += p.vr; p.fl += p.vf; return p.y > h + 10; },
    draw: (c, p) => { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.scale(1, Math.cos(p.fl)); c.fillStyle = p.col; c.globalAlpha = .9; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore(); }
  },
  hearts: {
    n: 16, blend: true,
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(0, h) : h + R(8, 24), s: R(9, 20), vy: R(.45, 1.1), ph: R(0, 6), life: first ? R(.3, 1) : 1 }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 650 + p.ph) * .5; p.life -= .0026; return p.life <= 0 || p.y < -22; },
    draw: (c, p, t) => {
      const beat = 1 + .08 * Math.sin(t / 210 + p.ph); c.save(); c.translate(p.x, p.y); c.rotate(Math.sin(t / 800 + p.ph) * .25); c.scale(beat, beat); c.globalAlpha = Math.min(1, p.life) * .85;
      heart(c, p.s); const g = c.createLinearGradient(0, -p.s * .6, 0, p.s * .9); g.addColorStop(0, '#fda4af'); g.addColorStop(1, '#e11d48'); c.fillStyle = g; c.shadowColor = '#fb7185'; c.shadowBlur = 8; c.fill(); c.restore();
    }
  },
  /* katakana rain: bright head, fading tail, columns of different speed */
  matrix: {
    n: 0, cols: true,
    back: (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,30,10,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); },
    init: (p, w, h, first, i, total) => Object.assign(p, { x: (i + .5) * (w / total), y: first ? R(-h, h) : R(-h * .6, -10), v: R(1.2, 3.4), n: 10 + ((Math.random() * 10) | 0), cs: Array.from({ length: 20 }, () => String.fromCharCode(0x30A0 + (Math.random() * 90 | 0))) }),
    step: (p, w, h) => { p.y += p.v; if (Math.random() < .1) p.cs[(Math.random() * p.cs.length) | 0] = String.fromCharCode(0x30A0 + (Math.random() * 90 | 0)); return p.y - p.n * 13 > h; },
    draw: (c, p) => {
      c.font = '12px monospace'; c.textAlign = 'center';
      for (let i = 0; i < p.n; i++) { const y = p.y - i * 13; if (y < -13 || y > 1e4) continue; c.fillStyle = i === 0 ? 'rgba(230,255,235,.98)' : `rgba(34,${197 - i * 4},94,${Math.max(0, .8 - i * (.8 / p.n))})`; if (i === 0) { c.shadowColor = '#86efac'; c.shadowBlur = 8; } c.fillText(p.cs[i], p.x, y); c.shadowBlur = 0; }
    }
  },
  /* tongues of fire rising from the bottom edge */
  flame: {
    n: 110, blend: true,
    back: (c, w, h, t) => { const g = c.createLinearGradient(0, h, 0, h * .5); g.addColorStop(0, `rgba(239,68,68,${.34 + .06 * Math.sin(t / 130)})`); g.addColorStop(.5, 'rgba(249,115,22,.12)'); g.addColorStop(1, 'rgba(249,115,22,0)'); c.fillStyle = g; c.fillRect(0, h * .5, w, h * .5); },
    init: (p, w, h, first) => Object.assign(p, { x: R(0, w), y: first ? R(h * .55, h) : h + R(0, 10), s: R(3, 9), vy: R(.9, 2.6), life: first ? R(.2, 1) : 1, ph: R(0, 6) }),
    step: (p, w, h, t) => { p.y -= p.vy; p.x += Math.sin(t / 220 + p.ph) * .8; p.s *= .988; p.life -= .014; return p.life <= 0; },
    draw: (c, p) => { const l = Math.max(0, p.life); glow(c, p.x, p.y, p.s * 1.9, l > .7 ? '253,224,71' : l > .4 ? '251,146,60' : '239,68,68', l * .5); }
  },
  /* lightning bolts with branches, a screen flash, and a few fizzing sparks */
  sparks: {
    n: 16, blend: true, bolt: true,
    init: (p, w, h) => Object.assign(p, { x: R(0, w), y: R(0, h), life: R(0, 1), s: R(1, 2.2) }),
    step: (p, w, h) => { p.life -= .035; if (p.life <= 0) { p.x = R(0, w); p.y = R(0, h); p.life = 1; } return false; },
    draw: (c, p) => { glow(c, p.x, p.y, 7, '125,211,252', Math.max(0, p.life) * .7); c.fillStyle = `rgba(255,255,255,${Math.max(0, p.life)})`; c.beginPath(); c.arc(p.x, p.y, p.s * .6, 0, TAU); c.fill(); }
  },
  /* northern lights: layered curtains made of thin vertical rays */
  aurora: {
    n: 0, blend: true,
    back: (c, w, h, t) => {
      const layers = [['52,211,153', 0, .26], ['56,189,248', 2.1, .22], ['167,139,250', 4.2, .2]];
      for (const [rgb, o, al] of layers) {
        for (let x = 0; x < w; x += 4) {
          const top = h * .12 + Math.sin(x / 85 + t / 1700 + o) * 18 + Math.sin(x / 33 - t / 1100 + o) * 7;
          const len = h * (.34 + .1 * Math.sin(x / 55 + t / 2300 + o));
          const g = c.createLinearGradient(0, top, 0, top + len); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.25, `rgba(${rgb},${al * (.7 + .3 * Math.sin(x / 20 + t / 600 + o))})`); g.addColorStop(1, `rgba(${rgb},0)`);
          c.fillStyle = g; c.fillRect(x, top, 4, len);
        }
      }
    },
    init: () => {}, step: () => false, draw: () => {}
  },
  scanlines: {
    n: 0,
    back: (c, w, h, t) => {
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = v; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
      const y = (t / 16) % (h + 120) - 60; const g = c.createLinearGradient(0, y - 40, 0, y + 40); g.addColorStop(0, 'rgba(160,255,200,0)'); g.addColorStop(.5, 'rgba(160,255,200,.1)'); g.addColorStop(1, 'rgba(160,255,200,0)'); c.fillStyle = g; c.fillRect(0, y - 40, w, 80);
      c.fillStyle = 'rgba(255,0,60,.04)'; c.fillRect(0, 0, w / 3, h); c.fillStyle = 'rgba(0,120,255,.04)'; c.fillRect(w * 2 / 3, 0, w / 3, h);
      if (Math.sin(t / 53) > .985) { c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(0, 0, w, h); }
    },
    init: () => {}, step: () => false, draw: () => {}
  }
};
const IDS = Object.keys(E);
const reduce = () => document.documentElement.dataset.motion === 'off';   // the app's own "Animations: Off" (the OS setting is ignored: many PCs report it by default)

/** Returns the overlay element. Put it inside a position:relative parent; it covers it and ignores the mouse. */
function fx(id) {
  const def = E[id];
  const box = document.createElement('div'); box.className = 'profile-effect fx-' + id;
  if (!def) return box;
  const cv = document.createElement('canvas'); box.append(cv);
  const c = cv.getContext('2d');
  let w = 0, h = 0, parts = [], raf = 0, running = false, bolt = null, flash = 0, nextBolt = performance.now() + 900; const st = {};
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
    if (t > nextBolt && !bolt) {
      let x = R(w * .2, w * .8), y = 0; const pts = [[x, y]], branches = [];
      const limit = h * R(.45, .85);
      while (y < limit) { x += R(-16, 16); y += R(9, 20); pts.push([x, y]); if (Math.random() < .22) { let bx = x, by = y; const b = [[bx, by]]; for (let k = 0; k < 4; k++) { bx += R(-14, 18); by += R(8, 14); b.push([bx, by]); } branches.push(b); } }
      bolt = { pts, branches, until: t + 190 }; flash = .22; nextBolt = t + R(1400, 3600);
    }
    if (flash > .01) { c.fillStyle = `rgba(190,225,255,${flash})`; c.fillRect(0, 0, w, h); flash *= .82; }
    if (bolt) {
      if (t > bolt.until) bolt = null;
      else {
        const line = (pts, wd) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.lineWidth = wd; c.stroke(); };
        c.lineJoin = 'round'; c.shadowColor = '#38bdf8'; c.shadowBlur = 14;
        c.strokeStyle = 'rgba(125,211,252,.55)'; line(bolt.pts, 5); bolt.branches.forEach(b => line(b, 3));
        c.strokeStyle = 'rgba(255,255,255,.95)'; line(bolt.pts, 1.8); bolt.branches.forEach(b => line(b, 1)); c.shadowBlur = 0;
      }
    }
  }
  function frame(t) {
    if (!box.isConnected) { running = false; return; }
    size();
    if (def.trail) { c.globalCompositeOperation = 'destination-out'; c.fillStyle = `rgba(0,0,0,${def.trail})`; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over'; }
    else c.clearRect(0, 0, w, h);
    if (def.back) def.back(c, w, h, t);
    if (def.blend) c.globalCompositeOperation = 'lighter';
    parts.forEach((p, i) => { if (def.step(p, w, h, t)) def.init(p, w, h, false, i, parts.length); def.draw(c, p, t); });
    if (def.extra) def.extra(c, w, h, t, st);
    c.globalCompositeOperation = 'source-over';
    if (def.bolt) lightning(t);
    if (running && !reduce()) raf = requestAnimationFrame(frame);
  }
  const go = () => { if (running) return; running = true; raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (box.isConnected) go(); });
  // start once the element is on the page (it is created before it is inserted)
  const boot = () => { if (!box.isConnected) { if (++boot.n < 120) requestAnimationFrame(boot); return; } size(); for (let i = 0; i < 60 && parts.length; i++) parts.forEach((p, j) => { if (def.step(p, w, h, i * 16)) def.init(p, w, h, false, j, parts.length); }); go(); if (reduce()) frame(performance.now()); };
  boot.n = 0; requestAnimationFrame(boot);
  return box;
}
TW.fx = fx; TW.fxIds = IDS;
})();
