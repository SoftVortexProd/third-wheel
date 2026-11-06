
function detectRegion() {
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
    if (tz.startsWith('europe/')) return 'EU';
    if (tz.startsWith('africa/')) return 'Africa';
    if (tz.startsWith('australia/') || tz.startsWith('pacific/')) return 'OCE';
    if (tz.includes('dubai') || tz.includes('riyadh') || tz.includes('jerusalem') || tz.includes('baghdad') || tz.includes('beirut') || tz.includes('tehran') || tz.includes('kuwait') || tz.includes('qatar')) return 'ME';
    if (tz.startsWith('asia/')) return 'Asia';
    if (tz.startsWith('america/')) {
      if (tz.includes('sao_paulo') || tz.includes('buenos_aires') || tz.includes('santiago') || tz.includes('bogota') || tz.includes('lima') || tz.includes('caracas') || tz.includes('montevideo') || tz.includes('asuncion') || tz.includes('guyana') || tz.includes('la_paz')) return 'SA';
      if (tz.includes('los_angeles') || tz.includes('vancouver') || tz.includes('tijuana') || tz.includes('denver') || tz.includes('phoenix') || tz.includes('edmonton') || tz.includes('boise') || tz.includes('anchorage')) return 'NA-West';
      return 'NA-East';
    }
  } catch {}
  return 'EU';
}

function showSuspendedAppeal(u, p, banReason) {
  const reasonMsg = h('p', { class: 'muted', style: 'margin-bottom:12px', text: tr('Your account has been suspended: {0}', banReason) });
  const appealInput = h('textarea', { class: 'input', rows: 4, placeholder: tr('Explain why your account should be unbanned...'), maxlength: 2000 });
  const submitBtn = h('button', { class: 'btn primary block', type: 'button', text: tr('Submit appeal') });
  const errBox = h('div', { class: 'form-error', role: 'alert' });

  const modalBox = modal(tr('Account Suspended'),
    h('div', { class: 'stack', style: 'gap:12px;min-width:320px;padding:4px 0;' },
      reasonMsg,
      h('label', { class: 'label', text: tr('Appeal this ban') }),
      appealInput,
      errBox,
      h('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' },
        h('button', { class: 'btn secondary', type: 'button', text: tr('Cancel'), onclick: () => modalBox.close() }),
        submitBtn
      )
    )
  );

  submitBtn.onclick = async () => {
    const text = appealInput.value.trim();
    if (!text) { errBox.textContent = tr('Please write an explanation for your appeal.'); return; }
    submitBtn.disabled = true;
    try {
      await api('POST', '/api/auth/appeal', { username: u, password: p, reason: text });
      modalBox.close();
      toast(tr('Appeal submitted! An administrator will review your account.'));
    } catch (err) {
      submitBtn.disabled = false;
      errBox.textContent = err.message || tr('Failed to submit appeal');
    }
  };
}
function calcAge(bd) {
  if (!bd) return 0;
  const b = new Date(bd), today = new Date();
  if (isNaN(b.getTime())) return 0;
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}
/* Third Wheel — client. DOM is built with createElement/textContent only (no innerHTML). */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const ICONS = {
  feed: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  x: 'M18 6L6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6',
  pad: 'M6 12h4M8 10v4M15 13h.01M18 11h.01M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.3 6.5A3 3 0 0 0 4.4 18c1 0 1.8-.5 2.3-1.3L7.5 15h9l.8 1.7c.5.8 1.3 1.3 2.3 1.3a3 3 0 0 0 2.9-3.3l-1.3-6.5A4 4 0 0 0 17.3 5z',
  check: 'M20 6L9 17l-5-5',
  chev: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  speaker: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  fullexit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2 6-6 2 2-6z',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  mega: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  video: 'M23 7l-7 5 7 5V7zM1 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5z',
  monitor: 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  gamepad: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.3 6.5A3 3 0 0 0 4.4 18c1 0 1.8-.5 2.3-1.3L7.5 15h9l.8 1.7c.5.8 1.3 1.3 2.3 1.3a3 3 0 0 0 2.9-3.3l-1.3-6.5A4 4 0 0 0 17.3 5z',
  steam: 'M11.979 2a10 10 0 0 0-9.979 9.805l5.727 2.368a3.298 3.298 0 0 1 1.867-.577l2.29-3.31a4.34 4.34 0 0 1 4.1-6.286 4.35 4.35 0 1 1-4.35 4.35c0-.097.009-.192.025-.286L8.41 11.23a3.3 3.3 0 0 1-2.915 3.193L3.11 20.08A10 10 0 1 0 11.979 2zm3.98 4.35a2.175 2.175 0 1 0 0 4.35 2.175 2.175 0 0 0 0-4.35zm-8.48 9.35a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
  discord: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'
};
function icon(name, size = 22) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  const isFilled = name === 'steam' || name === 'discord';
  if (isFilled) {
    s.setAttribute('fill', 'currentColor');
    s.setAttribute('stroke', 'none');
  } else {
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  }
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', ICONS[name] || ''); s.append(p);
  return s;
}
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return e;
}
/* Server HTML-encodes user text. Decode entities to plain text only; the result is only ever used via textContent. */
const domParser = new DOMParser();
function T(s) {
  s = String(s ?? '');
  if (!s.includes('&')) return s;
  return domParser.parseFromString('<!doctype html><body>' + s, 'text/html').body.textContent || '';
}
const gname = (g) => (typeof g === 'string' ? g : (g && (g.name || g.id)) || '');
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : '#4f5ee6');
function ink(c) {
  let x = safeColor(c).slice(1); if (x.length < 6) x = x.split('').map(d => d + d).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(x.substr(i, 2), 16) || 0);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000000' : '#ffffff';
}
/* Translate a UI string (English text is the key). tr('Hi {name}', { name }) interpolates. Falls back to English. */
const tr = (key, v) => (window.TWPrefs ? TWPrefs.t(key, v) : (v && typeof v === 'object' ? key.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : (v || key)));
const STATUS = { get online() { return tr('Online'); }, get idle() { return tr('Idle'); }, get dnd() { return tr('Do not disturb'); }, get offline() { return tr('Offline'); }, get invisible() { return tr('Offline'); } };
const statusKey = (s) => (STATUS[s] ? (s === 'invisible' ? 'offline' : s) : 'offline');
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;
const nid = (p) => p + (++uid);

/* What to call someone: their display name, falling back to their username. */
const nm = (u) => T((u && (u.displayName || u.username)) || '?');
const AV_RE = /^\/api\/avatars\/\d+\?v=\d+$/;

function playingStatusText(p) {
  if (!p || !p.playing) return '';
  let extra = p.playingWith;
  if ((extra == null || extra <= 0) && S && S.mine && S.mine.length) {
    const pGame = String(p.playing).trim().toLowerCase();
    const match = S.mine.find(g => {
      const gGame = String(g.game || '').trim().toLowerCase();
      return gGame && (gGame === pGame || pGame.includes(gGame) || gGame.includes(pGame));
    });
    if (match && match.memberCount > 1) {
      extra = match.memberCount - 1;
    }
  }
  if (extra && extra > 0) {
    return tr('Playing {game} with +{count}', { game: T(p.playing), count: extra });
  }
  return tr('Playing {game}', { game: T(p.playing) });
}

function avatar(u, size = 'md', withStatus = false) {
  u = u || {};
  const el = h('span', { class: 'avatar ' + size, 'aria-hidden': 'true' }, (nm(u).trim()[0] || '?').toUpperCase());
  el.style.background = safeColor(u.avatarColor); el.style.color = ink(u.avatarColor);
  if (typeof u.avatar === 'string' && AV_RE.test(u.avatar)) {
    const noAnim = typeof TWPrefs !== 'undefined' && TWPrefs.get().disablePfpAnimation;
    if (noAnim) {
      const cv = h('canvas', { class: 'avatar-static' });
      const img = new Image();
      img.src = u.avatar;
      img.onload = () => {
        try {
          cv.width = img.naturalWidth || 64;
          cv.height = img.naturalHeight || 64;
          const ctx = cv.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, cv.width, cv.height);
        } catch { /* fallback */ }
      };
      el.append(cv);
    } else {
      const img = h('img', { src: u.avatar, alt: '', decoding: 'async' });
      img.addEventListener('error', () => img.remove());
      el.append(img);
    }
  }
  // RCKT avatar frame: an animated ring around the picture (css/frames.css). The server only sends rame for people who currently have RCKT.
  const core = u.frame && /^[a-z]{3,12}$/.test(u.frame) ? h('span', { class: 'framed ' + size, 'data-frame': u.frame }, el) : el;
  if (!withStatus) return core;
  return h('span', { class: 'av-wrap' }, core, h('span', { class: 'dot ' + statusKey(u.status), 'aria-hidden': 'true' }));
}

function groupTile(g, sz = '') {
  const cls = 'gtile' + (sz ? ' ' + sz : '');
  if (g && g.icon) {
    return h('span', { class: cls, 'aria-hidden': 'true' },
      h('img', { src: g.icon, alt: '', style: 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;' }));
  }
  const tile = h('span', { class: cls, 'aria-hidden': 'true', text: (T(g ? g.name : '?')[0] || '?').toUpperCase() });
  tile.style.background = safeColor(g ? g.color : '#7c8cff');
  tile.style.color = ink(g ? g.color : '#7c8cff');
  return tile;
}

/* ================= api ================= */
function getDeviceId() {
  let d = '';
  try {
    d = localStorage.getItem('tw_device_id') || '';
    if (!d || d.length < 8) {
      d = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('tw_device_id', d);
    }
  } catch {}
  return d;
}
class ApiError extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }
async function api(method, url, body) {
  const o = { method, credentials: 'same-origin', headers: { 'X-TW-Device-ID': getDeviceId() } };
  if (method !== 'GET') {
    o.headers['X-TW'] = '1'; o.headers['Content-Type'] = 'application/json';
    if (body !== undefined) o.body = JSON.stringify(body);
  }
  let r;
  try { r = await fetch(url, o); } catch { throw new ApiError('Cannot reach the server. Check your connection.', 0); }
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    if (r.status === 401 && S.me && !url.startsWith('/api/auth')) loggedOut();
    if (r.status === 503 && data && data.maintenance && S.me && !S.me.isAdmin) { S.site = { ...S.site, maintenance: { on: true, message: data.error } }; applySite(); }
    throw new ApiError((data && data.error) || `Something went wrong (${r.status}).`, r.status, data);
  }
  return data;
}
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
const enc = encodeURIComponent;

/* ================= state ================= */
/* Friends, invites, requests, groups and open chats refresh every 3 seconds. */
const POLL_MS = 3000;
/* While the live connection (js/rt.js) is up, polling only runs as a slow safety net; the server pokes us the moment something changes. */
const every = (fn, ms) => window.TWRT ? TWRT.every(fn, ms) : setInterval(fn, ms);
const S = {
  me: null, meta: { games: [], regions: [] },
  friends: [], mine: [], invites: [], reqs: { incoming: [], outgoing: [] },
  q: { q: '', game: '', mode: '', region: '', ageMin: '', ageMax: '', tab: 'groups' },
  onData: null, chatTimer: null, pollTimer: null, tick: 0, sig: {}, tok: 0, el: {},
  site: { maintenance: { on: false, message: '' }, closed: {} }, maint: false, closedSig: '{}'
};

/* ================= ui kit ================= */
function toast(msg, kind) {
  const box = $('#toasts');
  const t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : '') }, T(msg));
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'error' ? 4500 : 2600);
}
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true; const done = TWM.busyBtn(btn);
  try { return await fn(); }
  catch (e) { toast(e.message || 'Something went wrong.', 'error'); }
  finally { btn.disabled = false; done(); }
}
function btn(label, o = {}) {
  return h('button', { type: o.type || 'button', class: 'btn ' + (o.cls || ''), onclick: o.onclick, 'aria-label': o.aria }, o.icon ? icon(o.icon, 16) : null, label);
}
/* ---- custom popup list (shared by the dropdown and the suggestion box) ---- */
let livePop = null;
function makePopup(anchor, onPick) {
  let pop = null, items = [], act = -1;
  const lid = nid('lb');
  const place = () => {
    const r = anchor.getBoundingClientRect(), need = Math.min(pop.scrollHeight, 280) + 8;
    const below = innerHeight - r.bottom >= need || r.top < need;
    pop.style.left = r.left + 'px'; pop.style.width = r.width + 'px';
    pop.style.maxHeight = Math.max(120, Math.min(280, (below ? innerHeight - r.bottom : r.top) - 12)) + 'px';
    pop.style[below ? 'top' : 'bottom'] = (below ? r.bottom + 6 : innerHeight - r.top + 6) + 'px';
    pop.style[below ? 'bottom' : 'top'] = 'auto';
    pop.dataset.side = below ? 'down' : 'up';
  };
  const fill = (list, sel) => {
    items = list; pop.replaceChildren();
    list.forEach(([v, l], i) => {
      const o = h('div', { class: 'dd-opt', role: 'option', id: lid + '-' + i, 'aria-selected': String(v === sel) }, h('span', { class: 't', text: T(l) }), v === sel ? icon('check', 16) : null);
      o.addEventListener('pointerdown', (e) => { e.preventDefault(); act = i; api.pick(); });
      o.addEventListener('pointermove', () => { if (act !== i) api.set(i, false); });
      pop.append(o);
    });
    if (!list.length) pop.append(h('div', { class: 'dd-empty', text: 'No matches' }));
  };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !anchor.contains(e.target)) api.close(); };
  const onScroll = (e) => { if (pop && !pop.contains(e.target)) api.close(); };
  const api = {
    get isOpen() { return !!pop; }, get id() { return lid; }, get count() { return items.length; },
    open(list, sel) {
      if (pop) { api.update(list, sel); return; }
      if (livePop && livePop !== api) livePop.close();
      livePop = api;
      pop = h('div', { class: 'dd-pop', role: 'listbox', id: lid });
      fill(list, sel); document.body.append(pop); place();
      anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', lid);
      const up = pop.dataset.side === 'up';
      if (!TWM.reduce()) pop.animate([{ opacity: 0, transform: `translateY(${up ? 8 : -8}px) scale(.94)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: TWM.SPRING });
      document.addEventListener('pointerdown', outside, true); document.addEventListener('scroll', onScroll, true); addEventListener('resize', api.close);
      api.set(Math.max(0, list.findIndex(i => i[0] === sel)), true);
    },
    update(list, sel) { if (!pop) return; fill(list, sel); place(); api.set(list.length ? 0 : -1, true); },
    set(i, scroll = true) {
      act = i;
      [...pop.querySelectorAll('.dd-opt')].forEach((o, j) => o.classList.toggle('active', j === i));
      if (i >= 0 && pop.children[i]) { anchor.setAttribute('aria-activedescendant', lid + '-' + i); if (scroll) pop.children[i].scrollIntoView({ block: 'nearest' }); }
      else anchor.removeAttribute('aria-activedescendant');
    },
    move(d) { if (!pop || !items.length) return; api.set((act + d + items.length) % items.length); },
    pick() { if (pop && act >= 0 && items[act]) onPick(items[act]); },
    close() {
      if (!pop) return;
      const p = pop; pop = null; if (livePop === api) livePop = null;
      anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', onScroll, true); removeEventListener('resize', api.close);
      if (TWM.reduce()) { p.remove(); return; }
      const up = p.dataset.side === 'up';
      p.style.pointerEvents = 'none'; p.setAttribute('aria-hidden', 'true');
      const gone = () => p.remove();
      setTimeout(gone, 260);   // also covers hidden windows, where animations are paused
      p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${up ? 6 : -6}px) scale(.96)` }], { duration: 160, easing: 'ease-in' }).finished.then(gone, gone);
    }
  };
  return api;
}

/* ---- custom dropdown: a button + listbox. Exposes .value and fires 'change' like a <select>. ---- */
function selectEl(opts, value, anyLabel, id) {
  const items = [];
  if (anyLabel != null) items.push(['', anyLabel]);
  for (const o of opts) items.push(Array.isArray(o) ? o : [gname(o), gname(o)]);
  let cur = String(value ?? '');
  const label = h('span', { class: 'dd-label' });
  const root = h('button', { type: 'button', class: 'dd', id, role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, label, icon('chev', 16));
  const paint = () => {
    const f = items.find(i => i[0] === cur);
    label.textContent = f ? T(f[1]) : (anyLabel ?? 'Choose');
    root.classList.toggle('placeholder', !f || (cur === '' && anyLabel != null));
  };
  Object.defineProperty(root, 'value', { get: () => cur, set: (v) => { cur = String(v ?? ''); paint(); } });
  const pop = makePopup(root, ([v]) => { const changed = v !== cur; cur = v; paint(); pop.close(); root.focus(); if (changed) root.dispatchEvent(new Event('change', { bubbles: true })); });
  let typed = '', typedAt = 0;
  root.addEventListener('click', () => { pop.isOpen ? pop.close() : pop.open(items, cur); });
  root.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (!pop.isOpen) pop.open(items, cur); else pop.move(k === 'ArrowDown' ? 1 : -1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (pop.isOpen) pop.pick(); else pop.open(items, cur); }
    else if (k === 'Escape' && pop.isOpen) { e.preventDefault(); e.stopPropagation(); pop.close(); }
    else if (k === 'Home' && pop.isOpen) { e.preventDefault(); pop.set(0); }
    else if (k === 'End' && pop.isOpen) { e.preventDefault(); pop.set(items.length - 1); }
    else if (k === 'Tab') pop.close();
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now(); typed = (now - typedAt > 700 ? '' : typed) + k.toLowerCase(); typedAt = now;
      const i = items.findIndex(([, l]) => T(l).toLowerCase().startsWith(typed));
      if (i >= 0) { if (!pop.isOpen) pop.open(items, cur); pop.set(i); }
    }
  });
  root.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== root) pop.close(); }, 120); });
  paint();
  return root;
}

/* ---- custom suggestions for a text input (replaces <datalist>) ---- */
function suggestInput(input, getList) {
  let picking = false;   // the input event fired after a pick must not re-open the list
  const pop = makePopup(input, ([v]) => { picking = true; input.value = T(v); pop.close(); input.dispatchEvent(new Event('input', { bubbles: true })); picking = false; });
  const list = () => { const q = input.value.trim().toLowerCase(); return getList().filter(([v]) => !q || T(v).toLowerCase().includes(q)).slice(0, 30); };
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-haspopup', 'listbox');
  const show = () => { if (picking) return; const l = list(); if (!l.length) { pop.close(); return; } pop.isOpen ? pop.update(l, '') : pop.open(l, ''); };
  input.addEventListener('focus', show); input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!pop.isOpen) show(); else pop.move(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter' && pop.isOpen && pop.count) { e.preventDefault(); pop.pick(); }
    else if (e.key === 'Escape' && pop.isOpen) { e.preventDefault(); e.stopPropagation(); pop.close(); }
  });
  input.addEventListener('blur', () => setTimeout(() => pop.close(), 120));
  return input;
}

/* Game cover thumbnails: filled from search results and looked up lazily by name. */
const gameCovers = new Map();
function gameThumb(name) {
  const key = String(name || '').toLowerCase().trim();
  const el = h('span', { class: 'gp-thumb', 'aria-hidden': 'true' });
  const paint = (url) => { el.replaceChildren(url ? h('img', { src: url, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(icon('pad', 14)) }) : icon('pad', 14)); };
  if (!key) { paint(null); return el; }
  const known = gameCovers.get(key);
  paint(known || null);
  if (known === undefined) {
    gameCovers.set(key, '');   // look up once
    api('GET', '/api/games/search?q=' + encodeURIComponent(name)).then(list => {
      const arr = list || [];
      const hit = arr.find(x => String(x.name || '').toLowerCase().trim() === key && x.coverUrl)
               || arr.find(x => String(x.name || '').toLowerCase().includes(key) && x.coverUrl)
               || arr.find(x => key.includes(String(x.name || '').toLowerCase()) && x.coverUrl)
               || (arr[0]?.coverUrl ? arr[0] : null);
      if (hit && hit.coverUrl) { gameCovers.set(key, hit.coverUrl); paint(hit.coverUrl); }
      else gameCovers.set(key, null);
    }).catch(() => gameCovers.set(key, null));
  }
  return el;
}

/* ---- game picker (with Steam Store search, thumbnail covers, chips & custom entry) ---- */
function gamePicker(opts = {}) {
  const multi = !!opts.multi;
  let cur = multi ? [...(opts.value || [])] : (opts.value ? String(opts.value) : '');
  const placeholder = opts.placeholder || (multi ? 'Search for a game to add...' : 'Search for a game...');
  const anyLabel = opts.anyLabel;

  const root = h('div', { class: 'game-picker', role: 'group', 'aria-label': 'Game selector' });
  const chipsWrap = multi ? h('div', { class: 'game-picker-chips', role: 'list', 'aria-label': 'Selected games' }) : null;
  const singlePreview = !multi ? h('div', { class: 'game-picker-single-preview', style: 'display:none' }) : null;

  const input = h('input', { class: 'input', type: 'text', placeholder, autocomplete: 'off' });
  const searchWrap = h('div', { class: 'game-picker-search' }, icon('search', 16), input);
  const sIco = searchWrap.querySelector('svg');
  if (sIco) sIco.classList.add('gp-icon');

  let pop = null, activeIdx = -1, items = [], timer = null, reqToken = 0;
  const pid = nid('gp');

  const close = () => {
    if (!pop) return;
    pop.remove(); pop = null; activeIdx = -1;
    input.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
  };

  const onOutside = (e) => {
    if (pop && !pop.contains(e.target) && !searchWrap.contains(e.target)) close();
  };

  const place = () => {
    if (!pop) return;
    const r = input.getBoundingClientRect();
    const need = Math.min(pop.scrollHeight, 280) + 8;
    const below = innerHeight - r.bottom >= need || r.top < need;
    pop.style.left = r.left + 'px';
    pop.style.width = Math.max(r.width, 240) + 'px';
    pop.style.maxHeight = '280px';
    pop.style[below ? 'top' : 'bottom'] = (below ? r.bottom + 6 : innerHeight - r.top + 6) + 'px';
    pop.style[below ? 'bottom' : 'top'] = 'auto';
  };

  const setIndex = (i) => {
    if (!pop || !items.length) return;
    activeIdx = Math.max(0, Math.min(i, items.length - 1));
    [...pop.children].forEach((el, j) => el.classList.toggle('active', j === activeIdx));
    if (pop.children[activeIdx]) {
      pop.children[activeIdx].scrollIntoView({ block: 'nearest' });
    }
  };

  const selectGame = (gameName) => {
    gameName = String(gameName || '').trim();
    if (!gameName && anyLabel == null) return;
    if (multi) {
      if (gameName && !cur.includes(gameName)) {
        cur.push(gameName);
        render();
        trigger();
      }
      input.value = '';
      close();
      input.focus();
    } else {
      cur = gameName;
      input.value = '';
      close();
      render();
      trigger();
    }
  };

  const removeGame = (gameName) => {
    if (multi) {
      const idx = cur.indexOf(gameName);
      if (idx >= 0) {
        cur.splice(idx, 1);
        render();
        trigger();
      }
    } else {
      cur = '';
      render();
      trigger();
    }
  };

  const trigger = () => {
    if (typeof opts.onChange === 'function') opts.onChange(multi ? [...cur] : cur);
    root.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const render = () => {
    if (multi) {
      chipsWrap.replaceChildren();
      for (const g of cur) {
        const c = h('span', { class: 'game-picker-chip', role: 'listitem' },
          gameThumb(g),
          h('span', { class: 'gp-chip-name', text: T(g) }),
          h('button', {
            type: 'button', class: 'gp-remove', 'aria-label': 'Remove ' + g,
            onclick: (e) => { e.preventDefault(); removeGame(g); }
          }, icon('x', 14))
        );
        chipsWrap.append(c);
      }
    } else {
      if (cur) {
        singlePreview.style.display = 'flex';
        searchWrap.style.display = 'none';
        // [cover] Game name [x]: click the name to pick a different game, the X clears it.
        const body = h('button', {
          type: 'button', class: 'gp-single-body', 'aria-label': 'Change game, currently ' + T(cur),
          onclick: (e) => {
            e.preventDefault();
            searchWrap.style.display = 'flex';
            singlePreview.style.display = 'none';
            input.value = '';
            input.focus();
            search();
          }
        }, gameThumb(cur), h('span', { class: 'gp-single-name', text: T(cur) }));
        const x = h('button', {
          type: 'button', class: 'gp-remove gp-single-x', 'aria-label': 'Clear game ' + T(cur),
          onclick: (e) => { e.preventDefault(); removeGame(cur); }
        }, icon('x', 16));
        singlePreview.replaceChildren(body, x);
      } else {
        singlePreview.style.display = 'none';
        searchWrap.style.display = 'flex';
      }
    }
  };

  const search = () => {
    const q = input.value.trim();
    const myTok = ++reqToken;
    api('GET', '/api/games/search' + (q ? '?q=' + encodeURIComponent(q) : '')).then(list => {
      if (myTok !== reqToken) return;
      showResults(list || [], q);
    }).catch(() => {
      if (myTok !== reqToken) return;
      showResults([], q);
    });
  };

  const showResults = (list, q) => {
    if (!pop) {
      pop = h('div', { class: 'dd-pop', role: 'listbox', id: pid, style: 'overflow-y:auto' });
      document.body.append(pop);
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-controls', pid);
      document.addEventListener('pointerdown', onOutside, true);
    }
    pop.replaceChildren();
    items = [];

    if (!multi && anyLabel != null && !q) {
      const anyOpt = h('div', { class: 'gp-opt', role: 'option' },
        icon('pad', 18),
        h('span', { class: 't', text: anyLabel })
      );
      anyOpt.addEventListener('pointerdown', (e) => { e.preventDefault(); selectGame(''); });
      pop.append(anyOpt);
      items.push({ name: '', isAny: true });
    }

    for (const item of list) {
      const n = item.name || item;
      if (item.coverUrl) gameCovers.set(String(n).toLowerCase(), item.coverUrl);
      const isSel = multi ? cur.includes(n) : cur === n;
      const thumb = item.coverUrl
        ? h('img', { class: 'gp-opt-thumb', src: item.coverUrl, alt: '', loading: 'lazy' })
        : h('div', { class: 'gp-opt-thumb', style: 'display:flex;align-items:center;justify-content:center;background:var(--color-strong)' }, icon('pad', 16));

      const opt = h('div', { class: 'gp-opt' + (isSel ? ' active' : ''), role: 'option' },
        thumb,
        h('span', { class: 't', text: T(n) }),
        (item.isSteam || item.steamAppId) ? h('span', { class: 'gp-opt-badge', text: 'Steam' }) : null,
        isSel ? icon('check', 16) : null
      );
      opt.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        selectGame(n);
      });
      pop.append(opt);
      items.push(item);
    }

    // Only real games can be chosen: no "use what I typed" option.
    if (!items.length) {
      pop.append(h('div', { class: 'dd-empty', text: q ? 'No matching game found. Only real games can be added.' : 'No games found' }));
    }

    place();
    setIndex(0);
  };

  input.addEventListener('focus', () => search());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!pop) search(); else setIndex(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (pop) setIndex(activeIdx - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (pop && activeIdx >= 0 && items[activeIdx]) selectGame(items[activeIdx].name || items[activeIdx]);
    }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  if (multi) {
    root.append(chipsWrap, searchWrap);
  } else {
    root.append(singlePreview, searchWrap);
  }

  Object.defineProperty(root, 'value', {
    get: () => multi ? [...cur] : cur,
    set: (v) => { cur = multi ? [...(v || [])] : String(v || ''); render(); }
  });

  render();
  return root;
}
function field(label, input, hint) {
  const id = input.id || (input.id = nid('f'));
  const msg = h('div', { class: 'field-msg', id: id + '-m', 'aria-live': 'polite' }, hint || '');
  if (!hint) msg.style.display = 'none';
  input.setAttribute('aria-describedby', id + '-m');
  const f = h('div', { class: 'field' }, h('label', { for: id, text: label }), input, msg);
  f.setError = (m) => { f.classList.toggle('invalid', !!m); f.classList.remove('shake'); if (m) { void f.offsetWidth; f.classList.add('shake'); } msg.textContent = m || hint || ''; msg.style.display = (m || hint) ? '' : 'none'; input.setAttribute('aria-invalid', m ? 'true' : 'false'); return !m; };
  return f;
}
function tabs(items, active, onChange, label) {
  const root = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const bs = items.map(([key, text], i) => h('button', {
    class: 'tab', type: 'button', role: 'tab', id: nid('tab'),
    onclick: () => set(key, true),
    onkeydown: (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); const n = items[(i + d + items.length) % items.length][0]; set(n, true); bs.find(b => b.dataset.key === n).focus(); }
    }, 'data-key': key
  }, text));
  root.append(...bs);
  root.style.setProperty('--n', items.length);
  function set(key, fire) {
    const i = Math.max(0, items.findIndex(x => x[0] === key));
    root.style.setProperty('--i', i);
    bs.forEach((b, j) => { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
    if (fire) onChange(items[i][0]);
  }
  root.set = set; root.buttons = bs; set(active, false);
  return root;
}
function openSheet(title, body, opts = {}) {
  const prev = document.activeElement;
  let closing = false;
  const ov = h('div', { class: 'overlay' });
  const closeBtn = opts.unclosable ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('x'));
  const panel = h('div', { class: 'sheet' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn),
    h('div', { class: 'sheet-body' }, body));
  ov.append(panel);
  const focusables = () => [...panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
  function key(e) {
    if (e.key === 'Escape') { if (!opts.unclosable) { e.preventDefault(); close(); } }
    else if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  function close() {
    if (closing) return; closing = true;
    document.removeEventListener('keydown', key);
    TWM.sheetOut(prev, panel, ov).then(() => { ov.remove(); if (prev && prev.focus) prev.focus(); });
  }
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && !opts.unclosable) close(); });
  document.addEventListener('keydown', key);
  document.body.append(ov);
  TWM.sheetIn(prev, panel, ov);
  const f = focusables(); (f[1] || f[0]) && (f[1] || f[0]).focus();
  return close;
}
function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('b', { text: title }), h('p', { text }), action || null);
}
function stagger(list) { [...list.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 12))); return list; }
function personRow(p, o = {}) {
  const sk = statusKey(p.status);
  const sub = p.playing ? h('span', { class: 'playing' }, gameThumb(p.playing), h('span', { class: 'playing-txt', text: playingStatusText(p) }))
    : h('span', {}, o.region && p.region ? T(p.region) : STATUS[sk]);

  const av = avatar(p, o.big ? 'lg' : 'md', true);
  av.style.cursor = 'pointer';
  av.title = tr('View profile');
  av.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openProfile(p.id); });

  const nameEl = h('b', { class: 'person-name', style: 'cursor:pointer', title: tr('View profile'), text: nm(p) },
    p.displayName && p.displayName !== p.username ? h('small', { class: 'handle', text: ' @' + T(p.username) }) : null
  );
  nameEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openProfile(p.id); });

  const meta = h('div', { class: 'meta' }, nameEl, sub);
  const row = h(o.href ? 'a' : 'div', {
    class: 'frow ' + (o.big ? 'big ' : '') + (sk === 'offline' ? 'off' : '') + (o.href ? ' link' : ''),
    href: o.href,
    'data-key': p.id != null ? 'p' + p.id : null
  }, av, meta, o.action ? h('div', { class: 'act' }, o.action) : null);
  if (p.banner) {
    row.style.backgroundImage = 'linear-gradient(rgba(20, 20, 26, 0.78), rgba(20, 20, 26, 0.78)), url(' + p.banner + ')';
    row.style.backgroundSize = 'cover';
    row.style.backgroundPosition = 'center';
  }

  if (!o.href) {
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (!e.target.closest('button, a, input, select, textarea')) openProfile(p.id);
    });
  }
  return row;
}

/* ================= legal policies & consent ================= */
function showTermsOfService() {
  const body = h('div', { class: 'stack', style: 'gap:12px;max-height:70vh;overflow-y:auto;padding-right:4px;font-size:14px;line-height:1.6;' },
    h('h3', { text: tr('1. Respect Other Players') }),
    h('p', { class: 'muted', text: tr('Third Wheel is built for gamers to connect, play, and have fun. We have zero tolerance for hate speech, harassment, bullying, impersonation, doxxing, cheating, or sexually explicit content.') }),
    h('h3', { text: tr('2. Account Responsibility & Age') }),
    h('p', { class: 'muted', text: tr('You must be at least 13 years old to use Third Wheel. You are responsible for all actions conducted on your account.') }),
    h('h3', { text: tr('3. Moderation & Enforcement') }),
    h('p', { class: 'muted', text: tr('Lobby and group creators manage their own rooms. Platform administrators reserve the right to warn, suspend, delete accounts, or permanently device-ban bad actors.') }),
    h('h3', { text: tr('4. Peer-to-Peer Voice & Video') }),
    h('p', { class: 'muted', text: tr('Voice and video chats are streamed directly between users using encrypted WebRTC. Third Wheel servers do not record or listen into your live communications.') }),
    h('h3', { text: tr('5. Service Availability') }),
    h('p', { class: 'muted', text: tr('Third Wheel is provided "as is" without warranty. We strive for uninterrupted gaming uptime, but reserve the right to perform necessary updates and maintenance.') })
  );
  openSheet(tr('Terms of Service'), body);
}

function showPrivacyPolicy() {
  const body = h('div', { class: 'stack', style: 'gap:12px;max-height:70vh;overflow-y:auto;padding-right:4px;font-size:14px;line-height:1.6;' },
    h('h3', { text: tr('1. Data We Collect') }),
    h('p', { class: 'muted', text: tr('We collect only the information needed to connect you with gaming groups: your chosen username, birthdate (used to match you by age bracket and ensure you are 13+), regional ping preference, and favorite games.') }),
    h('h3', { text: tr('2. Device & Security Telemetry') }),
    h('p', { class: 'muted', text: tr('To prevent ban evasion and troll attacks, we record your IP address and hardware device identifier. This data is strictly used for security, abuse moderation, and session authorization.') }),
    h('h3', { text: tr('3. Peer-to-Peer (P2P) Realtime Media') }),
    h('p', { class: 'muted', text: tr('Your voice and camera streams travel directly between peers in your group. None of your voice or video data is recorded, saved, or analyzed on Third Wheel servers.') }),
    h('h3', { text: tr('4. Chat Messages & Media') }),
    h('p', { class: 'muted', text: tr('Text messages and uploaded files are stored securely so you and your group members can view your conversation history across devices.') }),
    h('h3', { text: tr('5. We Never Sell Your Data') }),
    h('p', { class: 'muted', text: tr('We do not sell, rent, or share personal information with third-party advertisers or data brokers.') })
  );
  openSheet(tr('Privacy Policy'), body);
}

function showCookiePolicy() {
  const body = h('div', { class: 'stack', style: 'gap:12px;max-height:70vh;overflow-y:auto;padding-right:4px;font-size:14px;line-height:1.6;' },
    h('h3', { text: tr('What are cookies & local storage?') }),
    h('p', { class: 'muted', text: tr('Cookies and local storage are small text files placed on your device to keep you signed in and remember your preferences.') }),
    h('h3', { text: tr('Strictly Essential Cookies Only') }),
    h('p', { class: 'muted', text: tr('Third Wheel uses cookies exclusively for core functionality. We use:') }),
    h('ul', { style: 'padding-left:18px;color:var(--color-text-2);margin:4px 0;' },
      h('li', { text: tr('tw_session: An encrypted session cookie so you remain signed into your account.') }),
      h('li', { text: tr('Preferences: Local storage entries for theme (light/dark/custom), language, and audio devices (microphone/speaker selection).') })
    ),
    h('h3', { text: tr('No Tracking or Advertising Cookies') }),
    h('p', { class: 'muted', text: tr('We do not use advertising cookies, marketing pixels, or third-party trackers.') })
  );
  openSheet(tr('Cookie Policy'), body);
}

function checkTosAndCookiesConsent() {
  if (!S.me) return;
  const accepted = S.me.tosAccepted || localStorage.getItem('tw_tos_accepted');
  if (accepted) return;

  const body = h('div', { class: 'stack', style: 'gap:14px' });
  body.append(
    h('p', { class: 'muted', style: 'font-size:14px;line-height:1.5;', text: tr('Welcome! Before continuing, please review and accept Third Wheel’s Terms of Service, Privacy Policy, and Cookie Policy.') }),
    h('div', { style: 'background:var(--color-hover);padding:12px;border-radius:8px;font-size:13px;display:flex;flex-direction:column;gap:6px;' },
      h('div', {}, h('b', { text: tr('Terms of Service: ') }), h('span', { text: tr('Zero tolerance for harassment, cheating, or abusive behavior.') })),
      h('div', {}, h('b', { text: tr('Privacy & Voice: ') }), h('span', { text: tr('Voice and video calls are direct peer-to-peer (P2P). We never record them.') })),
      h('div', {}, h('b', { text: tr('Cookies: ') }), h('span', { text: tr('We use essential cookies and storage solely to keep you signed in and remember your settings.') }))
    ),
    h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;font-size:13px;' },
      h('a', { href: '#', text: tr('Read Terms of Service'), onclick: (e) => { e.preventDefault(); showTermsOfService(); } }),
      h('a', { href: '#', text: tr('Read Privacy Policy'), onclick: (e) => { e.preventDefault(); showPrivacyPolicy(); } }),
      h('a', { href: '#', text: tr('Read Cookie Policy'), onclick: (e) => { e.preventDefault(); showCookiePolicy(); } })
    )
  );

  const acceptBtn = h('button', { class: 'btn block', type: 'button', text: tr('I Accept & Continue') });
  body.append(h('div', { style: 'margin-top:8px;' }, acceptBtn));

  const close = openSheet(tr('Terms of Service & Cookie Consent'), body, { unclosable: true, cls: 'tos-consent-sheet' });
  acceptBtn.addEventListener('click', async () => {
    busy(acceptBtn, async () => {
      try { await api('POST', '/api/me/tos'); } catch {}
      localStorage.setItem('tw_tos_accepted', '1');
      if (S.me) S.me.tosAccepted = true;
      close();
      toast(tr('Terms & Cookies accepted. Welcome!'));
    });
  });
}

/* ================= auth ================= */
const USER_RE = /^[A-Za-z0-9_.-]{3,20}$/;
/* Brand marks for the sign-in buttons (Google "G", Discord). */
const BRAND_SVG = {
  google: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#5865F2" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.4005-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>'
};
const brandIcon = (name) => { const s = document.createElement('span'); s.className = 'brand-ico'; s.innerHTML = BRAND_SVG[name]; return s; };   // fixed markup above, never user data

/* "Continue with Google / Discord": the person signs in on the provider's own site. In the desktop app that happens in the system browser,
   and the app then collects the finished sign-in with a one-time code. */
const OA_ERR = {
  tos: 'Tick the box that says you agree to the Terms, then try again.', noaccount: 'There is no account for that sign-in yet. Switch to Sign up to create one.',
  banned: 'This account or device has been suspended.', failed: 'That sign-in didn’t work. Please try again.', denied: 'The sign-in was cancelled.',
  unavailable: 'That sign-in method isn’t available on this server.', taken: 'That account is already linked to someone else.'
};
function socialButtons(getMode, needTos, onError) {
  const box = h('div', { class: 'social-box', hidden: true });
  api('GET', '/api/auth/providers').then(p => {
    const list = [['google', 'Google'], ['discord', 'Discord']].filter(([k]) => p[k]);
    if (!list.length) return;
    box.append(h('div', { class: 'social-or' }, h('span', { text: tr('or') })), ...list.map(([k, label]) => {
      const b = h('button', { class: 'btn social-btn ' + k, type: 'button' }, brandIcon(k), h('span', { text: tr('Continue with {name}', { name: label }) }));
      b.addEventListener('click', () => {
        if (getMode() === 'signup' && !needTos()) { onError(tr(OA_ERR.tos)); return; }
        const mode = getMode();
        let url = '/auth/' + k + '/start?mode=' + mode + (mode === 'signup' ? '&tos=1' : '');
        if (window.__TW_DESKTOP) {
          const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(30)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          url += '&h=' + code;
          const a = h('a', { href: url, target: '_blank', rel: 'noopener' }); document.body.append(a); a.click(); a.remove();
          onError(tr('Finish signing in in your browser. This window continues by itself.'), true);
          let tries = 0;
          const poll = setInterval(async () => {
            if (++tries > 150 || S.me) { clearInterval(poll); return; }
            try { const r = await api('POST', '/api/auth/handoff', { code }); clearInterval(poll); S.me = r.user || r; await start(); } catch { /* not finished yet */ }
          }, 2000);
        } else location.href = url;
      });
      return b;
    }));
    box.hidden = false;
  }).catch(() => {});
  return box;
}

function renderAuth() {
  clearTimers(); S.me = null;
  { const m = /^#\/reset\/([\w-]{20,100})$/.exec(location.hash || ''); if (m) { renderReset(m[1]); return; } }
  let mode = 'login';
  const user = h('input', { class: 'input', type: 'text', autocomplete: 'username', maxlength: 20, autocapitalize: 'none', spellcheck: 'false', placeholder: tr('your_name') });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 128, placeholder: tr('At least 8 characters') });
  const fu = field(tr('Username'), user, tr('3–20 letters, numbers, . _ -'));
  const fp = field(tr('Password'), pass);
  const emailIn = h('input', { class: 'input', type: 'email', autocomplete: 'email', maxlength: 120, autocapitalize: 'none', spellcheck: 'false', placeholder: 'you@example.com' });
  const fe = field(tr('Email'), emailIn, tr('We send a link to confirm it. It also lets you reset your password.'));
  fe.hidden = true;
  const forgot = h('a', { href: '#', class: 'auth-forgot', text: tr('Forgot password?'), onclick: (e) => { e.preventDefault(); showForgot(user.value.includes('@') ? user.value : ''); } });
  forgot.hidden = true;
  let mailOn = false;
  const syncMail = () => { fe.hidden = !(mailOn && mode === 'signup'); forgot.hidden = !(mailOn && mode === 'login'); };
  api('GET', '/api/auth/providers').then(pr => { mailOn = !!pr.email; syncMail(); }).catch(() => {});
  const err = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, tr('Log in'));

  const tosCheck = h('input', { type: 'checkbox', id: 'auth-tos', style: 'margin-top:2px;cursor:pointer;' });
  const tosLink = h('a', { href: '#', text: tr('Terms of Service'), onclick: (e) => { e.preventDefault(); showTermsOfService(); } });
  const privLink = h('a', { href: '#', text: tr('Privacy Policy'), onclick: (e) => { e.preventDefault(); showPrivacyPolicy(); } });
  const cookieLink = h('a', { href: '#', text: tr('Cookie Policy'), onclick: (e) => { e.preventDefault(); showCookiePolicy(); } });
  const tosLabel = h('label', { for: 'auth-tos', style: 'font-size:12px;line-height:1.4;color:var(--color-text-2);cursor:pointer;' },
    tr('I agree to the '), tosLink, tr(', '), privLink, tr(', and essential '), cookieLink, '.'
  );
  const tosRow = h('div', { class: 'auth-tos-row', style: 'display:none;align-items:flex-start;gap:8px;margin:4px 0 8px;' }, tosCheck, tosLabel);

  const tb = tabs([['login', tr('Log in')], ['signup', tr('Sign up')]], 'login', (k) => {
    mode = k; submit.textContent = k === 'login' ? tr('Log in') : tr('Create account'); err.textContent = '';
    pass.autocomplete = k === 'login' ? 'current-password' : 'new-password';
    fu.setError(''); fp.setError('');
    tosRow.style.display = (mode === 'signup' ? 'flex' : 'none');
    syncMail();
  }, tr('Account'));
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const u = user.value.trim(), p = pass.value;
    const okU = fu.setError(USER_RE.test(u) ? '' : tr('Use 3–20 letters, numbers, . _ or -'));
    const okP = fp.setError(p.length >= 8 ? '' : tr('Password must be at least 8 characters'));
    const em = emailIn.value.trim();
    const okE = fe.hidden ? true : fe.setError(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) ? '' : tr('Enter a valid email address.'));
    if (!okU || !okP || !okE) return;
    if (mode === 'signup' && !tosCheck.checked) {
      err.textContent = tr('You must agree to the Terms of Service, Privacy Policy, and Cookies to sign up.');
      return;
    }
    submit.disabled = true; const idle = TWM.busyBtn(submit);
    try {
      const r = await api('POST', '/api/auth/' + mode, mode === 'signup' && !fe.hidden ? { username: u, password: p, email: em } : { username: u, password: p });
      S.me = r.user || r; await start();
    } catch (ex) {
      if ((ex.data && ex.data.banned) || (ex.status === 403 && /suspended|banned/i.test(ex.message))) {
        showSuspendedAppeal(u, p, (ex.data && ex.data.reason) || ex.message);
        return;
      }
      err.textContent = T(ex.message);
    }
    finally { submit.disabled = false; idle(); }
  } }, fu, fe, fp, h('div', { class: 'auth-forgot-row' }, forgot), tosRow, err, submit);
  document.title = 'Third Wheel';
  const card = h('div', { class: 'card auth-card' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Third Wheel'),
    h('p', { class: 'muted', style: 'margin-top:8px', text: tr('Find a group that plays the way you do.') }),
    tb, form, socialButtons(() => mode, () => tosCheck.checked, (m, info) => { err.textContent = m; err.classList.toggle('info', !!info); }));
  TWM.transition(() => $('#app').replaceChildren(h('main', { class: 'center-screen' }, card)));
  user.focus();
  // coming back from a provider with a problem: say what happened, then tidy the address
  try {
    const q = new URLSearchParams(location.search), code = q.get('auth_error');
    if (code) { if (code === 'noaccount') tb.set('signup', true); err.textContent = tr(OA_ERR[code] || OA_ERR.failed); history.replaceState(null, '', location.pathname + location.hash); }
  } catch { /* ignore */ }
}

/* ================= forgot / reset password ================= */
function showForgot(prefill) {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', maxlength: 120, autocapitalize: 'none', value: prefill || '', placeholder: 'you@example.com' });
  const err = h('div', { class: 'form-error', role: 'alert' });
  const send = btn(tr('Send link'), { cls: 'primary' });
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted', text: tr('Enter the email on your account. If it is confirmed, we send a link to choose a new password.') }), field(tr('Email'), email), err, send);
  const sh = openSheet(tr('Reset password'), body);
  send.addEventListener('click', async () => {
    err.textContent = '';
    const v = email.value.trim(); if (!v) { err.textContent = tr('Enter a valid email address.'); return; }
    send.disabled = true;
    try { await api('POST', '/api/auth/forgot', { email: v }); body.replaceChildren(h('p', { text: tr('If that address belongs to an account, a reset link is on its way. Check your inbox (and spam).') })); send.remove(); }
    catch (ex) { err.textContent = T(ex.message); send.disabled = false; }
  });
  return sh;
}
function renderReset(token) {
  clearTimers(); S.me = null;
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 72, placeholder: tr('At least 8 characters') });
  const fp = field(tr('New password'), pw);
  const err = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, tr('Change password'));
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!fp.setError(pw.value.length >= 8 ? '' : tr('Password must be at least 8 characters'))) return;
    submit.disabled = true;
    try { await api('POST', '/api/auth/reset', { token, password: pw.value }); history.replaceState(null, '', location.pathname); location.hash = '#/find'; card.replaceChildren(h('h2', { text: tr('Password changed') }), h('p', { class: 'muted', text: tr('You can log in with your new password now.') }), h('button', { class: 'btn block', onclick: () => renderAuth() }, tr('Log in'))); }
    catch (ex) { err.textContent = T(ex.message); submit.disabled = false; }
  } }, fp, err, submit);
  const card = h('div', { class: 'card auth-card' }, h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Third Wheel'), h('h2', { text: tr('Choose a new password') }), form);
  $('#app').replaceChildren(h('main', { class: 'center-screen' }, card));
  pw.focus();
}

/* ================= onboarding ================= */
function renderOnboarding() {
  clearTimers();
  const d = { region: S.me.region || detectRegion(), age: S.me.age || '', games: [...(S.me.favoriteGames || [])] };
  let step = 0, dir = 1;
  const card = h('div', { class: 'card ob-card' });
  const steps = ['Where do you play?', 'What do you play?', 'How do you play?', 'You’re set'];
  const brand = h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Welcome to Third Wheel');
  const progress = h('div', { class: 'progress', 'aria-hidden': 'true' }, steps.map(() => h('span')));
  TWM.transition(() => $('#app').replaceChildren(h('main', { class: 'center-screen' }, card)));
  function draw() {
    const body = h('div');
    const err = h('div', { class: 'form-error', role: 'alert' });
    let next;
    if (step === 0) {
      const reg = selectEl(S.meta.regions, d.region, 'Choose a region');
      const bday = h('input', { class: 'input', type: 'date', value: d.birthDate || S.me.birthDate || '' });
      const fr = field('Region', reg, 'We match you with groups close by.');
      const fa = field('Birthday', bday, 'Must be 13 or older. Your age updates automatically each year.');
      body.append(h('p', { class: 'muted', text: 'Pick your region and birthday so we can match you with the right groups.' }), h('div', { class: 'row' }, fr, fa));
      next = () => {
        const okR = fr.setError(reg.value ? '' : 'Choose a region');
        const a = calcAge(bday.value);
        const okA = fa.setError(a >= 13 && a <= 99 ? '' : 'Must be 13 or older (enter a valid birthday)');
        if (!okR || !okA) return false;
        d.region = reg.value;
        d.birthDate = bday.value;
        d.age = a;
        return true;
      };
    } else if (step === 1) {
      const gp = gamePicker({ multi: true, value: d.games || [] });
      const steamSyncBtn = h('button', { class: 'btn secondary sm', type: 'button' }, icon('steam', 16), 'Sync Steam Games');
      steamSyncBtn.addEventListener('click', async () => {
        await busy(steamSyncBtn, async () => {
          try {
            let tags = [];
            try { tags = await api('GET', '/api/verify/mine'); } catch {}
            const hasSteam = tags.some(t => t.platform === 'Steam');
            if (!hasSteam) {
              const res = await api('POST', '/api/verify/steam/start');
              const pop = window.open(res.url, 'steam_link', 'width=800,height=600');
              await new Promise(resolve => {
                const handler = (ev) => {
                  if (ev.data && ev.data.type === 'tw:verified') {
                    window.removeEventListener('message', handler);
                    resolve(true);
                  }
                };
                window.addEventListener('message', handler);
                const timer = setInterval(() => {
                  if (!pop || pop.closed) {
                    clearInterval(timer);
                    window.removeEventListener('message', handler);
                    resolve(true);
                  }
                }, 1000);
              });
            }
            const lib = await api('GET', '/api/verify/steam/library');
            if (lib.isPrivate) {
              toast('Your Steam game list is private. Set "Game details" to Public in Steam settings.', 'error');
              return;
            }
            if (lib.games && lib.games.length > 0) {
              const names = lib.games.map(g => g.name);
              d.games = [...new Set([...(d.games || []), ...names])];
              gp.value = d.games;
              toast(`Imported ${names.length} games from Steam!`);
            } else {
              toast('No games found in your Steam library.');
            }
          } catch (e) {
            toast(e.message || 'Could not sync Steam library', 'error');
          }
        });
      });
      const steamRow = h('div', { class: 'ob-steam-row', style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--color-surface);border:1px solid var(--color-line-2);border-radius:var(--radius-md);margin-bottom:12px;gap:8px;' },
        h('div', { style: 'display:flex;align-items:center;gap:10px' },
          icon('steam', 24),
          h('div',
            h('strong', { style: 'font-size:13px;display:block' }, 'Own games on Steam?'),
            h('span', { class: 'muted small', text: 'Sync your Steam library automatically' })
          )
        ),
        steamSyncBtn
      );
      body.append(h('p', { class: 'muted', text: 'Search or choose the games you love. Pick as many as you like.' }), steamRow, gp);
      next = () => { d.games = gp.value; return true; };
    } else if (step === 2) {
      // Optional: play style + availability (profile.js). Skippable.
      const sf = window.TWProfile ? TWProfile.styleForm(d.extras || {}) : null;
      body.append(h('p', { class: 'muted', text: 'Optional: tell us how and when you play so we can find people and groups that fit.' }));
      if (sf) body.append(sf.el);
      next = () => { if (sf) d.extras = sf.value(); return true; };
    } else {
      body.append(h('p', { class: 'muted', text: 'Here’s what we’ll use to find your groups. You can change this any time in Settings.' }),
        h('div', { class: 'chips', style: 'margin-top:16px' }, h('span', { class: 'chip accent', text: T(d.region) }), h('span', { class: 'chip accent', text: 'Age ' + d.age }),
          d.games.map(g => h('span', { class: 'chip', text: T(g) }))));
      next = null;
    }
    const nextBtn = h('button', { class: 'btn', type: 'button' }, step === 3 ? 'Finish' : 'Continue');
    nextBtn.addEventListener('click', async () => {
      if (step < 3) { if (next()) { step++; dir = 1; draw(); } return; }
      await busy(nextBtn, async () => {
        await api('PUT', '/api/me/settings', { region: d.region, birthDate: d.birthDate, age: d.age, favoriteGames: d.games, playing: S.me.playing || '', status: S.me.status || 'online', onboarded: true });
        if (d.extras && window.TWProfile) await TWProfile.saveExtras(d.extras).catch(() => {});
        S.me = await api('GET', '/api/me'); await start();
      });
    });
    // Title stays put, the form scrolls, and the buttons stay pinned to the bottom of the card.
    const stepEl = h('div', { class: 'step-in ob-step', style: `--dx:${dir * 30}px` },
      h('h1', { text: steps[step] }), h('div', { class: 'ob-body' }, body, err),
      h('div', { class: 'ob-actions' },
        step > 0 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { step--; dir = -1; draw(); } }, 'Back') : h('span'),
        h('div', { style: 'display:flex;gap:8px' }, step === 2 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { d.extras = null; step++; dir = 1; draw(); } }, 'Skip') : null, nextBtn)));
    TWM.morphHeight(card, () => card.replaceChildren(brand, progress, stepEl));
    [...progress.children].forEach((s, i) => s.classList.toggle('on', i <= step));
    const f = card.querySelector('.dd,input,.chip,.btn'); f && f.focus({ preventScroll: true });
  }
  draw();
}

/* ================= shell ================= */
function navLink(href, ico, label, cls) {
  return h('a', { class: cls || 'nav-link', href, 'data-route': href }, icon(ico, 20), h('span', { class: 't', text: label }));
}
/* The left sidebar (and the phone menu) are built from this list: [section, [[hash, icon, label], ...]]. */
const NAV = () => [
  ['Home', [['#/find', 'compass', 'Find & LFG']]],
  ['Social', [['#/messages', 'msg', 'Messages'], ['#/friends', 'users', 'Friends']]],
  ['Play', [['#/games', 'pad', 'My games'], ['#/history', 'clock', 'History']]]
];
/* The sidebar shows four main links and folds the rest under "More". */
const NAV_MAIN = () => [['#/find', 'compass', 'Find & LFG'], ['#/messages', 'msg', 'Messages'], ['#/friends', 'users', 'Friends'], ['#/games', 'pad', 'My games']];
const NAV_MORE = () => [['#/history', 'clock', 'History']];
function railLinks() {
  let open = false; try { open = localStorage.getItem('tw_nav_more') === '1'; } catch { /* storage unavailable */ }
  const extras = NAV_MORE().map(([href, ico, label]) => { const a = navLink(href, ico, tr(label)); a.classList.add('nav-extra'); return a; });
  const fold = h('button', { class: 'nav-link nav-fold', type: 'button', 'aria-expanded': 'false' }, icon('menu', 20), h('span', { class: 't', text: tr('More') }), h('span', { class: 'chev' }, icon('chev', 16)));
  const set = (on, save) => { extras.forEach(a => { a.hidden = !on; }); fold.setAttribute('aria-expanded', String(on)); if (save) { try { localStorage.setItem('tw_nav_more', on ? '1' : '0'); } catch { /* ignore */ } } if (window.TWM) TWM.nav(); };
  fold.addEventListener('click', () => set(fold.getAttribute('aria-expanded') !== 'true', true));
  S.el.setMore = (on) => set(on, false);
  set(open, false);
  return [...NAV_MAIN().map(([href, ico, label]) => navLink(href, ico, tr(label))), fold, ...extras];
}

/* Phones: the bottom bar only has three buttons, so every tab is reachable from this menu in the top bar. */
function openMenu() {
  let close = () => {};
  const link = (href, ico, label) => { const a = navLink(href, ico, label, 'nav-link menu-link'); a.addEventListener('click', () => close()); return a; };
  const groups = (S.mine || []).map(g => { const a = h('a', { class: 'nav-link menu-link', href: '#/group/' + enc(g.id) }, groupTile(g), h('span', { class: 't', text: T(g.name) })); a.addEventListener('click', () => close()); return a; });
  const body = h('div', { class: 'stack menu-sheet', style: 'gap:4px' },
    ...NAV().flatMap(([sec, links]) => [h('div', { class: 'nav-label', text: tr(sec) }), ...links.map(([href, ico, label]) => link(href, ico, tr(label)))]),
    h('div', { class: 'nav-label', text: tr('My groups') }),
    ...(groups.length ? groups : [h('p', { class: 'muted small', style: 'padding:4px 12px', text: tr('You haven’t joined any groups yet.') })]),
    h('button', { class: 'nav-link menu-link', type: 'button', onclick: () => { openCreate(); close(); } }, icon('plus', 20), h('span', { class: 't', text: tr('Create a group') })),
    h('div', { class: 'nav-label', text: tr('Account') }),
    link('#/settings', 'gear', tr('Settings')),
    ...(document.documentElement.requestFullscreen ? [h('button', { class: 'nav-link menu-link', type: 'button', onclick: () => { close(); toggleFullscreen(); } }, icon('full', 20), h('span', { class: 't', text: tr('Fullscreen') }))] : []));
  close = openSheet(tr('Menu'), body);
}
/* Top-bar menu: fullscreen, admin, the friends list toggle, settings. */
const friendsHidden = () => { try { return localStorage.getItem('tw_hide_friends') === '1'; } catch { return false; } };
function openTopMenu(anchor) {
  document.querySelectorAll('.topbar-menu').forEach(x => x.remove());
  const items = [];
  items.push([icon('user', 18), friendsHidden() ? tr('Show friends list') : tr('Hide friends list'), () => { const hide = !friendsHidden(); try { localStorage.setItem('tw_hide_friends', hide ? '1' : '0'); } catch { /* ignore */ } document.querySelector('.shell')?.classList.toggle('no-friends', hide); }]);
  if (document.documentElement.requestFullscreen) items.push([icon('full', 18), document.fullscreenElement ? tr('Exit fullscreen') : tr('Fullscreen') + ' (F11)', toggleFullscreen]);
  if (S.me.isAdmin) items.push([icon('shield', 18), tr('Admin panel'), () => go('#/admin')]);
  items.push([icon('gear', 18), tr('Settings'), () => go('#/settings')]);
  const pop = h('div', { class: 'topbar-menu', role: 'menu' }, ...items.map(([ic, label, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { close(); fn(); } }, ic, h('span', { text: label }))));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
  const out = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  function close() { pop.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); }
  document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true);
  pop.querySelector('button').focus();
}
function buildShell() {
  const E = S.el = {};
  E.view = h('main', { id: 'view', tabindex: '-1' });
  E.badge = h('span', { class: 'badge', hidden: true, 'aria-hidden': 'true' });
  E.railGroups = h('div', { class: 'rail-groups' });
  E.fList = h('div', { class: 'friends-scroll' });
  E.fCount = h('span', { class: 'muted small' });
  E.user = h('div', { class: 'userpanel' });
  E.q = h('input', { class: 'input qinput', type: 'search', placeholder: tr('Search groups and people'), 'aria-label': tr('Search groups and people'), autocomplete: 'off', maxlength: 60 });
  E.q.addEventListener('input', () => setQuery(E.q.value, E.q));
  E.q.addEventListener('focus', () => { if (!location.hash.startsWith('#/search')) go('#/search'); });
  E.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(true); });

  const rail = h('nav', { class: 'rail', 'aria-label': 'Main' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Third Wheel'),
    h('div', { class: 'nav-main' }, ...railLinks()),
    h('div', { class: 'rail-head' }, tr('My groups'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('Create a group'), onclick: openCreate }, icon('plus', 16))),
    E.railGroups, E.user);

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand brand-mobile' }, h('button', { class: 'icon-btn mobile-only', type: 'button', 'aria-label': tr('Menu'), onclick: openMenu }, icon('menu')), h('img', { src: 'icon.svg', alt: '', width: 28, height: 28 }), 'Third Wheel'),
    h('div', { class: 'searchbox', role: 'search' }, h('span', { class: 'ico' }, icon('search', 18)), E.q),
    h('div', { class: 'actions' },
      h('a', { class: 'icon-btn', href: '#/friends', 'aria-label': tr('Friend requests and invites') }, icon('bell'), E.badge),
      E.menuBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('More'), 'aria-haspopup': 'menu', onclick: () => openTopMenu(E.menuBtn) }, icon('dots'))));

  const panel = h('aside', { class: 'friends-panel', 'aria-label': tr('Friends') },
    h('header', {}, h('h3', { text: tr('Friends') }), E.fCount), E.fList);

  const bnItem = (href, ico, label) => h('a', { class: 'bn-item', href, 'data-route': href }, h('span', { class: 'bn-ico' }, icon(ico, 24)), label);
  const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' },
    bnItem('#/feed', 'feed', tr('Feed')),
    bnItem('#/messages', 'msg', tr('Messages')),
    h('a', { class: 'bn-search', href: '#/search', 'data-route': '#/search', 'aria-label': tr('Search') }, icon('search', 28)),
    bnItem('#/friends', 'user', tr('Friends')),
    h('button', { class: 'bn-item', type: 'button', 'aria-label': tr('Menu'), onclick: openMenu }, h('span', { class: 'bn-ico' }, icon('menu', 24)), tr('More')));

  const shell = h('div', { class: 'shell enter' }, rail, h('div', { class: 'main' }, topbar, E.view), panel, bottom);
  shell.classList.toggle('no-friends', friendsHidden());
  $('#app').replaceChildren(shell);
  setTimeout(() => shell.classList.remove('enter'), 1200);
  renderUserPanel(); renderRail(); renderFriends(); renderBadge();
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => toast(tr('Fullscreen isn’t available here. Try F11.'), 'error'));
}
document.addEventListener('fullscreenchange', () => {
  const b = S.el && S.el.fs; if (!b) return;
  const on = !!document.fullscreenElement;
  b.replaceChildren(icon(on ? 'fullexit' : 'full')); b.setAttribute('aria-label', tr(on ? 'Exit fullscreen' : 'Fullscreen'));
});
function openQuickStatus() {
  const me = S.me; if (!me) return;
  const isDesktop = !!window.__TW_DESKTOP;
  const gp = gamePicker({ multi: false, value: T(me.playing || ''), placeholder: tr('Not playing anything') });
  if (!isDesktop) {
    gp.el.style.opacity = '0.6';
    gp.el.style.pointerEvents = 'none';
  }
  const statusSel = h('select', { class: 'select' },
    h('option', { value: 'online', text: tr('Online'), selected: (me.status || 'online') === 'online' }),
    h('option', { value: 'idle', text: tr('Idle / Away'), selected: me.status === 'idle' || me.status === 'away' }),
    h('option', { value: 'dnd', text: tr('Do Not Disturb'), selected: me.status === 'dnd' || me.status === 'busy' }),
    h('option', { value: 'offline', text: tr('Invisible / Offline'), selected: me.status === 'offline' })
  );
  const saveBtn = h('button', { class: 'btn primary', type: 'button', text: tr('Save changes') });
  const clearBtn = isDesktop ? h('button', { class: 'btn secondary', type: 'button', text: tr('Clear game'), onclick: () => { gp.value = ''; } }) : null;

  const sheet = modal(tr('Set Playing & Status'),
    h('div', { class: 'quick-status-sheet', style: 'display:flex;flex-direction:column;gap:14px;min-width:300px;padding:4px 0;' },
      h('div', {},
        h('label', { class: 'label', style: 'font-weight:600;margin-bottom:6px;display:block;', text: tr('Currently playing') }),
        gp,
        !isDesktop
          ? h('div', { style: 'margin-top:6px;' }, h('span', { class: 'muted small', style: 'color:var(--color-primary);font-weight:600;', text: tr('Requires desktop app to update currently playing') }))
          : (clearBtn ? h('div', { style: 'margin-top:6px;display:flex;justify-content:flex-end;' }, clearBtn) : null)
      ),
      h('div', {},
        h('label', { class: 'label', style: 'font-weight:600;margin-bottom:6px;display:block;', text: tr('Status') }),
        statusSel
      ),
      h('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:10px;' },
        h('button', { class: 'btn secondary', type: 'button', text: tr('Cancel'), onclick: () => sheet.close() }),
        saveBtn
      )
    )
  );

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const chosenGame = isDesktop ? (gp.value || '') : (me.playing || '');
      const chosenStatus = statusSel.value;
      if (isDesktop) {
        await api('PUT', '/api/me/playing', { playing: chosenGame });
        me.playing = chosenGame;
      }
      if (chosenStatus !== me.status) {
        await api('PUT', '/api/me/status', { status: chosenStatus });
        me.status = chosenStatus;
      }
      renderUserPanel();
      sheet.close();
      toast(tr('Status updated!'));
    } catch (e) {
      saveBtn.disabled = false;
      toast(e.message || tr('Failed to update'), 'error');
    }
  };
}

function renderUserPanel() {
  const me = S.me; if (!me || !S.el.user) return;
  const av = avatar(me, 'sm', false);
  av.style.cursor = 'pointer';
  av.title = tr('View profile');
  av.addEventListener('click', () => openProfile(me.id));

  const statusLine = me.playing
    ? h('span', { class: 'playing interactive-status', style: 'cursor:pointer', title: tr('Click to change currently playing / status') },
        gameThumb(me.playing),
        h('span', { class: 'playing-txt', text: playingStatusText(me) })
      )
    : h('span', { class: 'muted small interactive-status', style: 'cursor:pointer', title: tr('Click to set currently playing / status'), text: STATUS[statusKey(me.status)] });
  statusLine.addEventListener('click', (e) => {
    e.stopPropagation();
    openQuickStatus();
  });

  const nameEl = h('b', { text: nm(me), style: 'cursor:pointer', title: tr('View profile') });
  nameEl.addEventListener('click', () => openProfile(me.id));

  const meta = h('div', { class: 'meta' }, nameEl, statusLine);

  S.el.user.replaceChildren(av, meta,
    h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': tr('Settings') }, icon('gear', 20)));
  if (me.banner) {
    S.el.user.style.backgroundImage = 'linear-gradient(rgba(18, 18, 24, 0.75), rgba(18, 18, 24, 0.75)), url(' + me.banner + ')';
    S.el.user.style.backgroundSize = 'cover';
    S.el.user.style.backgroundPosition = 'center';
  } else {
    S.el.user.style.backgroundImage = 'none';
  }
}
function renderRail() {
  const rg = S.el.railGroups; if (!rg) return;
  const onGroup = location.hash.startsWith('#/group/');
  const cur = onGroup ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
  const sig = JSON.stringify(S.mine.map(g => [g.id, g.name, g.color]));
  if (rg.dataset.sig !== sig) {
    rg.dataset.sig = sig;
    const list = S.mine.map(g => {
      const tile = groupTile(g);
      return h('a', { class: 'nav-link', href: '#/group/' + enc(g.id), title: T(g.name), 'data-key': 'g' + g.id, 'data-gid': g.id }, tile, h('span', { class: 't', text: T(g.name) }));
    });
    TWM.flip(rg, '.nav-link', () => rg.replaceChildren(...(list.length ? list : [h('p', { class: 'muted small', style: 'padding:8px 12px', text: tr('No groups yet. Find one or create your own.') })])));
  }
  rg.querySelectorAll('.nav-link[data-gid]').forEach(a => {
    if (onGroup && a.dataset.gid === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function renderFriends() {
  if (!S.el.fList) return;
  const fs = S.friends, on = (f) => statusKey(f.status) !== 'offline';
  const playing = fs.filter(f => on(f) && f.playing), online = fs.filter(f => on(f) && !f.playing), off = fs.filter(f => !on(f));
  const frag = [];
  const grp = (t, a) => { if (a.length) frag.push(h('div', { class: 'fgroup-title', text: `${t} — ${a.length}` }), ...a.map(f => personRow(f, { href: '#/dm/' + enc(f.id) }))); };
  grp(tr('Playing now'), playing); grp(tr('Online'), online); grp(tr('Offline'), off);
  if (!fs.length) frag.push(emptyState(tr('No friends yet'), tr('Search for people and send a request.')));
  TWM.flip(S.el.fList, '.frow', () => S.el.fList.replaceChildren(...frag));
  S.el.fCount.textContent = tr('{n} online', { n: fs.filter(on).length });
}
function renderBadge() {
  const n = S.invites.length + S.reqs.incoming.length;
  if (!S.el.badge) return;
  const txt = n > 9 ? '9+' : String(n);
  if (S.el.badge.textContent !== txt && n) { S.el.badge.classList.remove('pop'); void S.el.badge.offsetWidth; S.el.badge.classList.add('pop'); }
  S.el.badge.hidden = !n; S.el.badge.textContent = txt;
}

/* ================= router ================= */
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
/* o.to: build-time morph target. The clicked card (or the group header) morphs into it via a view transition. */
function show(node, o = {}) {
  TWM.prog.done();
  const hash = location.hash || '#/find';
  if (hash.startsWith('#/find') || hash === '#/feed' || hash === '#/search' || hash === '#/discover' || hash === '#/lfg') {
    const parts = hash.replace(/^#\/?/, '').split('/');
    const p0 = parts[0] || 'find';
    const sub = parts[1] || (p0 === 'find' ? 'lfg' : p0 === 'feed' ? 'activity' : p0 === 'search' ? 'groups' : p0);
    const activeSub = (sub === 'groups' || sub === 'search') ? 'groups' :
                      (sub === 'discover') ? 'discover' :
                      (sub === 'activity' || sub === 'feed') ? 'activity' : 'lfg';
    if (node && node.classList && node.classList.contains('page') && !node.querySelector('.find-subtabs')) {
      const phead = node.querySelector('.page-head');
      const navEl = tabs([
        ['lfg', tr('LFG')],
        ['groups', tr('Browse Groups')],
        ['discover', tr('Discover')],
        ['activity', tr('Activity')]
      ], activeSub, (k) => {
        location.hash = '#/find/' + k;
      }, 'Find & LFG sections');
      navEl.classList.add('find-subtabs');
      if (phead) phead.after(navEl);
      else node.prepend(navEl);
    }
  }
  const from = o.from && o.from.isConnected ? o.from : null;
  if (!from) node.classList.add('view-in');
  TWM.transition(() => {
    S.el.view.replaceChildren(node);
    if (!node.classList.contains('chat-page')) S.el.view.scrollTop = 0;
  }, { from, to: o.to });
}
function clearTimers() { clearInterval(S.chatTimer); S.chatTimer = null; S.onData = null; (S.rtOff || []).forEach(f => { try { f(); } catch { /* ignore */ } }); S.rtOff = []; }
function markNav() {
  const hash = location.hash || '#/find';
  document.querySelectorAll('[data-route]').forEach(a => {
    const r = a.dataset.route;
    const isFindRoute = r === '#/find' && (hash.startsWith('#/find') || hash === '#/feed' || hash === '#/search' || hash === '#/discover' || hash === '#/lfg');
    const on = isFindRoute || (r !== '#/find' && hash.startsWith(r));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const curExtra = document.querySelector('.nav-extra[aria-current="page"]'); if (curExtra && curExtra.hidden && S.el.setMore) S.el.setMore(true);
  renderRail(); TWM.nav();
}
async function findView(sub, tok) {
  const activeSub = (sub === 'groups' || sub === 'search') ? 'groups' :
                    (sub === 'discover') ? 'discover' :
                    (sub === 'activity' || sub === 'feed') ? 'activity' : 'lfg';

  if (activeSub === 'lfg') {
    if (TWPages.lfg) await TWPages.lfg(null, tok);
  } else if (activeSub === 'groups') {
    await searchView(null, tok);
  } else if (activeSub === 'discover') {
    if (TWPages.discover) await TWPages.discover(null, tok);
  } else if (activeSub === 'activity') {
    await feedView(null, tok);
  }

  if (S.el.view) {
    const page = S.el.view.querySelector('.page');
    if (page && !page.querySelector('.find-subtabs')) {
      const phead = page.querySelector('.page-head');
      const navEl = tabs([
        ['lfg', tr('LFG')],
        ['groups', tr('Browse Groups')],
        ['discover', tr('Discover')],
        ['activity', tr('Activity')]
      ], activeSub, (k) => {
        location.hash = '#/find/' + k;
      }, 'Find & LFG sections');
      navEl.classList.add('find-subtabs');
      if (phead) phead.after(navEl);
      else page.prepend(navEl);
    }
  }
}

async function route() {
  if (!S.me || !S.el.view) return;
  clearTimers();
  const tok = ++S.tok;
  const parts = (location.hash || '#/find').replace(/^#\/?/, '').split('/');
  const gh = S.el.view.querySelector('.ghead');
  S.leaving = gh ? { el: gh, id: S.viewGroup } : null;
  S.viewGroup = null;
  TWM.prog.start();
  markNav();
  const p0 = parts[0] || 'find';
  if (p0 === 'find' || p0 === 'feed' || p0 === 'search' || p0 === 'discover' || p0 === 'lfg') {
    let sub = parts[1] || (p0 === 'find' ? 'lfg' : p0 === 'feed' ? 'activity' : p0 === 'search' ? 'groups' : p0);
    try { await findView(sub, tok); }
    catch (e) { if (tok === S.tok) show(h('div', { class: 'page' }, emptyState('That didn’t load', e.message || 'Please try again.', btn('Try again', { onclick: route })))); }
    if (tok === S.tok) TWM.prog.done();
    document.title = 'Third Wheel';
    return;
  }
  const closedKey = { friends: 'friends', dm: 'dms', messages: 'dms', group: 'groups' }[p0];
  const closedMsg = closedKey && S.site.closed[closedKey];
  if (closedMsg && !S.me.isAdmin) {
    show(h('div', { class: 'page' }, emptyState('This page is closed', T(closedMsg))));
    return;
  }
  const fn = { group: groupView, dm: dmView, friends: friendsView, settings: settingsView, admin: adminView, join: (c, t) => window.TWG ? TWG.joinView(c, t) : findView('lfg', t) }[p0] || TWPages[p0] || findView;
  try { await fn(parts[1], tok); }
  catch (e) { if (tok === S.tok) show(h('div', { class: 'page' }, emptyState('That didn’t load', e.message || 'Please try again.', btn('Try again', { onclick: route })))); }
  if (tok === S.tok) TWM.prog.done();
  document.title = 'Third Wheel';
}
const stale = (tok) => tok !== S.tok;

/* ================= feed ================= */
function groupCard(g) {
  const ages = g.ageMin || g.ageMax ? `Ages ${g.ageMin || '13'}–${g.ageMax || '99'}` : 'All ages';
  const card = h('article', { class: 'gcard', 'data-key': 'g' + g.id, 'data-id': g.id },
    h('div', { class: 'title-row', style: 'display:flex;align-items:center;gap:10px;' }, groupTile(g), h('h3', {}, h('a', { href: '#/group/' + enc(g.id) }, T(g.name)))),
    h('div', { class: 'chips' }, h('span', { class: 'chip accent', style: 'display:inline-flex;align-items:center;gap:4px;' }, gameThumb(g.game), h('span', { text: T(g.game) })), h('span', { class: 'chip', text: g.mode === 'competitive' ? 'Competitive' : 'Casual' }),
      g.region ? h('span', { class: 'chip', text: T(g.region) }) : null, h('span', { class: 'chip', text: ages })),
    g.description ? h('p', { text: T(g.description) }) : null,
    h('div', { class: 'foot' }, h('span', {}, icon('users', 14), ' ', `${g.memberCount ?? 0} member${g.memberCount === 1 ? '' : 's'}`),
      g.isMember ? h('span', { class: 'chip ok' }, icon('check', 12), 'Joined') : (g.maxMembers > 0 && g.memberCount >= g.maxMembers) ? h('span', { class: 'chip bad', text: 'Group full' }) : null));
  card.style.setProperty('--gc', safeColor(g.color));
  return card;
}
async function feedView(_, tok) {
  const page = h('div', { class: 'page' });
  const cached = S.feedCache && S.feedCache.length ? S.feedCache : null;
  const back = S.leaving && cached ? S.leaving : null;
  const list = h('div', { class: 'grid' + (back ? '' : ' stagger') });
  const recSlot = h('div', { class: 'rec-slot' });   // "Recommended for you" (profile.js)
  const empty =() => emptyState('Nothing here yet', 'Try searching for a game, or start a group of your own.', btn('Find groups', { onclick: () => go('#/search') }));
  page.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: tr('Your feed') }), h('p', { class: 'muted', text: tr('Groups picked for your games, region and age.') })),
    btn('Create group', { icon: 'plus', onclick: openCreate })), recSlot, list);
  if (cached) { list.append(...cached.map(groupCard)); if (!back) stagger(list); }
  else list.append(h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  show(page, back ? { from: back.el, to: () => page.querySelector(`.gcard[data-id="${CSS.escape(String(back.id))}"]`) } : {});
  if (window.TWProfile) TWProfile.groupRecs(recSlot, () => stale(tok));
  const groups = await api('GET', '/api/feed'); if (stale(tok)) return;
  const had = S.feedCache; S.feedCache = groups;
  if (!groups.length) { list.replaceWith(empty()); return; }
  if (cached && JSON.stringify(had) === JSON.stringify(groups)) return;
  if (cached) TWM.flip(list, '.gcard', () => list.replaceChildren(...groups.map(groupCard)));
  else { list.replaceChildren(...groups.map(groupCard)); stagger(list); }
}

/* ================= search ================= */
let searchTimer = null, searchSeq = 0;
function setQuery(v, from) {
  S.q.q = v;
  document.querySelectorAll('.qinput').forEach(i => { if (i !== from) i.value = v; });
  clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(), 280);
}
let renderResults = null;
async function runSearch(now) {
  if (!renderResults) return;
  const seq = ++searchSeq, q = S.q;
  try {
    const r = await api('GET', '/api/search' + qs({ q: q.q.trim(), game: q.game, mode: q.mode, region: q.region, ageMin: q.ageMin, ageMax: q.ageMax }));
    if (seq === searchSeq && renderResults) renderResults(r);
  } catch (e) { if (seq === searchSeq) toast(e.message, 'error'); }
}
async function searchView(_, tok) {
  const q = S.q;
  const mq = h('input', { class: 'input qinput', type: 'search', placeholder: 'Search groups and people', 'aria-label': 'Search groups and people', maxlength: 60, autocomplete: 'off', value: q.q });
  mq.addEventListener('input', () => setQuery(mq.value, mq));
  if (S.el.q) S.el.q.value = q.q;
  const game = gamePicker({ multi: false, value: q.game, anyLabel: 'Any game', placeholder: 'Any game' });
  const mode = selectEl([['casual', 'Casual'], ['competitive', 'Competitive']], q.mode, 'Casual or competitive');
  const region = selectEl(S.meta.regions, q.region, 'Any region');
  const amin = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 13, max: 99, placeholder: 'Min', 'aria-label': 'Minimum age', value: q.ageMin });
  const amax = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 13, max: 99, placeholder: 'Max', 'aria-label': 'Maximum age', value: q.ageMax });
  const bind = (el, k) => el.addEventListener('change', () => { q[k] = el.value; runSearch(); });
  bind(game, 'game'); bind(mode, 'mode'); bind(region, 'region');
  const ageChange = () => {
    const a = parseInt(amin.value, 10), b = parseInt(amax.value, 10);
    q.ageMin = a >= 13 && a <= 99 ? String(a) : ''; q.ageMax = b >= 13 && b <= 99 ? String(b) : ''; runSearch();
  };
  amin.addEventListener('change', ageChange); amax.addEventListener('change', ageChange);
  const filters = h('section', { class: 'card filters', 'aria-label': 'Search filters' },
    field('Game', game), field('Casual or competitive', mode), field('Region', region),
    h('div', { class: 'field age-field' }, h('span', { class: 'label', text: 'Age range' }), h('div', { class: 'age' }, amin, h('span', { 'aria-hidden': 'true' }, '–'), amax), h('div', { class: 'field-msg' })));
  filters.querySelectorAll('.field-msg').forEach(m => { if (!m.textContent) m.style.display = 'none'; });
  const results = h('div', { class: 'section', role: 'tabpanel' });
  const tb = tabs([['groups', 'Groups'], ['people', 'People']], q.tab, (k) => { q.tab = k; draw(); TWM.slide(results, k === 'people' ? 1 : -1); }, 'Results');
  let last = { groups: [], people: [] }, loaded = false;
  function setCounts() { tb.buttons[0].replaceChildren('Groups', loaded ? h('span', { class: 'count', text: String(last.groups.length) }) : ''); tb.buttons[1].replaceChildren('People', loaded ? h('span', { class: 'count', text: String(last.people.length) }) : ''); }
  function draw() {
    setCounts(); tb.set(q.tab);
    TWM.flip(results, '.gcard, .frow', paint);
  }
  function paint() {
    if (q.tab === 'groups') {
      const grid = h('div', { class: 'grid' }, last.groups.map(groupCard));
      results.replaceChildren(last.groups.length ? grid : emptyState('No groups found', 'Loosen a filter or create the group you wish existed.', btn('Create group', { onclick: openCreate })));
    } else {
      const fr = last.people.filter(p => p.isFriend), other = last.people.filter(p => !p.isFriend);
      const frag = [];
      const addBtn = (p) => { const b = btn('Add friend', { cls: 'small', icon: 'plus' }); b.addEventListener('click', () => busy(b, async () => { await api('POST', '/api/friends/request', { username: p.username }); b.replaceWith(h('span', { class: 'chip ok' }, icon('check', 12), 'Requested')); toast('Friend request sent'); })); return b; };
      if (fr.length) frag.push(h('div', { class: 'section' }, h('div', { class: 'section-title', text: `Friends — ${fr.length}` }), stagger(h('div', { class: 'stack', style: 'gap:8px' }, fr.map(p => personRow(p, { big: true, region: true, href: '#/dm/' + enc(p.id) }))))));
      if (other.length) frag.push(h('div', { class: 'section' }, h('div', { class: 'section-title', text: `${fr.length ? 'More people' : 'People'} — ${other.length}` }), stagger(h('div', { class: 'stack', style: 'gap:8px' }, other.map(p => personRow(p, { big: true, region: true, action: addBtn(p) }))))));
      results.replaceChildren(...(frag.length ? frag : [emptyState('No people found', 'Try a different name or filter.')]));
    }
  }
  renderResults = (r) => { last = { groups: r.groups || [], people: r.people || [] }; loaded = true; draw(); };
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: tr('Find your people') }), h('p', { class: 'muted', text: tr('Filter by game, play style, region and age.') }))),
    h('div', { class: 'searchbox search-query', role: 'search' }, h('span', { class: 'ico' }, icon('search', 18)), mq),
    filters, tb, results);
  show(page); draw();
  S.onData = null; clearTimeout(searchTimer);
  await runSearch(true); if (stale(tok)) renderResults = null;
}

/* ================= group ================= */
async function groupView(id, tok) {
  const page = h('div', { class: 'chat-page' });
  const g = await api('GET', '/api/groups/' + enc(id)); if (stale(tok)) return;
  S.viewGroup = g.id;
  const morph = S.morphFrom && S.morphFrom.isConnected && S.morphFrom.dataset.id === String(g.id) ? S.morphFrom : null;
  S.morphFrom = null;
  const members = g.members || [];
  const isMember = !!g.isMember;
  const first = isMember ? await api('GET', `/api/groups/${enc(g.id)}/messages`) : [];
  if (stale(tok)) return;
  const ages = g.ageMin || g.ageMax ? `Ages ${g.ageMin || '13'}–${g.ageMax || '99'}` : 'All ages';
  const G = window.TWG;   // roles / moderation / requests UI from js/groups.js
  // Slim header: name, voice button and a ⋯ menu on one line; the chips on a second; description, invite code and members fold away under "Details".
  const actions = h('div', { class: 'row group-actions', style: 'flex:none;gap:8px;align-items:center' });
  const tuck = h('div', { hidden: true });   // the real buttons live here so the ⋯ menu can press them
  if (isMember) {
    if (window.TWVoice) actions.append(TWVoice.button(g));   // join / leave the group's voice chat
    const real = [btn('Invite friend', { cls: 'small', icon: 'plus', onclick: () => openInvite(g, members) }), ...(G ? G.headerButtons(g, route) : []), btn('Leave', { cls: 'small ghost', onclick: (e) => leaveGroup(g, e.currentTarget) })];
    tuck.append(...real);
    const more = h('button', { class: 'icon-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-label': tr('More'), title: tr('More') }, icon('dots'));
    more.addEventListener('click', () => {
      document.querySelectorAll('.topbar-menu').forEach(x => x.remove());
      const pop = h('div', { class: 'topbar-menu', role: 'menu' }, ...real.map(rb => h('button', { type: 'button', role: 'menuitem', onclick: () => { close(); rb.click(); } }, h('span', { text: rb.textContent.trim() }))));
      document.body.append(pop);
      const r = more.getBoundingClientRect();
      pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
      const out = (e) => { if (!pop.contains(e.target) && !more.contains(e.target)) close(); };
      const key = (e) => { if (e.key === 'Escape') { close(); more.focus(); } };
      function close() { pop.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); }
      document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true);
      pop.querySelector('button').focus();
    });
    actions.append(more, tuck);
  } else if (G) {
    actions.append(...G.joinControls(g, route));
  }
  const detailsBox = h('div', { class: 'ghead-details' },
    g.description ? h('p', { class: 'desc', text: T(g.description) }) : null,
    h('p', { class: 'muted small', text: ages }),
    G ? G.inviteRow(g) : null,
    members.length ? (G ? G.members(g, route) : h('div', { class: 'members stagger-pop', 'aria-label': 'Members' }, members.map(m => h('button', { class: 'member', type: 'button', 'aria-label': 'View ' + nm(m) + '’s profile', onclick: () => openProfile(m.id) }, avatar(m, 'sm'), nm(m))))) : null);
  const detailsOpen = !isMember;   // people who haven't joined yet need the description to decide
  const moreBtn = h('button', { class: 'ghead-more', type: 'button', 'aria-expanded': String(detailsOpen) }, tr('Details'), icon('chev', 14));
  detailsBox.hidden = !detailsOpen;
  moreBtn.addEventListener('click', () => { const on = detailsBox.hidden; detailsBox.hidden = !on; moreBtn.setAttribute('aria-expanded', String(on)); });
  const head = h('div', { class: 'ghead slim' },
    h('div', { class: 'top', style: 'display:flex;align-items:center;gap:12px;' }, h('a', { class: 'icon-btn mobile-only', href: '#/feed', 'aria-label': 'Back to feed' }, icon('back')), groupTile(g, 'big'), h('h1', { text: T(g.name), style: 'flex:1;' }), actions),
    h('div', { class: 'ghead-meta' }, h('span', { class: 'chip accent', style: 'display:inline-flex;align-items:center;gap:4px;' }, gameThumb(g.game), h('span', { text: T(g.game) })), h('span', { class: 'chip', text: g.mode === 'competitive' ? 'Competitive' : 'Casual' }),
      g.region ? h('span', { class: 'chip', text: T(g.region) }) : null, h('span', { class: 'chip', text: `${g.memberCount ?? members.length} members` }),
      g.privacy === 'private' ? h('span', { class: 'chip', text: 'Private' }) : g.privacy === 'request' ? h('span', { class: 'chip', text: 'Approval needed' }) : null,
      ...(G ? G.extraChips(g) : []), moreBtn),
    detailsBox);
  head.querySelectorAll('.btn.small').forEach(b => b.style.minHeight = '32px');
  head.querySelectorAll('.stagger-pop').forEach(stagger);
  const showPage = () => show(page, morph ? { from: morph, to: () => head } : {});
  if (!isMember) {
    page.replaceChildren(head, h('div', { class: 'locked' }, emptyState(g.requested ? 'Request sent' : g.privacy === 'request' ? 'Ask to join' : 'Join to chat',
      g.requested ? 'A moderator will review your request. You’ll see the chat once you’re approved.'
        : g.privacy === 'request' ? 'This group approves new members. Send a request and a moderator will review it.'
        : 'Members can chat in this group’s private chat room.')));
    showPage(); return;
  }
  const chat = makeChat({
    placeholder: 'Message ' + T(g.name), label: 'Group chat', tok, conv: { kind: 'g', id: g.id },
    list: (after) => api('GET', `/api/groups/${enc(g.id)}/messages` + qs({ after })),
    post: (text) => api('POST', `/api/groups/${enc(g.id)}/messages`, { text })
  });
  chat.fill(first, 'Say hi 👋', 'Be the first to message the group.');
  page.replaceChildren(head, ...(chat.tools ? [chat.tools] : []), chat.log, chat.composer);
  showPage();
  chat.log.scrollTo({ top: chat.log.scrollHeight, behavior: 'instant' });
  chat.done();
  S.chatTimer = every(() => { if (!document.hidden) chat.poll(); }, POLL_MS);
  if (window.TWRT) (S.rtOff = S.rtOff || []).push(TWRT.pokes('chat', () => { if (!document.hidden) chat.poll(); }, m => m.k === 'g' && String(m.id) === String(g.id)));
  if (matchMedia('(min-width:900px)').matches) chat.input.focus();
}
function leaveGroup(g, b) {
  const alone = (g.memberCount ?? 2) <= 1;
  const close = openSheet(alone ? 'Delete group?' : 'Leave group?', h('div', { class: 'stack' }, h('p', { class: 'muted', text: alone
    ? `You’re the only member of ${T(g.name)}. Leaving will delete the group and its chat for good.`
    : g.myRole === 'owner' ? `You’re the owner of ${T(g.name)}. If you leave, ownership passes to the longest-serving moderator (or the oldest member).`
    : `You’ll stop seeing ${T(g.name)} and its chat.` }),
    h('div', { class: 'row' }, btn('Stay', { cls: 'ghost', onclick: () => close() }), (() => {
      const d = btn(alone ? 'Delete group' : 'Leave group', { cls: 'danger' });
      d.addEventListener('click', () => busy(d, async () => {
        const r = await api('POST', `/api/groups/${enc(g.id)}/leave`);
        S.feedCache = null; await refreshMine(); close(); go('#/feed');
        toast(r && r.deleted ? T(g.name) + ' was deleted' : 'You left ' + T(g.name));
      }));
      return d;
    })())));
}
function openInvite(g, members) {
  const inGroup = new Set(members.map(m => m.id));
  const list = h('div', { class: 'stack', style: 'gap:8px' });
  const cands = S.friends.filter(f => !inGroup.has(f.id));
  for (const f of cands) {
    const b = btn('Invite', { cls: 'small' });
    b.addEventListener('click', () => busy(b, async () => { await api('POST', `/api/groups/${enc(g.id)}/invites`, { userId: f.id }); b.replaceWith(h('span', { class: 'chip ok' }, icon('check', 12), 'Invited')); }));
    list.append(personRow(f, { action: b }));
  }
  openSheet('Invite a friend', cands.length ? list : emptyState('No one to invite', 'All your friends are already here, or you haven’t added any yet.'));
}

/* ================= profiles + direct messages ================= */
/* opts (all optional): { group, member, reload } when opened from a group's member list, so the ⋯ menu can offer that group's moderation actions. */
async function openProfile(id, opts) {
  let p;
  try { p = await api('GET', '/api/users/' + enc(id)); } catch (e) { toast(e.message, 'error'); return; }
  const sk = statusKey(p.status);
  let close = () => {};
  const row = (k, v) => v ? h('div', { class: 'prow' }, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })) : null;
  const joined = new Date(p.joined);
  const actions = h('div', { class: 'row', style: 'gap:8px;flex:none' });
  if (p.isMe) actions.append(btn('Edit profile', { onclick: () => { close(); go('#/settings'); } }));
  else if (p.isFriend) actions.append(btn('Message', { icon: 'send', onclick: () => { close(); go('#/dm/' + enc(p.id)); } }));
  else {
    const add = btn('Add friend', { icon: 'plus' });
    add.addEventListener('click', () => busy(add, async () => { await api('POST', '/api/friends/request', { username: p.username }); add.replaceWith(h('span', { class: 'chip ok' }, icon('check', 12), 'Requested')); toast('Friend request sent'); }));
    actions.append(add);
  }
  const games = p.favoriteGames || [];
  const extra = h('div', { class: 'profile-extra' });
  // ⋯ menu (top right): group moderation, block, report. Not shown on your own profile.
  let more = null;
  if (!p.isMe && window.TWG) {
    more = h('button', { class: 'icon-btn profile-more', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More actions for ' + nm(p), text: '⋯' });
    more.addEventListener('click', () => TWG.profileMenu(more, p, opts, () => close()));
  }
  const bannerHeader = p.banner ? h('div', { class: 'profile-banner', style: 'background-image:url(\'' + p.banner + '\');background-size:cover;background-position:center;' }) : null;
  const effectOverlay = p.effect && window.TW && window.TW.fx ? window.TW.fx(p.effect) : null;
  const body = h('div', { class: 'profile' },
    effectOverlay,
    bannerHeader,
    h('div', { class: 'profile-top' + (more ? ' has-more' : '') + (p.banner ? ' with-banner' : '') }, avatar(p, 'xl', true),
      h('div', { class: 'profile-names' }, h('h2', { text: nm(p) }), h('p', { class: 'muted', text: '@' + T(p.username) }),
        h('p', { class: 'status-line' + (p.playing ? ' playing' : '') }, p.playing ? gameThumb(p.playing) : null, h('span', { class: 'status-txt', text: p.playing ? playingStatusText(p) : STATUS[sk] }))), more),
    h('div', { class: 'prows' }, row('Region', T(p.region)), row('Age', p.ageRange), row('Member since', isNaN(joined) ? '' : joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))),
    (() => {
      if (!games.length) return null;
      let expanded = false;
      const chipsContainer = h('div', { class: 'chips favgames' });
      const renderChips = () => {
        chipsContainer.innerHTML = '';
        const visible = expanded ? games : games.slice(0, 5);
        for (const g of visible) {
          chipsContainer.append(h('span', { class: 'chip favgame-chip' }, gameThumb(g), h('span', { class: 'chip-txt', text: T(g) })));
        }
        if (games.length > 5) {
          const toggleBtn = h('button', {
            class: 'chip toggle-more-games',
            type: 'button',
            onclick: () => { expanded = !expanded; renderChips(); }
          }, expanded ? tr('Show less') : `+${games.length - 5} ${tr('more')}`);
          chipsContainer.append(toggleBtn);
        }
      };
      renderChips();
      return h('div', { class: 'section', 'data-sec': 'games' }, h('div', { class: 'section-title', text: 'Favorite games' }), chipsContainer);
    })(),
    extra, actions);
  if (window.TWProfile) TWProfile.profileDetails(extra, p.id);   // bio, play style, ranks/roles, availability (profile.js)
  close = openSheet('Profile', body);
}

/* Shared chat pane (used by DMs). */
function makeChat(cfg) {
  if (cfg.conv && window.TWChat) return window.TWChat.make(cfg);   // full-featured pane lives in js/chat.js
  const { placeholder, label, list, post, tok } = cfg;
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': label, tabindex: '0' });
  const input = h('input', { class: 'input', type: 'text', maxlength: 500, placeholder, 'aria-label': 'Message', autocomplete: 'off' });
  const send = h('button', { class: 'btn', type: 'submit', 'aria-label': 'Send message' }, icon('send', 18));
  const seen = new Set(); let lastId = 0, initial = true;
  const composer = h('form', { class: 'composer', onsubmit: async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    send.disabled = true;
    const rect = input.getBoundingClientRect();
    try {
      const m = await post(text); input.value = '';
      send.classList.add('sent'); setTimeout(() => send.classList.remove('sent'), 600);
      if (m && m.id) append([m], true, rect); else poll();
    } catch (ex) { toast(ex.message, 'error'); } finally { send.disabled = false; input.focus(); }
  } }, input, send);
  function append(msgs, force, fromRect) {
    const fresh = msgs.filter(m => !seen.has(m.id)); if (!fresh.length) return;
    const near = force || log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    const gone = log.querySelector('[data-empty]'); if (gone) gone.remove();
    const made = [];
    for (const m of fresh) {
      seen.add(m.id); if (typeof m.id === 'number' && m.id > lastId) lastId = m.id;
      const when = new Date(m.createdAt);
      const av = avatar(m, 'md');
      av.style.cursor = 'pointer';
      av.title = tr('View profile');
      av.addEventListener('click', (e) => { e.stopPropagation(); openProfile(m.userId); });

      const author = h('b', { class: 'msg-author', style: 'cursor:pointer', title: tr('View profile'), text: nm(m) });
      author.addEventListener('click', (e) => { e.stopPropagation(); openProfile(m.userId); });

      const el = h('div', { class: 'msg' + (m.userId === S.me.id ? ' own' : '') }, av,
        h('div', { class: 'body' }, h('div', { class: 'head' }, author, h('time', { text: isNaN(when) ? '' : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), datetime: isNaN(when) ? null : when.toISOString() })),
          h('p', { text: T(m.text) })));
      if (initial) el.style.animationDelay = (300 + Math.min(made.length, 12) * 40) + 'ms';
      log.append(el); made.push(el);
    }
    if (near) log.scrollTo({ top: log.scrollHeight, behavior: fromRect || initial ? 'instant' : 'smooth' });
    if (fromRect && made.length) TWM.flyFrom(made[made.length - 1], fromRect);
  }
  async function poll() { try { const m = await list(lastId || ''); if (!stale(tok)) append(m || []); } catch { /* retry next tick */ } }
  return {
    log, composer, input, poll,
    fill(first, emptyTitle, emptyText) {
      if (!first.length) log.append(h('div', { class: 'empty', 'data-empty': '' }, h('b', { text: emptyTitle }), h('p', { text: emptyText })));
      append(first, true);
    },
    done() { setTimeout(() => { initial = false; }, 0); }
  };
}

async function dmView(id, tok) {
  const [p, first] = await Promise.all([api('GET', '/api/users/' + enc(id)), api('GET', '/api/dms/' + enc(id))]);
  if (stale(tok)) return;
  const sub = h('span', { class: 'muted small' });
  const paintSub = () => { const f = S.friends.find(x => x.id === p.id) || p; if (f.playing) { sub.className = 'playing'; sub.replaceChildren(gameThumb(f.playing), h('span', { class: 'playing-txt', text: playingStatusText(f) })); } else { sub.className = 'muted small'; sub.textContent = STATUS[statusKey(f.status)]; } };
  paintSub();
  const who = h('button', { class: 'dm-who', type: 'button', 'aria-label': 'View ' + nm(p) + '’s profile', onclick: () => openProfile(p.id) },
    avatar(p, 'md', true), h('span', { class: 'dm-names' }, h('b', { text: nm(p) }), sub));
  const head = h('div', { class: 'ghead dmhead' }, h('div', { class: 'top' },
    h('a', { class: 'icon-btn mobile-only', href: '#/friends', 'aria-label': 'Back to friends' }, icon('back')), who,
    window.TWVoice ? h('div', { class: 'dm-call', style: 'margin-left:auto' }, TWVoice.dmButton(p)) : null));   // voice call with this friend
  const chat = makeChat({
    placeholder: 'Message ' + nm(p), label: 'Direct messages with ' + nm(p), tok, conv: { kind: 'd', id: p.id },
    list: (after) => api('GET', `/api/dms/${enc(p.id)}` + qs({ after })),
    post: (text) => api('POST', `/api/dms/${enc(p.id)}`, { text })
  });
  chat.fill(first, 'Say hi 👋', 'This is the start of your chat with ' + nm(p) + '.');
  const page = h('div', { class: 'chat-page' }, head, ...(chat.tools ? [chat.tools] : []), chat.log, chat.composer);
  show(page);
  const scrollDown = () => {
    if (chat.log) {
      chat.log.scrollTop = chat.log.scrollHeight;
      chat.log.scrollTo({ top: chat.log.scrollHeight, behavior: 'instant' });
    }
  };
  scrollDown();
  requestAnimationFrame(() => {
    scrollDown();
    setTimeout(scrollDown, 50);
    setTimeout(scrollDown, 250);
  });
  chat.done();
  S.chatTimer = every(() => { if (!document.hidden) { chat.poll(); paintSub(); } }, POLL_MS);
  if (window.TWRT) (S.rtOff = S.rtOff || []).push(TWRT.pokes('chat', () => { if (!document.hidden) { chat.poll(); paintSub(); } }, m => m.k === 'd' && String(m.id) === String(p.id)));
  if (matchMedia('(min-width:900px)').matches) chat.input.focus();
}

/* ================= admin panel ================= */
const PAGE_LABELS = { feed: 'Feed', search: 'Find groups', friends: 'Friends & invites', dms: 'Direct messages', groups: 'Groups & group chats', signup: 'New sign-ups' };
function confirmSheet(title, text, label, fn, extra) {
  let close = () => {};
  const go = btn(label, { cls: 'danger' });
  go.addEventListener('click', () => busy(go, async () => { await fn(); close(); }));
  close = openSheet(title, h('div', { class: 'stack' }, h('p', { class: 'muted', text }), extra || null,
    h('div', { class: 'row' }, btn('Cancel', { cls: 'ghost', onclick: () => close() }), go)));
}
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

async function adminView(_, tok) {
  if (!S.me.isAdmin) { show(h('div', { class: 'page' }, emptyState('Admins only', 'You don’t have access to this page.'))); return; }
  const body = h('div', { class: 'section' });
  let seq = 0;
  const tb = tabs([['overview', 'Overview'], ['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'Users'], ['groups', 'Groups']], S.adminTab || 'overview', (k) => { S.adminTab = k; draw(); TWM.slide(body, 1); }, 'Admin sections');
  show(h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Admin' }), h('p', { class: 'muted', text: 'Manage people, groups and the whole site.' }))), tb, body));
  draw();

  function draw() {
    const mine = ++seq, tab = S.adminTab || 'overview';
    tb.set(tab);
    body.replaceChildren(h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
    const run = tab === 'users' ? usersTab : tab === 'groups' ? groupsTab : tab === 'reports' ? reportsTab : tab === 'appeals' ? appealsTab : overviewTab;
    run(() => mine !== seq || stale(tok)).catch(e => { if (mine === seq) body.replaceChildren(emptyState('That didn’t load', e.message || 'Please try again.')); });
  }

  async function overviewTab(dead) {
    const [st, site] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/site')]); if (dead()) return;
    const stat = (n, label) => h('div', { class: 'card stat' }, h('b', { text: String(n) }), h('span', { class: 'muted small', text: label }));
    const maintOn = switchEl(site.maintenance.on, () => {}, 'Maintenance mode');
    const maintMsg = h('input', { class: 'input', type: 'text', maxlength: 200, value: site.maintenance.on ? T(site.maintenance.message) : '', placeholder: 'Message shown to users, e.g. Back at 5pm', 'aria-label': 'Maintenance message' });
    const rows = (site.pages || Object.keys(PAGE_LABELS)).map(p => {
      const on = switchEl(!!site.closed[p], () => {}, 'Close ' + PAGE_LABELS[p]);
      const msg = h('input', { class: 'input', type: 'text', maxlength: 200, value: site.closed[p] ? T(site.closed[p]) : '', placeholder: 'Message shown to users', 'aria-label': 'Message for ' + PAGE_LABELS[p] });
      return { p, on, msg, el: h('div', { class: 'ctl-row' }, on, h('span', { class: 'ctl-name', text: PAGE_LABELS[p] }), msg) };
    });
    const ageOn = switchEl(site.ageSeparation !== false, () => {}, 'Age separation');
    const save = btn('Save site controls', { icon: 'check' });
    save.addEventListener('click', () => busy(save, async () => {
      const closed = {}; rows.forEach(r => { if (r.on.getAttribute('aria-checked') === 'true') closed[r.p] = r.msg.value.trim(); });
      const on = maintOn.getAttribute('aria-checked') === 'true';
      S.site = await api('PUT', '/api/admin/site', { maintenance: { on, message: maintMsg.value.trim() }, closed, ageSeparation: ageOn.getAttribute('aria-checked') === 'true' });
      toast(on ? 'Maintenance mode is ON for everyone except admins' : 'Site controls saved');
    }));
    body.replaceChildren(
      h('div', { class: 'stats' }, stat(st.users, 'Users'), stat(st.online, 'Online now'), stat(st.banned, 'Suspended'), stat(st.groups, 'Groups'), stat(st.groupMessages, 'Group messages'), stat(st.directMessages, 'Direct messages')),
      h('div', { class: 'card', style: 'padding:20px;display:flex;flex-direction:column;gap:14px' },
        h('h3', { text: 'Maintenance mode' }),
        h('div', { class: 'ctl-row' }, maintOn, h('span', { class: 'ctl-name', text: 'Close the whole site' }), maintMsg),
        h('p', { class: 'muted small', text: 'Everyone except admins sees the message and can’t use the app. Admins keep full access.' }),
        h('h3', { text: 'Close individual pages', style: 'margin-top:8px' }), ...rows.map(r => r.el),
        h('h3', { text: 'Age separation', style: 'margin-top:8px' }),
        h('div', { class: 'ctl-row' }, ageOn, h('span', { class: 'ctl-name', text: 'Keep under-18s and adults apart' })),
        h('p', { class: 'muted small', text: 'On: under-18s only see groups and people under 18, adults only see 18+. Ages are self-declared.' }),
        h('div', {}, save)),
      h('div', { class: 'section' }, h('div', { class: 'section-title', text: 'Recent admin activity' }),
        st.recent.length ? h('div', { class: 'stack', style: 'gap:6px' }, st.recent.map(r => h('div', { class: 'arow small-row' },
          h('span', {}, h('b', { text: T(r.admin || 'admin') }), ' ' + r.action + ' ', h('span', { class: 'muted', text: T(r.target) })), h('span', { class: 'muted small', text: when(r.at) }))))
          : h('p', { class: 'muted', text: 'Nothing yet.' })));
  }

  /* Reports from users: pending first. Shows what was said (a snapshot, so it survives a delete), who reported it and where. */
  async function reportsTab(dead) {
    const REASON = { spam: 'Spam or scam', harassment: 'Harassment or bullying', hate: 'Hate speech', sexual: 'Sexual content', other: 'Something else' };
    let rows = await api('GET', '/api/admin/reports'); if (dead()) return;
    let showAll = false;
    const list = h('div', { class: 'stack', style: 'gap:10px' });
    const filter = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => { showAll = !showAll; filter.setAttribute('aria-pressed', String(showAll)); paint(); } }, 'Show resolved');
    const head = h('div', { class: 'row', style: 'align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' }, h('div', { class: 'section-title', text: 'Reports' }), filter);
    function card(r) {
      const done = r.status !== 'pending';
      const who = (name, id) => name ? h('button', { class: 'linklike', type: 'button', onclick: () => id && openProfile(id) }, '@' + T(name)) : h('span', { class: 'muted', text: 'deleted user' });
      function openResolveModal(rep) {
        let close = () => {};
        const targetName = rep.reportedName ? '@' + T(rep.reportedName) : 'User';

        const actionRadios = [
          { id: 'dismiss', label: 'Dismiss report', desc: 'No penalty or action against the reported user.' },
          { id: 'warn', label: 'Issue a warning', desc: 'Send an official moderation warning notification.' },
          { id: 'delete_messages', label: 'Delete user messages', desc: 'Delete all messages posted by this user.' },
          { id: 'suspend', label: 'Suspend account', desc: 'Temporarily or permanently suspend user.' },
          { id: 'delete_account', label: 'Delete account permanently', desc: 'Delete account and ban IP & device.' }
        ];

        let selectedAction = 'dismiss';
        const actionList = h('div', { class: 'stack', style: 'gap:8px;' });

        const suspendOptions = h('div', { class: 'stack', style: 'display:none;padding:12px;background:var(--color-surface);border:1px solid var(--color-line-2);border-radius:var(--radius-md);margin-top:6px;gap:10px;' });
        const suspendDays = selectEl([
          ['1', '1 Day'],
          ['7', '7 Days'],
          ['30', '30 Days'],
          ['0', 'Permanent Ban']
        ], '7', 'Suspension duration');
        const delMsgCheck = h('input', { type: 'checkbox', checked: true });
        const banIpCheck = h('input', { type: 'checkbox', checked: true });

        suspendOptions.append(
          h('div', { class: 'field' }, h('label', { class: 'label', text: 'Suspension duration' }), suspendDays),
          h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;' }, delMsgCheck, 'Delete all messages posted by user'),
          h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;' }, banIpCheck, 'Ban IP and Device ID (prevent troll alt accounts)')
        );

        const noteInput = h('textarea', { class: 'input', rows: 2, placeholder: 'Optional reason or note for audit log...', style: 'width:100%;resize:vertical;' });

        actionRadios.forEach((act, idx) => {
          const radio = h('input', { type: 'radio', name: 'report_action', value: act.id, checked: idx === 0 });
          const row = h('label', { style: 'display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border:1px solid var(--color-line-2);border-radius:var(--radius-md);cursor:pointer;' },
            radio,
            h('div',
              h('strong', { style: 'display:block;font-size:14px;', text: act.label }),
              h('span', { class: 'muted small', text: act.desc })
            )
          );
          radio.addEventListener('change', () => {
            selectedAction = act.id;
            suspendOptions.style.display = selectedAction === 'suspend' ? 'flex' : 'none';
          });
          actionList.append(row);
        });

        const submitBtn = btn('Apply Action & Resolve', { cls: 'primary' });
        submitBtn.addEventListener('click', () => busy(submitBtn, async () => {
          const payload = {
            action: selectedAction,
            note: noteInput.value.trim(),
            suspendDays: selectedAction === 'suspend' ? parseInt(suspendDays.value, 10) : null,
            deleteMessages: selectedAction === 'suspend' ? delMsgCheck.checked : selectedAction === 'delete_messages',
            banIpAndDevice: selectedAction === 'suspend' ? banIpCheck.checked : selectedAction === 'delete_account'
          };
          await api('POST', `/api/admin/reports/${enc(rep.id)}/resolve`, payload);
          rep.status = 'resolved';
          toast(`Report resolved (${selectedAction})`);
          close();
          paint();
        }));

        const modalBody = h('div', { class: 'stack', style: 'gap:14px;' },
          h('p', { class: 'muted small', text: `Choose moderation action to take on ${targetName} for: "${rep.reason || 'Report'}"` }),
          actionList,
          suspendOptions,
          h('div', { class: 'field' },
            h('label', { class: 'label', text: 'Resolution Note / Reason' }),
            noteInput
          ),
          h('div', { class: 'sheet-actions', style: 'display:flex;justify-content:flex-end;gap:8px;' },
            h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Cancel'),
            submitBtn
          )
        );

        close = openSheet(`Resolve Report: ${targetName}`, modalBody);
      }
      const resolve = btn('Resolve', { cls: 'small', icon: 'check' });
      resolve.addEventListener('click', () => openResolveModal(r));
      const where = r.groupName ? 'in ' + T(r.groupName) : r.messageKind === 'd' ? 'in a direct message' : '';
      return h('article', { class: 'card report' + (done ? ' done' : ''), 'data-key': 'r' + r.id, style: 'padding:16px;display:flex;flex-direction:column;gap:10px' },
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
          h('span', { class: 'chip ' + (done ? '' : 'accent'), text: done ? 'Resolved' : 'Pending' }), h('span', { class: 'chip', text: REASON[T(r.reason)] || T(r.reason) || 'Report' }),
          h('span', { class: 'muted small', style: 'margin-left:auto', text: when(r.at) })),
        h('div', { class: 'small' }, who(r.reporterName, r.reporterId), ' reported ', who(r.reportedName, r.reportedUserId), where ? ' ' + where : ''),
        r.snippet ? h('blockquote', { class: 'quote-block', style: 'margin:0;padding:8px 12px;border-left:3px solid var(--color-border);color:var(--color-text-2);overflow-wrap:anywhere', text: T(r.snippet) }) : null,
        r.details ? h('p', { class: 'muted small', style: 'overflow-wrap:anywhere', text: 'Note: ' + T(r.details) }) : null,
        done ? null : h('div', { class: 'row', style: 'gap:8px;justify-content:flex-end;flex-wrap:wrap' },
          r.reportedUserId ? btn('View profile', { cls: 'small ghost', onclick: () => openProfile(r.reportedUserId) }) : null, resolve));
    }
    function paint() {
      const shown = rows.filter(r => showAll || r.status === 'pending');
      const pending = rows.filter(r => r.status === 'pending').length;
      head.firstChild.textContent = pending ? `Reports (${pending} pending)` : 'Reports';
      list.replaceChildren(...(shown.length ? shown.map(card) : [emptyState(showAll ? 'No reports yet' : 'No pending reports', 'Reports from the message menu show up here.')]));
    }
    paint();
    body.replaceChildren(head, list);
  }

  function searchTab(placeholder, load, dead) {
    const q = h('input', { class: 'input', type: 'search', placeholder, 'aria-label': placeholder, autocomplete: 'off', maxlength: 40 });
    const list = h('div', { class: 'stack', style: 'gap:8px' });
    let timer = 0, n = 0;
    const refresh = async () => { const my = ++n; try { const rows = await load(q.value.trim()); if (my === n && !dead()) paint(rows); } catch (e) { if (my === n) toast(e.message, 'error'); } };
    let paint = () => {};
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });
    return { q, list, refresh, setPaint(fn) { paint = fn; } };
  }

  
  async function appealsTab(dead) {
    let rows = await api('GET', '/api/admin/appeals'); if (dead()) return;
    const list = h('div', { class: 'stack', style: 'gap:10px' });
    const head = h('div', { class: 'row', style: 'align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('div', { class: 'section-title', text: tr('Ban Appeals') })
    );

    function appealCard(a) {
      const isPending = a.status === 'pending';
      const approveBtn = btn(tr('Unban & Approve'), { cls: 'small', icon: 'check' });
      const rejectBtn = btn(tr('Reject'), { cls: 'small ghost', icon: 'x' });

      approveBtn.onclick = () => busy(approveBtn, async () => {
        await api('POST', `/api/admin/appeals/${a.id}/action`, { action: 'approve' });
        toast(tr('User unbanned and appeal approved.'));
        draw();
      });

      rejectBtn.onclick = () => busy(rejectBtn, async () => {
        await api('POST', `/api/admin/appeals/${a.id}/action`, { action: 'reject' });
        toast(tr('Appeal rejected.'));
        draw();
      });

      const actions = isPending ? h('div', { class: 'row', style: 'gap:6px' }, approveBtn, rejectBtn)
        : h('span', { class: `chip ${a.status === 'approved' ? 'accent' : 'muted'}`, text: a.status === 'approved' ? tr('Approved & Unbanned') : tr('Rejected') });

      return h('div', { class: 'card', style: 'padding:14px 18px;display:flex;flex-direction:column;gap:10px;' },
        h('div', { class: 'row', style: 'align-items:center;justify-content:space-between;' },
          h('div', { class: 'row', style: 'align-items:center;gap:8px;' },
            h('b', { text: '@' + (a.username || 'unknown') }),
            a.banReason ? h('span', { class: 'muted small', text: tr('Banned for: {0}', a.banReason) }) : null
          ),
          h('span', { class: 'muted small', text: when(a.createdAt) })
        ),
        h('div', { class: 'appeal-msg', style: 'background:rgba(255,255,255,0.04);padding:10px 12px;border-radius:6px;font-size:13px;line-height:1.4;', text: a.message }),
        h('div', { style: 'display:flex;justify-content:flex-end;margin-top:4px;' }, actions)
      );
    }

    if (!rows.length) {
      list.replaceChildren(emptyState(tr('No ban appeals'), tr('There are no pending or past appeals right now.')));
    } else {
      list.replaceChildren(...rows.map(appealCard));
    }
    body.replaceChildren(head, list);
  }

  async function usersTab(dead) {
    let flaggedOnly = false;   // "Flagged names": accounts whose name the troll-name filter would refuse today
    const t = searchTab('Search users by username', (q) => api('GET', '/api/admin/users' + qs({ q, flagged: flaggedOnly ? 'true' : '' })), dead);
    const flagChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', style: 'flex:none', title: 'Show accounts whose name would not be allowed today' }, 'Flagged names');
    flagChip.addEventListener('click', () => { flaggedOnly = !flaggedOnly; flagChip.setAttribute('aria-pressed', String(flaggedOnly)); t.refresh(); });
    const act = (label, cls, fn) => { const b = btn(label, { cls: 'small ' + cls }); b.addEventListener('click', () => Promise.resolve(fn()).catch(e => toast(e.message, 'error'))); return b; };
    t.setPaint((rows) => {
      TWM.flip(t.list, '.arow', () => t.list.replaceChildren(...(rows.length ? rows.map(u => {
        const self = u.id === S.me.id;
        const acts = [];
        if (!self && !u.isAdmin && window.TWAdmin) acts.push(act('Edit', 'ghost', () => TWAdmin.editUser(u, () => t.refresh())));
        if (!self && !u.isAdmin) acts.push(u.banned
          ? act('Unsuspend', 'ghost', async () => { await api('POST', `/api/admin/users/${u.id}/ban`, { banned: false }); toast('Unsuspended ' + u.username); t.refresh(); })
          : act('Suspend', 'ghost', () => {
              const why = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'Reason (shown to them)', 'aria-label': 'Reason' });
              confirmSheet('Suspend ' + u.username + '?', 'They’ll be signed out and unable to log in until you unsuspend them.', 'Suspend',
                async () => { await api('POST', `/api/admin/users/${u.id}/ban`, { banned: true, reason: why.value.trim() }); toast('Suspended ' + u.username); t.refresh(); }, why);
            }));
        if (!self) acts.push(act(u.isAdmin ? 'Remove admin' : 'Make admin', 'ghost', () => confirmSheet(u.isAdmin ? 'Remove admin?' : 'Make admin?',
          u.isAdmin ? u.username + ' will lose access to this panel.' : u.username + ' will be able to manage every user, group and site setting.',
          u.isAdmin ? 'Remove admin' : 'Make admin', async () => { await api('POST', `/api/admin/users/${u.id}/role`, { isAdmin: !u.isAdmin }); toast('Updated ' + u.username); t.refresh(); })));
        if (!self && !u.isAdmin) acts.push(act('Delete', 'danger', () => confirmSheet('Delete ' + u.username + '?',
          'This permanently removes the account, their messages, friendships and avatar. Groups left empty are deleted too. This can’t be undone.', 'Delete account',
          async () => { await api('DELETE', `/api/admin/users/${u.id}`); toast('Deleted ' + u.username); t.refresh(); })));
        return h('div', { class: 'arow', 'data-key': 'u' + u.id },
          avatar(u, 'md'),
          h('div', { class: 'meta' }, h('b', { text: nm(u) }, u.displayName ? h('small', { class: 'handle', text: ' @' + T(u.username) }) : null),
            h('span', { class: 'muted small', text: `${u.groups} group${u.groups === 1 ? '' : 's'} · joined ${when(u.created)}${u.banned && u.banReason ? ' · ' + T(u.banReason) : ''}` })),
          h('div', { class: 'badges' }, u.isAdmin ? h('span', { class: 'chip accent', text: 'Admin' }) : null, u.banned ? h('span', { class: 'chip bad', text: 'Suspended' }) : null, self ? h('span', { class: 'chip', text: 'You' }) : null),
          h('div', { class: 'act' }, acts));
      }) : [emptyState('No users found', 'Try a different name.')])));
    });
    body.replaceChildren(h('div', { class: 'row', style: 'gap:8px;flex:none;align-items:center' }, t.q, flagChip), t.list); t.refresh();
  }

  async function groupsTab(dead) {
    const t = searchTab('Search groups by name or game', (q) => api('GET', '/api/admin/groups' + qs({ q })), dead);
    t.setPaint((rows) => {
      TWM.flip(t.list, '.arow', () => t.list.replaceChildren(...(rows.length ? rows.map(g => {
        const del = btn('Delete', { cls: 'small danger' });
        del.addEventListener('click', () => confirmSheet('Delete ' + T(g.name) + '?', 'The group, its chat and all invites to it are removed for everyone. This can’t be undone.', 'Delete group',
          async () => { await api('DELETE', `/api/admin/groups/${g.id}`); S.feedCache = null; refreshMine(); toast('Deleted ' + T(g.name)); t.refresh(); }));
        return h('div', { class: 'arow', 'data-key': 'g' + g.id },
          h('div', { class: 'meta' }, h('b', { text: T(g.name) }), h('span', { class: 'muted small', text: `${T(g.game)} · ${g.mode} · ${T(g.region)} · ${g.memberCount} member${g.memberCount === 1 ? '' : 's'} · ${when(g.created)}` })),
          h('div', { class: 'act' }, h('a', { class: 'btn small ghost', href: '#/group/' + g.id }, 'Open'),
            window.TWAdmin ? btn('Rename', { cls: 'small ghost', onclick: () => TWAdmin.renameGroup(g, () => t.refresh()) }) : null, del));
      }) : [emptyState('No groups found', 'Try a different name or game.')])));
    });
    body.replaceChildren(t.q, t.list); t.refresh();
  }
}

/* ================= game detection (desktop app) ================= */
/* The desktop shell reports the game it sees running; we mirror it into "Playing …" and clear it when the game closes. */
const AUTO = { detected: null, applied: null };
const autoOn = () => { try { return localStorage.getItem('tw_autogame') !== 'off'; } catch { return true; } };
async function applyAutoGame() {
  if (!window.__TW_DESKTOP || !S.me || !S.me.onboarded) return;
  const want = autoOn() ? AUTO.detected : null, cur = T(S.me.playing || '');
  try {
    if (want && cur !== want) { S.me = await api('PUT', '/api/me/playing', { playing: want }); AUTO.applied = want; renderUserPanel(); toast('Now playing ' + want); }
    else if (!want && AUTO.applied && cur === AUTO.applied) { S.me = await api('PUT', '/api/me/playing', { playing: '' }); AUTO.applied = null; renderUserPanel(); }
    else if (!want) AUTO.applied = null;
  } catch { /* try again on the next detection tick */ }
}
window.TWApp = { game(name) { AUTO.detected = typeof name === 'string' && name ? name : null; applyAutoGame(); } };
addEventListener('pagehide', () => {
  if (AUTO.applied && S.me) fetch('/api/me/playing', { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'X-TW': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ playing: '' }) }).catch(() => {});
});

function switchEl(on, onChange, label) {
  const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label }, h('span', { class: 'knob' }));
  b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); });
  return b;
}

/* ================= create group ================= */
function openCreate() {
  const name = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Sunday Ranked Squad' });
  const game = gamePicker({ multi: false, value: '', placeholder: 'Choose or search a game...' });
  const mode = selectEl([['casual', 'Casual'], ['competitive', 'Competitive']], 'casual');
  const region = selectEl(S.meta.regions, S.me.region || '', 'Choose a region');
  // Age separation: under-18s create groups for 13-17, adults for 18-99 (unless an admin switched the separation off).
  const sep = S.site.ageSeparation !== false, minor = S.me.age > 0 && S.me.age < 18;
  const lo = !sep || minor ? 13 : 18, hi = !sep ? 99 : minor ? 17 : 99;
  const amin = h('input', { class: 'input', type: 'number', min: lo, max: hi, placeholder: String(lo), 'aria-label': 'Minimum age' });
  const amax = h('input', { class: 'input', type: 'number', min: lo, max: hi, placeholder: String(hi), 'aria-label': 'Maximum age' });
  const clamp = (el) => el.addEventListener('change', () => { const v = parseInt(el.value, 10); if (!isNaN(v)) el.value = Math.min(hi, Math.max(lo, v)); });
  clamp(amin); clamp(amax);
  const privacy = selectEl([['public', 'Public: anyone can join'], ['request', 'Request to join: you approve people'], ['private', 'Private: invite only, not listed']], 'public');
  const desc = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'What’s the vibe? When do you play?' });
  const fn = field('Group name', name), fg = field('Game', game), fm = field('Play style', mode), fr = field('Region', region), fd = field('Description', desc), fpr = field('Who can join', privacy);
  const lim = window.TWG ? TWG.limitFields({}) : null;   // max members + slowmode (groups.js)
  const audience = h('p', { class: 'muted small audience-note', text: !sep ? 'Open to ages 13–99.' : minor ? 'This group will be for ages 13–17 only. Adults can’t see it.' : 'This group will be for ages 18+ only. Under-18s can’t see it.' });
  const err = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Create group');
  const form = h('form', { class: 'stack', style: 'gap:12px', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const a = parseInt(amin.value, 10) || lo, b = parseInt(amax.value, 10) || hi;
    const ok = [fn.setError(name.value.trim().length >= 3 ? '' : 'Give it a name (3+ characters)'), fg.setError(game.value ? '' : 'Choose a game'), fr.setError(region.value ? '' : 'Choose a region')].every(Boolean);
    if (a < lo || b > hi || a > b) { err.textContent = `Age range must be between ${lo} and ${hi}, with min below max.`; return; }
    if (!ok) return;
    submit.disabled = true; submit.classList.add('loading');
    try {
      const r = await api('POST', '/api/groups', { name: name.value.trim(), game: game.value, mode: mode.value, region: region.value, ageMin: a, ageMax: b, description: desc.value.trim(), privacy: privacy.value, ...(lim ? lim.values() : {}) });
      await refreshMine(); close(); go('#/group/' + enc(r.id || (r.group && r.group.id))); toast('Group created');
    } catch (ex) { err.textContent = T(ex.message); } finally { submit.disabled = false; submit.classList.remove('loading'); }
  } }, fn, fg, h('div', { class: 'row' }, fm, fr), h('div', { class: 'field' }, h('span', { class: 'label', text: 'Age range' }), h('div', { class: 'row' }, amin, amax), audience), fpr, lim ? lim.el : null, fd, err, submit);
  const close = openSheet('Create a group', form);
}

/* ================= friends & invites ================= */
async function friendsView(_, tok) {
  const me = S.me;
  const addInput = h('input', { class: 'input', type: 'text', maxlength: 20, placeholder: 'Friend’s username', autocapitalize: 'none', spellcheck: 'false' });
  const fa = field('Add a friend', addInput);
  const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Send request');
  const addForm = h('form', { class: 'row', style: 'align-items:flex-start', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); const u = addInput.value.trim();
    if (!fa.setError(USER_RE.test(u) ? '' : 'Enter a valid username')) return;
    await busy(addBtn, async () => { await api('POST', '/api/friends/request', { username: u }); addInput.value = ''; toast('Friend request sent'); await loadSocial(); });
  } }, fa, h('div', { style: 'padding-top:22px;flex:none' }, addBtn));
  addForm.style.flex = 'none';
  const invBox = h('div', { class: 'section' }), reqBox = h('div', { class: 'section' }), friendBox = h('div', { class: 'section mobile-only' }), groupBox = h('div', { class: 'section mobile-only' });
  const profile = h('div', { class: 'card profile-card mobile-only', style: 'display:flex' }, avatar(me, 'lg'),
    h('div', { class: 'meta' }, h('b', { text: nm(me) }), h('span', { class: 'muted', text: me.playing ? 'Playing ' + T(me.playing) : STATUS[statusKey(me.status)] })),
    h('a', { class: 'btn ghost small', href: '#/settings' }, icon('gear', 16), 'Settings'));
  function draw() {
    const stackOf = (arr) => stagger(h('div', { class: 'stack', style: 'gap:8px' }, arr));
    invBox.replaceChildren(...(S.invites.length ? [h('div', { class: 'section-title', text: `Group invites — ${S.invites.length}` }), stackOf(S.invites.map(inv => {
      const a = btn('Join', { cls: 'small' }), d = btn('Decline', { cls: 'small ghost' });
      a.addEventListener('click', () => busy(a, async () => { await api('POST', `/api/invites/${enc(inv.id)}/accept`); toast('Joined ' + T(inv.group && inv.group.name)); await Promise.all([loadSocial(), refreshMine()]); }));
      d.addEventListener('click', () => busy(d, async () => { await api('POST', `/api/invites/${enc(inv.id)}/decline`); await loadSocial(); }));
      const gg = inv.group || {};
      return h('div', { class: 'frow big' }, h('div', { class: 'meta' }, h('b', { text: T(gg.name) }), h('span', { text: `${T(gg.game || '')}${gg.game ? ' · ' : ''}invited by ${inv.from && typeof inv.from === 'object' ? nm(inv.from) : T(inv.from)}` })), h('div', { class: 'act' }, a, d));
    }))] : []));
    const inc = S.reqs.incoming || [], out = S.reqs.outgoing || [];
    reqBox.replaceChildren(...(inc.length || out.length ? [h('div', { class: 'section-title', text: 'Friend requests' }), stackOf([
      ...inc.map(r => {
        const a = btn('Accept', { cls: 'small' }), d = btn('Decline', { cls: 'small ghost' });
        a.addEventListener('click', () => busy(a, async () => { await api('POST', `/api/friends/requests/${enc(r.id)}/accept`); toast('You’re now friends'); await loadSocial(); }));
        d.addEventListener('click', () => busy(d, async () => { await api('POST', `/api/friends/requests/${enc(r.id)}/decline`); await loadSocial(); }));
        return personRow(r.from || {}, { big: true, action: [a, d] });
      }),
      ...out.map(r => personRow(r.to || r.from || { username: r.username || 'Pending' }, { big: true, action: h('span', { class: 'chip', text: 'Pending' }) }))])] : []));
    friendBox.replaceChildren(h('div', { class: 'section-title', text: `Friends — ${S.friends.length}` }), S.friends.length ? stackOf(S.friends.map(f => personRow(f, { big: true, href: '#/dm/' + enc(f.id) }))) : emptyState('No friends yet', 'Send a request above or find people in Search.'));
    groupBox.replaceChildren(h('div', { class: 'section-title' }, 'My groups', h('button', { class: 'btn small ghost', type: 'button', onclick: openCreate }, 'New')),
      S.mine.length ? stackOf(S.mine.map(g => { const t = groupTile(g);
        return h('a', { class: 'frow big', href: '#/group/' + enc(g.id) }, t, h('div', { class: 'meta' }, h('b', { text: T(g.name) }), h('span', { text: T(g.game) }))); })) : emptyState('No groups yet', 'Join one from the feed.'));
  }
  const peopleSlot = h('div', { class: 'rec-slot' });   // "People you may like" (profile.js)
  show(h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: tr('Friends & invites') }), h('p', { class: 'muted', text: tr('Requests, group invites and the people you play with.') }))), profile, invBox, reqBox, addForm, peopleSlot, friendBox, groupBox));
  if (window.TWProfile) TWProfile.peopleRecs(peopleSlot, () => stale(tok));
  S.onData = draw; draw();
  await loadSocial(); if (stale(tok)) S.onData = null;
}

/* ================= settings ================= */

async function sendBanner(blob) {
  let r;
  try {
    r = await fetch('/api/me/banner', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-TW': '1', 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob
    });
  } catch {
    throw new Error(tr('Cannot reach the server. Check your connection.'));
  }
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `Upload failed (${r.status}).`);
  return data;
}

async function cropImage(file, opts = {}) {
  if (!file) return null;
  const aspect = opts.aspect || 1;
  const shape = opts.shape || 'circle';
  const outW = opts.outWidth || 512;
  const outH = opts.outHeight || Math.round(outW / aspect);
  const title = opts.title || tr('Crop image');

  // Read image via FileReader (data: URL) to bypass any CSP / blob restrictions
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(tr('That image could not be read.')));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(tr('That image could not be read.')));
    img.src = dataUrl;
  });

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  if (!origW || !origH) {
    throw new Error(tr('That image could not be read.'));
  }

  return new Promise((resolve) => {
    let closed = false;
    let closeSheet = () => {};

    const stage = h('div', { class: 'cropper-stage' });
    const imgEl = h('img', { class: 'cropper-img', src: dataUrl, draggable: 'false', alt: '' });

    const gridEl = h('div', { class: 'cropper-grid' },
      h('div', {}), h('div', {}), h('div', {}),
      h('div', {}), h('div', {}), h('div', {}),
      h('div', {}), h('div', {}), h('div', {})
    );

    const hNW = h('div', { class: 'cropper-handle nw' });
    const hNE = h('div', { class: 'cropper-handle ne' });
    const hSE = h('div', { class: 'cropper-handle se' });
    const hSW = h('div', { class: 'cropper-handle sw' });

    const bannerBadge = (aspect > 1) ? h('span', { class: 'cropper-banner-badge', text: tr('Banner') }) : null;

    const boxEl = h('div', { class: 'cropper-box' + (shape === 'circle' ? ' circle-guide' : '') },
      gridEl, bannerBadge, hNW, hNE, hSE, hSW
    );
    stage.append(imgEl, boxEl);

    let zoom = 1;
    const zoomInput = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', style: 'flex:1;' });
    const zoomResetBtn = btn(tr('Center'), { cls: 'small ghost', onclick: () => resetCrop() });
    const controls = h('div', { class: 'cropper-controls' },
      icon('search', 14),
      h('span', { class: 'small muted', text: '1x' }),
      zoomInput,
      h('span', { class: 'small muted', text: '4x' }),
      zoomResetBtn
    );

    const previewCanvas = h('canvas', { width: shape === 'circle' ? 44 : 120, height: shape === 'circle' ? 44 : 40 });
    const previewContainer = h('div', { class: shape === 'circle' ? 'cropper-thumb-circle' : 'cropper-thumb-rect' }, previewCanvas);
    const pctx = previewCanvas.getContext('2d');

    const isGif = file.type === 'image/gif';
    const applyBtn = btn(tr('Apply'), { cls: 'primary', onclick: async () => {
      busy(applyBtn, async () => {
        const blob = await exportCrop();
        cleanup();
        closeSheet();
        resolve(blob);
      });
    }});

    const previewRow = h('div', { class: 'cropper-preview-row' },
      h('div', { class: 'cropper-preview-box' },
        previewContainer,
        h('div', { class: 'stack', style: 'gap:2px;' },
          h('span', { class: 'small', style: 'font-weight:600;', text: tr('Preview') }),
          h('span', { class: 'small muted', text: isGif ? tr('Animation preserved on save') : tr('Drag anywhere to move • scroll to zoom') })
        )
      ),
      h('div', { class: 'row', style: 'gap:8px;' },
        btn(tr('Cancel'), { cls: 'ghost', onclick: () => { cleanup(); resolve(null); closeSheet(); } }),
        isGif ? btn(tr('Keep original'), { cls: 'outline', onclick: () => { cleanup(); resolve(file); closeSheet(); } }) : null,
        applyBtn
      )
    );

    const body = h('div', { class: 'cropper-modal' },
      stage,
      controls,
      previewRow
    );

    closeSheet = openSheet(title, body, { cls: 'cropper-sheet' });

    let ro = null;
    function cleanup() {
      if (closed) return;
      closed = true;
      if (ro) { ro.disconnect(); ro = null; }
    }

    let stW = 540, stH = 340;
    let fitScale = 1, curScale = 1;
    let dispW = 0, dispH = 0;
    let imgX = 0, imgY = 0;
    let boxX = 0, boxY = 0, boxW = 0, boxH = 0;

    function initGeometry() {
      const w = stage.clientWidth || 540;
      const h = stage.clientHeight || 340;
      stW = w;
      stH = h;

      // 1. Calculate Crop Box in the center of the stage
      if (aspect > 1) {
        boxW = Math.round(Math.min(stW - 32, (stH - 40) * aspect));
        boxH = Math.round(boxW / aspect);
      } else {
        const maxSz = Math.min(stW - 32, stH - 32, 260);
        boxW = Math.round(maxSz);
        boxH = Math.round(boxW / aspect);
      }
      boxX = Math.round((stW - boxW) / 2);
      boxY = Math.round((stH - boxH) / 2);

      // 2. Automatically scale up to the GIF/image so it fully COVERS the crop box
      fitScale = Math.max(boxW / origW, boxH / origH);
      curScale = fitScale * zoom;
      dispW = Math.round(origW * curScale);
      dispH = Math.round(origH * curScale);

      // 3. Center image behind crop box
      imgX = Math.round(boxX + (boxW - dispW) / 2);
      imgY = Math.round(boxY + (boxH - dispH) / 2);

      clampImage();
      paint();
    }

    function clampImage() {
      if (dispW >= boxW) {
        if (imgX > boxX) imgX = boxX;
        if (imgX + dispW < boxX + boxW) imgX = boxX + boxW - dispW;
      } else {
        imgX = Math.round(boxX + (boxW - dispW) / 2);
      }
      if (dispH >= boxH) {
        if (imgY > boxY) imgY = boxY;
        if (imgY + dispH < boxY + boxH) imgY = boxY + boxH - dispH;
      } else {
        imgY = Math.round(boxY + (boxH - dispH) / 2);
      }
    }

    function resetCrop() {
      zoom = 1;
      zoomInput.value = '1';
      initGeometry();
    }

    function applyZoom(newZoom) {
      newZoom = Math.max(1, Math.min(4, newZoom));
      const centerRelX = (boxX + boxW / 2 - imgX) / curScale;
      const centerRelY = (boxY + boxH / 2 - imgY) / curScale;

      zoom = newZoom;
      curScale = fitScale * zoom;
      dispW = Math.round(origW * curScale);
      dispH = Math.round(origH * curScale);

      imgX = Math.round(boxX + boxW / 2 - centerRelX * curScale);
      imgY = Math.round(boxY + boxH / 2 - centerRelY * curScale);

      clampImage();
      paint();
    }

    function paint() {
      imgEl.style.width = Math.round(dispW) + 'px';
      imgEl.style.height = Math.round(dispH) + 'px';
      imgEl.style.left = Math.round(imgX) + 'px';
      imgEl.style.top = Math.round(imgY) + 'px';

      boxEl.style.width = Math.round(boxW) + 'px';
      boxEl.style.height = Math.round(boxH) + 'px';
      boxEl.style.left = Math.round(boxX) + 'px';
      boxEl.style.top = Math.round(boxY) + 'px';

      drawPreview();
    }

    function drawPreview() {
      if (!pctx) return;
      pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      const sX = (boxX - imgX) / curScale;
      const sY = (boxY - imgY) / curScale;
      const sW = boxW / curScale;
      const sH = boxH / curScale;
      pctx.drawImage(img, Math.max(0, sX), Math.max(0, sY), Math.min(origW, sW), Math.min(origH, sH), 0, 0, previewCanvas.width, previewCanvas.height);
    }

    async function exportCrop() {
      const sX = Math.round(Math.max(0, (boxX - imgX) / curScale));
      const sY = Math.round(Math.max(0, (boxY - imgY) / curScale));
      const sW = Math.round(Math.min(origW - sX, boxW / curScale));
      const sH = Math.round(Math.min(origH - sY, boxH / curScale));

      if (isGif) {
        const url = `/api/media/crop-gif?x=${sX}&y=${sY}&w=${sW}&h=${sH}`;
        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-TW': '1', 'Content-Type': 'image/gif' },
          body: file
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(errText || 'GIF crop failed');
        }
        return await resp.blob();
      }

      const cv = document.createElement('canvas');
      cv.width = outW;
      cv.height = outH;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sX, sY, sW, sH, 0, 0, outW, outH);
      const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.92)) || await new Promise(r => cv.toBlob(r, 'image/png'));
      if (!blob || blob.size > 5 * 1024 * 1024) throw new Error(tr('Image must be 5 MB or smaller.'));
      return blob;
    }

    zoomInput.addEventListener('input', () => {
      applyZoom(parseFloat(zoomInput.value));
    });

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      const newZoom = Math.max(1, Math.min(4, zoom + delta));
      if (newZoom !== zoom) {
        zoomInput.value = newZoom.toFixed(2);
        applyZoom(newZoom);
      }
    }, { passive: false });

    let dragMode = null;
    let startX = 0, startY = 0;
    let startImgX = 0, startImgY = 0;
    let startBoxX = 0, startBoxY = 0, startBoxW = 0, startBoxH = 0;

    stage.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.cropper-handle');
      if (handle) {
        if (handle.classList.contains('nw')) dragMode = 'nw';
        else if (handle.classList.contains('ne')) dragMode = 'ne';
        else if (handle.classList.contains('se')) dragMode = 'se';
        else if (handle.classList.contains('sw')) dragMode = 'sw';
      } else {
        dragMode = 'pan';
      }
      startX = e.clientX;
      startY = e.clientY;
      startImgX = imgX;
      startImgY = imgY;
      startBoxX = boxX;
      startBoxY = boxY;
      startBoxW = boxW;
      startBoxH = boxH;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('grabbing');
      e.preventDefault();
    });

    stage.addEventListener('pointermove', (e) => {
      if (!dragMode) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (dragMode === 'pan') {
        imgX = startImgX + dx;
        imgY = startImgY + dy;
        clampImage();
      } else if (dragMode === 'se') {
        const d = Math.max(dx, dy * aspect);
        const nw = Math.max(64, Math.min(startBoxW + d, (imgX + dispW) - startBoxX, ((imgY + dispH) - startBoxY) * aspect));
        boxW = Math.round(nw);
        boxH = Math.round(nw / aspect);
        clampImage();
      } else if (dragMode === 'sw') {
        const d = Math.max(-dx, dy * aspect);
        const nw = Math.max(64, Math.min(startBoxW + d, (startBoxX + startBoxW) - imgX, ((imgY + dispH) - startBoxY) * aspect));
        boxW = Math.round(nw);
        boxH = Math.round(nw / aspect);
        boxX = Math.round(startBoxX + startBoxW - boxW);
        clampImage();
      } else if (dragMode === 'ne') {
        const d = Math.max(dx, -dy * aspect);
        const nw = Math.max(64, Math.min(startBoxW + d, (imgX + dispW) - startBoxX, (startBoxY + startBoxH - imgY) * aspect));
        boxW = Math.round(nw);
        boxH = Math.round(nw / aspect);
        boxY = Math.round(startBoxY + startBoxH - boxH);
        clampImage();
      } else if (dragMode === 'nw') {
        const d = Math.max(-dx, -dy * aspect);
        const nw = Math.max(64, Math.min(startBoxW + d, (startBoxX + startBoxW) - imgX, (startBoxY + startBoxH - imgY) * aspect));
        boxW = Math.round(nw);
        boxH = Math.round(nw / aspect);
        boxX = Math.round(startBoxX + startBoxW - boxW);
        boxY = Math.round(startBoxY + startBoxH - boxH);
        clampImage();
      }
      paint();
    });

    const onPointerUp = (e) => {
      if (dragMode) {
        dragMode = null;
        stage.classList.remove('grabbing');
        try { stage.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);

    // Initial calculation & observer
    initGeometry();
    ro = new ResizeObserver(() => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w >= 100 && h >= 100 && (Math.abs(w - stW) > 4 || Math.abs(h - stH) > 4)) {
        stW = w;
        stH = h;
        initGeometry();
      }
    });
    ro.observe(stage);
    setTimeout(() => initGeometry(), 60);
    setTimeout(() => initGeometry(), 350);
  });
}

const MAX_AVATAR = 5 * 1024 * 1024;
/* GIFs are sent untouched so they stay animated; other images are centre-cropped and shrunk first. */
async function prepAvatar(file) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG, GIF or WebP image.');
  if (file.type === 'image/gif') {
    if (file.size > MAX_AVATAR) throw new Error('GIFs must be 5 MB or smaller.');
    return file;
  }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('That image could not be read.'); }
  const side = Math.min(bmp.width, bmp.height), size = Math.min(512, side);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  cv.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close && bmp.close();
  const blob = await new Promise(r => cv.toBlob(r, 'image/webp', .9)) || await new Promise(r => cv.toBlob(r, 'image/png'));
  if (!blob || blob.size > MAX_AVATAR) throw new Error('Image must be 5 MB or smaller.');
  return blob;
}
async function sendAvatar(blob) {
  let r;
  try { r = await fetch('/api/me/avatar', { method: 'POST', credentials: 'same-origin', headers: { 'X-TW': '1', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }); }
  catch { throw new Error('Cannot reach the server. Check your connection.'); }
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `Upload failed (${r.status}).`);
  return data;
}

/* The Settings page lives in js/settings.js (left sidebar of tabs). `tab` comes from #/settings/<tab>. */
async function settingsView(tab) {
  if (window.TWSettings) return TWSettings.view(tab);
  show(h('div', { class: 'page' }, emptyState(tr('That didn’t load'), tr('Please try again.'))));
}

/* ================= data + polling ================= */
async function refreshMine() { S.mine = await api('GET', '/api/groups/mine'); renderRail(); }
function update(key, val) {
  const s = JSON.stringify(val); if (S.sig[key] === s) return false; S.sig[key] = s; return true;
}
async function loadSocial() {
  const [f, i, r] = await Promise.all([api('GET', '/api/friends'), api('GET', '/api/invites'), api('GET', '/api/friends/requests')]);
  applySocial(f, i, r, true);
}
function applySocial(f, i, r, forced) {
  const cf = update('f', f), ci = update('i', i), cr = update('r', r);
  S.friends = f; S.invites = i; S.reqs = { incoming: r.incoming || [], outgoing: r.outgoing || [] };
  if (cf || forced) renderFriends();
  if (ci || cr || forced) { renderBadge(); if (S.onData) S.onData(); }
}
/* ---- site status: maintenance mode + closed pages (set by admins) ---- */
function showMaintenance() {
  S.maint = true; clearTimers();
  document.title = 'Third Wheel — maintenance';
  $('#app').replaceChildren(h('main', { class: 'center-screen' }, h('div', { class: 'card auth-card maint' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Third Wheel'),
    h('h1', { text: 'Down for maintenance', style: 'margin-top:20px' }),
    h('p', { class: 'muted', style: 'margin-top:8px', text: T(S.site.maintenance.message) }),
    h('p', { class: 'muted small', style: 'margin:12px 0 20px', text: 'You’ll be brought back automatically when it’s over.' }),
    btn('Log out', { cls: 'ghost', onclick: async () => { try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ } loggedOut(); } }))));
}
function applySite() {
  const down = S.site.maintenance.on && S.me && !S.me.isAdmin;
  if (down && !S.maint) showMaintenance();
  else if (!down && S.maint) { S.maint = false; start(); }
  else if (!down && S.el.view) {
    const sig = JSON.stringify(S.site.closed);
    if (sig !== S.closedSig) { S.closedSig = sig; route(); }
  }
}
async function loadSite() {
  try { S.site = await api('GET', '/api/site'); applySite(); } catch { /* keep the last known state */ }
}

async function poll() {
  if (!S.me || document.hidden) return;
  S.tick++;
  if (S.tick % 3 === 0 || S.maint) await loadSite();
  if (S.maint) return;
  try {
    const [f, i, r, m] = await Promise.all([api('GET', '/api/friends'), api('GET', '/api/invites'), api('GET', '/api/friends/requests'), api('GET', '/api/groups/mine')]);
    applySocial(f, i, r, false);
    if (m && update('m', m)) { S.mine = m; renderRail(); }
  } catch { /* transient */ }
}
function loggedOut() {
  S.maint = false; S.feedCache = null; S.adminTab = null;
  clearTimers(); clearInterval(S.pollTimer); S.pollTimer = null; if (window.TWRT) TWRT.stop(); S.me = null; S.sig = {}; S.el = {}; renderResults = null;
  S.friends = []; S.mine = []; S.invites = []; S.reqs = { incoming: [], outgoing: [] };
  renderAuth();
}
async function start() {
  try { const m = await api('GET', '/api/meta'); S.meta = { games: m.games || [], regions: m.regions || [] }; } catch (e) { toast(e.message, 'error'); }
  try { S.site = await api('GET', '/api/site'); S.closedSig = JSON.stringify(S.site.closed); } catch { /* assume open */ }
  if (S.site.maintenance.on && !S.me.isAdmin) {
    clearInterval(S.pollTimer); S.pollTimer = every(poll, POLL_MS);
    showMaintenance(); return;
  }
  S.maint = false;
  if (window.TWPrefs) await TWPrefs.load();   // accent colour, text size, language: applied before the first screen is built
  if (!S.me.onboarded) { renderOnboarding(); return; }
  buildShell();
  checkTosAndCookiesConsent();
  if (window.TWRT && !S.rtOn) { S.rtOn = true; TWRT.on('social', () => { if (S.me && !document.hidden) poll(); }); TWRT.on('rt.up', () => { if (S.me) poll(); }); }
  if (window.TWRT) TWRT.start();
  try { await Promise.all([loadSocial(), refreshMine()]); } catch (e) { toast(e.message, 'error'); }
  clearInterval(S.pollTimer); S.pollTimer = every(poll, POLL_MS);
  if (!location.hash || location.hash === '#/') location.hash = '#/find';
  route();
  applyAutoGame();
}

document.addEventListener('click', (e) => { const c = e.target.closest && e.target.closest('.gcard'); if (c) S.morphFrom = c; }, true);
window.addEventListener('hashchange', route);
/* Language switched (Settings -> Language): rebuild whatever is on screen in the new language. */
document.addEventListener('tw:lang', () => {
  if (!S.me) { renderAuth(); return; }
  if (S.el.view) { buildShell(); route(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
/* Shared helpers for the feature modules (js/chat.js, groups.js, profile.js, notify.js), which load after this file.
   Read S/me through the getters; they change after login. */
/* Pages added by modules: `TWPages.name = async (arg, tok) => {...}` makes `#/name/arg` a route (use TW.show(node) to display it). */
const TWPages = window.TWPages = window.TWPages || {};
window.TW = { detectRegion, calcAge,
  $, h, icon, api, qs, enc, toast, T, nm, avatar, safeColor, ink, STATUS, statusKey,
  openSheet, confirmSheet, btn, busy, field, tabs, selectEl, suggestInput, gamePicker, switchEl, emptyState, stagger, when,
  personRow, groupCard, makeChat, openProfile, go, show, route, stale, playingStatusText, gameThumb, groupTile,
  loadSocial, refreshMine, renderFriends, renderBadge, renderUserPanel, applyAutoGame,
  showTermsOfService, showPrivacyPolicy, showCookiePolicy, checkTosAndCookiesConsent,
  t: tr, loggedOut, prepAvatar, sendAvatar, sendBanner, cropImage, autoOn,
  get S() { return S; }, get me() { return S.me; }, set me(u) { S.me = u; }
};

(async function boot() {
  try { S.me = await api('GET', '/api/me'); await start(); }
  catch (e) { renderAuth(); if (e.status === 0) toast(e.message, 'error'); }
})();
})();

window.TWApp = window.TWApp || {};
window.TWApp.uploadClip = (name, b64) => {
  try {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    const file = new File([blob], name || 'gameplay_clip.mp4', { type: 'video/mp4' });
    if (window.TW && window.TW.uploadClip) {
      window.TW.uploadClip(file);
    } else {
      toast('Open a chat room to upload the clip.', 'error');
    }
  } catch (err) {
    console.error('Error uploading clip:', err);
  }
};
