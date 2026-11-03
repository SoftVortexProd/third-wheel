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
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4'
};
function icon(name, size = 22) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
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

function avatar(u, size = 'md', withStatus = false) {
  u = u || {};
  const el = h('span', { class: 'avatar ' + size, 'aria-hidden': 'true' }, (nm(u).trim()[0] || '?').toUpperCase());
  el.style.background = safeColor(u.avatarColor); el.style.color = ink(u.avatarColor);
  if (typeof u.avatar === 'string' && AV_RE.test(u.avatar)) {
    const img = h('img', { src: u.avatar, alt: '', decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    el.append(img);
  }
  if (!withStatus) return el;
  return h('span', { class: 'av-wrap' }, el, h('span', { class: 'dot ' + statusKey(u.status), 'aria-hidden': 'true' }));
}

/* ================= api ================= */
class ApiError extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }
async function api(method, url, body) {
  const o = { method, credentials: 'same-origin', headers: {} };
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

/* ---- game picker (with Steam Store search, thumbnail covers, chips & custom entry) ---- */
function gamePicker(opts = {}) {
  const multi = !!opts.multi;
  const allowCustom = opts.allowCustom !== false;
  let cur = multi ? [...(opts.value || [])] : (opts.value ? String(opts.value) : '');
  const placeholder = opts.placeholder || (multi ? 'Search games to add or type custom...' : 'Search games or type custom...');
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
          h('span', { text: T(g) }),
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
        const valSpan = h('span', { class: 'game-picker-single-val' }, icon('pad', 18), h('span', { text: T(cur) }));
        const changeBtn = h('button', {
          type: 'button', class: 'btn sm', text: 'Change',
          onclick: (e) => {
            e.preventDefault();
            searchWrap.style.display = 'flex';
            singlePreview.style.display = 'none';
            input.value = '';
            input.focus();
            search();
          }
        });
        const clearBtn = anyLabel != null ? h('button', {
          type: 'button', class: 'btn sm secondary', text: 'Clear',
          onclick: (e) => { e.preventDefault(); selectGame(''); }
        }) : null;
        singlePreview.replaceChildren(valSpan, h('div', { class: 'row', style: 'gap:6px' }, changeBtn, clearBtn));
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

    if (allowCustom && q && !list.some(x => (x.name || x).toLowerCase() === q.toLowerCase())) {
      const custOpt = h('div', { class: 'gp-opt gp-opt-custom', role: 'option' },
        icon('plus', 18),
        h('span', { text: `Use custom: "${T(q)}"` })
      );
      custOpt.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        selectGame(q);
      });
      pop.append(custOpt);
      items.push({ name: q, isCustom: true });
    }

    if (!items.length) {
      pop.append(h('div', { class: 'dd-empty', text: 'No games found' }));
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
      if (pop && activeIdx >= 0 && items[activeIdx]) {
        selectGame(items[activeIdx].name || items[activeIdx]);
      } else if (allowCustom && input.value.trim()) {
        selectGame(input.value.trim());
      }
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
  input.setAttribute('aria-describedby', id + '-m');
  const f = h('div', { class: 'field' }, h('label', { for: id, text: label }), input, msg);
  f.setError = (m) => { f.classList.toggle('invalid', !!m); f.classList.remove('shake'); if (m) { void f.offsetWidth; f.classList.add('shake'); } msg.textContent = m || hint || ''; input.setAttribute('aria-invalid', m ? 'true' : 'false'); return !m; };
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
function openSheet(title, body) {
  const prev = document.activeElement;
  let closing = false;
  const ov = h('div', { class: 'overlay' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('x'))),
    h('div', { class: 'sheet-body' }, body));
  ov.append(panel);
  const focusables = () => [...panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
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
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
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
  const sub = p.playing ? h('span', { class: 'playing' }, icon('pad', 13), 'Playing ' + T(p.playing))
    : h('span', {}, o.region && p.region ? T(p.region) : STATUS[sk]);
  return h(o.href ? 'a' : 'div', { class: 'frow ' + (o.big ? 'big ' : '') + (sk === 'offline' ? 'off' : '') + (o.href ? ' link' : ''), href: o.href, 'data-key': p.id != null ? 'p' + p.id : null },
    avatar(p, 'md', true),
    h('div', { class: 'meta' }, h('b', { text: nm(p) }, p.displayName && p.displayName !== p.username ? h('small', { class: 'handle', text: ' @' + T(p.username) }) : null), sub),
    o.action ? h('div', { class: 'act' }, o.action) : null);
}

/* ================= auth ================= */
const USER_RE = /^[A-Za-z0-9_.-]{3,20}$/;
function renderAuth() {
  clearTimers(); S.me = null;
  let mode = 'login';
  const user = h('input', { class: 'input', type: 'text', autocomplete: 'username', maxlength: 20, autocapitalize: 'none', spellcheck: 'false', placeholder: tr('your_name') });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 128, placeholder: tr('At least 8 characters') });
  const fu = field(tr('Username'), user, tr('3–20 letters, numbers, . _ -'));
  const fp = field(tr('Password'), pass);
  const err = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, tr('Log in'));
  const tb = tabs([['login', tr('Log in')], ['signup', tr('Sign up')]], 'login', (k) => {
    mode = k; submit.textContent = k === 'login' ? tr('Log in') : tr('Create account'); err.textContent = '';
    pass.autocomplete = k === 'login' ? 'current-password' : 'new-password';
    fu.setError(''); fp.setError('');
  }, tr('Account'));
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const u = user.value.trim(), p = pass.value;
    const okU = fu.setError(USER_RE.test(u) ? '' : tr('Use 3–20 letters, numbers, . _ or -'));
    const okP = fp.setError(p.length >= 8 ? '' : tr('Password must be at least 8 characters'));
    if (!okU || !okP) return;
    submit.disabled = true; const idle = TWM.busyBtn(submit);
    try {
      const r = await api('POST', '/api/auth/' + mode, { username: u, password: p });
      S.me = r.user || r; await start();
    } catch (ex) { err.textContent = T(ex.message); }
    finally { submit.disabled = false; idle(); }
  } }, fu, fp, err, submit);
  document.title = 'Third Wheel';
  const card = h('div', { class: 'card auth-card' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '', width: 32, height: 32 }), 'Third Wheel'),
    h('p', { class: 'muted', style: 'margin-top:8px', text: tr('Find a group that plays the way you do.') }),
    tb, form);
  TWM.transition(() => $('#app').replaceChildren(h('main', { class: 'center-screen' }, card)));
  user.focus();
}

/* ================= onboarding ================= */
function renderOnboarding() {
  clearTimers();
  const d = { region: S.me.region || '', age: S.me.age || '', games: [...(S.me.favoriteGames || [])] };
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
      const age = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 13, max: 99, value: d.age || '', placeholder: 'Your age' });
      const fr = field('Region', reg, 'We match you with groups close by.'), fa = field('Age', age, 'Must be 13 or older.');
      body.append(h('p', { class: 'muted', text: 'Pick your region and age so we can match you with the right groups.' }), h('div', { class: 'row' }, fr, fa));
      next = () => {
        const okR = fr.setError(reg.value ? '' : 'Choose a region');
        const a = parseInt(age.value, 10);
        const okA = fa.setError(a >= 13 && a <= 99 ? '' : 'Enter an age from 13 to 99');
        if (!okR || !okA) return false; d.region = reg.value; d.age = a; return true;
      };
    } else if (step === 1) {
      const gp = gamePicker({ multi: true, value: d.games || [] });
      body.append(h('p', { class: 'muted', text: 'Search or choose the games you love. Pick as many as you like.' }), gp);
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
        await api('PUT', '/api/me/settings', { region: d.region, age: d.age, favoriteGames: d.games, playing: S.me.playing || '', status: S.me.status || 'online', onboarded: true });
        if (d.extras && window.TWProfile) await TWProfile.saveExtras(d.extras).catch(() => {});
        S.me = await api('GET', '/api/me'); await start();
      });
    });
    const stepEl = h('div', { class: 'step-in', style: `--dx:${dir * 30}px` },
      h('h1', { text: steps[step] }), h('div', { style: 'height:12px' }), body, err,
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
    h('div', { class: 'nav-main' }, navLink('#/feed', 'feed', tr('Feed')), navLink('#/search', 'search', tr('Find groups')), navLink('#/friends', 'users', tr('Friends & invites'))),
    h('div', { class: 'rail-head' }, tr('My groups'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('Create a group'), onclick: openCreate }, icon('plus', 16))),
    E.railGroups, E.user);

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand brand-mobile' }, h('img', { src: 'icon.svg', alt: '', width: 28, height: 28 }), 'Third Wheel'),
    h('div', { class: 'searchbox', role: 'search' }, h('span', { class: 'ico' }, icon('search', 18)), E.q),
    h('div', { class: 'actions' },
      S.me.isAdmin ? h('a', { class: 'icon-btn', href: '#/admin', 'aria-label': tr('Admin panel') }, icon('shield')) : null,
      h('a', { class: 'icon-btn', href: '#/friends', 'aria-label': tr('Friend requests and invites') }, icon('bell'), E.badge),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': tr('Settings') }, icon('gear'))));

  const panel = h('aside', { class: 'friends-panel', 'aria-label': tr('Friends') },
    h('header', {}, h('h3', { text: tr('Friends') }), E.fCount), E.fList);

  const bnItem = (href, ico, label) => h('a', { class: 'bn-item', href, 'data-route': href }, h('span', { class: 'bn-ico' }, icon(ico, 24)), label);
  const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' },
    bnItem('#/feed', 'feed', tr('Feed')),
    h('a', { class: 'bn-search', href: '#/search', 'data-route': '#/search', 'aria-label': tr('Search') }, icon('search', 28)),
    bnItem('#/friends', 'user', tr('Friends')));

  const shell = h('div', { class: 'shell enter' }, rail, h('div', { class: 'main' }, topbar, E.view), panel, bottom);
  $('#app').replaceChildren(shell);
  setTimeout(() => shell.classList.remove('enter'), 1200);
  renderUserPanel(); renderRail(); renderFriends(); renderBadge();
}
function renderUserPanel() {
  const me = S.me; if (!me || !S.el.user) return;
  S.el.user.replaceChildren(avatar(me, 'sm', false),
    h('div', { class: 'meta' }, h('b', { text: nm(me) }), h('span', { class: 'muted small', text: me.playing ? tr('Playing {game}', { game: T(me.playing) }) : STATUS[statusKey(me.status)] })),
    h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': tr('Settings') }, icon('gear', 20)));
}
function renderRail() {
  const rg = S.el.railGroups; if (!rg) return;
  const onGroup = location.hash.startsWith('#/group/');
  const cur = onGroup ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
  const sig = JSON.stringify(S.mine.map(g => [g.id, g.name, g.color]));
  if (rg.dataset.sig !== sig) {
    rg.dataset.sig = sig;
    const list = S.mine.map(g => {
      const tile = h('span', { class: 'gtile', 'aria-hidden': 'true' }, (T(g.name)[0] || '?').toUpperCase());
      tile.style.background = safeColor(g.color); tile.style.color = ink(g.color);
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
  const from = o.from && o.from.isConnected ? o.from : null;
  if (!from) node.classList.add('view-in');
  TWM.transition(() => {
    S.el.view.replaceChildren(node);
    if (!node.classList.contains('chat-page')) S.el.view.scrollTop = 0;
  }, { from, to: o.to });
}
function clearTimers() { clearInterval(S.chatTimer); S.chatTimer = null; S.onData = null; }
function markNav() {
  const hash = location.hash || '#/feed';
  document.querySelectorAll('[data-route]').forEach(a => {
    const on = hash.startsWith(a.dataset.route);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  renderRail(); TWM.nav();
}
async function route() {
  if (!S.me || !S.el.view) return;
  clearTimers();
  const tok = ++S.tok;
  const parts = (location.hash || '#/feed').replace(/^#\/?/, '').split('/');
  const gh = S.el.view.querySelector('.ghead');
  S.leaving = gh ? { el: gh, id: S.viewGroup } : null;
  S.viewGroup = null;
  TWM.prog.start();
  markNav();
  const closedKey = { feed: 'feed', search: 'search', friends: 'friends', dm: 'dms', group: 'groups' }[parts[0]];
  const closedMsg = closedKey && S.site.closed[closedKey];
  if (closedMsg && !S.me.isAdmin) {
    show(h('div', { class: 'page' }, emptyState('This page is closed', T(closedMsg))));
    return;
  }
  const fn = { feed: feedView, search: searchView, group: groupView, dm: dmView, friends: friendsView, settings: settingsView, admin: adminView }[parts[0]] || feedView;
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
    h('div', { class: 'title-row' }, h('h3', {}, h('a', { href: '#/group/' + enc(g.id) }, T(g.name)))),
    h('div', { class: 'chips' }, h('span', { class: 'chip accent', text: T(g.game) }), h('span', { class: 'chip', text: g.mode === 'competitive' ? 'Competitive' : 'Casual' }),
      g.region ? h('span', { class: 'chip', text: T(g.region) }) : null, h('span', { class: 'chip', text: ages })),
    g.description ? h('p', { text: T(g.description) }) : null,
    h('div', { class: 'foot' }, h('span', {}, icon('users', 14), ' ', `${g.memberCount ?? 0} member${g.memberCount === 1 ? '' : 's'}`),
      g.isMember ? h('span', { class: 'chip ok' }, icon('check', 12), 'Joined') : null));
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
  const actions = h('div', { class: 'row group-actions', style: 'flex:none;gap:8px;flex-wrap:wrap' });
  if (isMember) {
    actions.append(btn('Invite friend', { cls: 'small', icon: 'plus', onclick: () => openInvite(g, members) }),
      ...(G ? G.headerButtons(g, route) : []),
      btn('Leave', { cls: 'small ghost', onclick: (e) => leaveGroup(g, e.currentTarget) }));
  } else if (G) {
    actions.append(...G.joinControls(g, route));
  }
  const head = h('div', { class: 'ghead' },
    h('div', { class: 'top' }, h('a', { class: 'icon-btn mobile-only', href: '#/feed', 'aria-label': 'Back to feed' }, icon('back')), h('h1', { text: T(g.name) }), actions),
    h('div', { class: 'chips stagger-pop' }, h('span', { class: 'chip accent', text: T(g.game) }), h('span', { class: 'chip', text: g.mode === 'competitive' ? 'Competitive' : 'Casual' }),
      g.region ? h('span', { class: 'chip', text: T(g.region) }) : null, h('span', { class: 'chip', text: ages }), h('span', { class: 'chip', text: `${g.memberCount ?? members.length} members` }),
      g.privacy === 'private' ? h('span', { class: 'chip', text: 'Private' }) : g.privacy === 'request' ? h('span', { class: 'chip', text: 'Approval needed' }) : null),
    g.description ? h('p', { class: 'desc', text: T(g.description) }) : null,
    members.length ? (G ? G.members(g, route) : h('div', { class: 'members stagger-pop', 'aria-label': 'Members' }, members.map(m => h('button', { class: 'member', type: 'button', 'aria-label': 'View ' + nm(m) + '’s profile', onclick: () => openProfile(m.id) }, avatar(m, 'sm'), nm(m))))) : null);
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
  page.replaceChildren(head, chat.log, chat.composer);
  showPage();
  chat.log.scrollTo({ top: chat.log.scrollHeight, behavior: 'instant' });
  chat.done();
  S.chatTimer = setInterval(() => { if (!document.hidden) chat.poll(); }, 2500);
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
async function openProfile(id) {
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
  const body = h('div', { class: 'profile' },
    h('div', { class: 'profile-top' }, avatar(p, 'xl', true),
      h('div', { class: 'profile-names' }, h('h2', { text: nm(p) }), h('p', { class: 'muted', text: '@' + T(p.username) }),
        h('p', { class: 'status-line' + (p.playing ? ' playing' : ''), text: p.playing ? 'Playing ' + T(p.playing) : STATUS[sk] }))),
    h('div', { class: 'prows' }, row('Region', T(p.region)), row('Age', p.ageRange), row('Member since', isNaN(joined) ? '' : joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))),
    games.length ? h('div', { class: 'section' }, h('div', { class: 'section-title', text: 'Favorite games' }), h('div', { class: 'chips favgames' }, games.map(g => h('span', { class: 'chip', text: T(g) })))) : null,
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
      const el = h('div', { class: 'msg' + (m.userId === S.me.id ? ' own' : '') }, avatar(m, 'md'),
        h('div', { class: 'body' }, h('div', { class: 'head' }, h('b', { text: nm(m) }), h('time', { text: isNaN(when) ? '' : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), datetime: isNaN(when) ? null : when.toISOString() })),
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
  const paintSub = () => { const f = S.friends.find(x => x.id === p.id) || p; sub.textContent = f.playing ? 'Playing ' + T(f.playing) : STATUS[statusKey(f.status)]; };
  paintSub();
  const who = h('button', { class: 'dm-who', type: 'button', 'aria-label': 'View ' + nm(p) + '’s profile', onclick: () => openProfile(p.id) },
    avatar(p, 'md', true), h('span', { class: 'dm-names' }, h('b', { text: nm(p) }), sub));
  const head = h('div', { class: 'ghead dmhead' }, h('div', { class: 'top' },
    h('a', { class: 'icon-btn mobile-only', href: '#/friends', 'aria-label': 'Back to friends' }, icon('back')), who));
  const chat = makeChat({
    placeholder: 'Message ' + nm(p), label: 'Direct messages with ' + nm(p), tok, conv: { kind: 'd', id: p.id },
    list: (after) => api('GET', `/api/dms/${enc(p.id)}` + qs({ after })),
    post: (text) => api('POST', `/api/dms/${enc(p.id)}`, { text })
  });
  chat.fill(first, 'Say hi 👋', 'This is the start of your chat with ' + nm(p) + '.');
  const page = h('div', { class: 'chat-page' }, head, chat.log, chat.composer);
  show(page);
  chat.log.scrollTo({ top: chat.log.scrollHeight, behavior: 'instant' });
  chat.done();
  S.chatTimer = setInterval(() => { if (!document.hidden) { chat.poll(); paintSub(); } }, 2500);
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
  const tb = tabs([['overview', 'Overview'], ['users', 'Users'], ['groups', 'Groups']], S.adminTab || 'overview', (k) => { S.adminTab = k; draw(); TWM.slide(body, 1); }, 'Admin sections');
  show(h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Admin' }), h('p', { class: 'muted', text: 'Manage people, groups and the whole site.' }))), tb, body));
  draw();

  function draw() {
    const mine = ++seq, tab = S.adminTab || 'overview';
    tb.set(tab);
    body.replaceChildren(h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
    const run = tab === 'users' ? usersTab : tab === 'groups' ? groupsTab : overviewTab;
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

  function searchTab(placeholder, load, dead) {
    const q = h('input', { class: 'input', type: 'search', placeholder, 'aria-label': placeholder, autocomplete: 'off', maxlength: 40 });
    const list = h('div', { class: 'stack', style: 'gap:8px' });
    let timer = 0, n = 0;
    const refresh = async () => { const my = ++n; try { const rows = await load(q.value.trim()); if (my === n && !dead()) paint(rows); } catch (e) { if (my === n) toast(e.message, 'error'); } };
    let paint = () => {};
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });
    return { q, list, refresh, setPaint(fn) { paint = fn; } };
  }

  async function usersTab(dead) {
    const t = searchTab('Search users by username', (q) => api('GET', '/api/admin/users' + qs({ q })), dead);
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
    body.replaceChildren(t.q, t.list); t.refresh();
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
      const r = await api('POST', '/api/groups', { name: name.value.trim(), game: game.value, mode: mode.value, region: region.value, ageMin: a, ageMax: b, description: desc.value.trim(), privacy: privacy.value });
      await refreshMine(); close(); go('#/group/' + enc(r.id || (r.group && r.group.id))); toast('Group created');
    } catch (ex) { err.textContent = T(ex.message); } finally { submit.disabled = false; submit.classList.remove('loading'); }
  } }, fn, fg, h('div', { class: 'row' }, fm, fr), h('div', { class: 'field' }, h('span', { class: 'label', text: 'Age range' }), h('div', { class: 'row' }, amin, amax), audience), fpr, fd, err, submit);
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
      S.mine.length ? stackOf(S.mine.map(g => { const t = h('span', { class: 'gtile', 'aria-hidden': 'true' }, (T(g.name)[0] || '?').toUpperCase()); t.style.background = safeColor(g.color); t.style.color = ink(g.color);
        return h('a', { class: 'frow big', href: '#/group/' + enc(g.id) }, t, h('div', { class: 'meta' }, h('b', { text: T(g.name) }), h('span', { text: T(g.game) }))); })) : emptyState('No groups yet', 'Join one from the feed.'));
  }
  const peopleSlot = h('div', { class: 'rec-slot' });   // "People you may like" (profile.js)
  show(h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: tr('Friends & invites') }), h('p', { class: 'muted', text: tr('Requests, group invites and the people you play with.') }))), profile, invBox, reqBox, addForm, peopleSlot, friendBox, groupBox));
  if (window.TWProfile) TWProfile.peopleRecs(peopleSlot, () => stale(tok));
  S.onData = draw; draw();
  await loadSocial(); if (stale(tok)) S.onData = null;
}

/* ================= settings ================= */
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
    const [f, i, r, m] = await Promise.all([api('GET', '/api/friends'), api('GET', '/api/invites'), api('GET', '/api/friends/requests'), S.tick % 3 === 1 ? api('GET', '/api/groups/mine') : Promise.resolve(null)]);
    applySocial(f, i, r, false);
    if (m && update('m', m)) { S.mine = m; renderRail(); }
  } catch { /* transient */ }
}
function loggedOut() {
  S.maint = false; S.feedCache = null; S.adminTab = null;
  clearTimers(); clearInterval(S.pollTimer); S.pollTimer = null; S.me = null; S.sig = {}; S.el = {}; renderResults = null;
  S.friends = []; S.mine = []; S.invites = []; S.reqs = { incoming: [], outgoing: [] };
  renderAuth();
}
async function start() {
  try { const m = await api('GET', '/api/meta'); S.meta = { games: m.games || [], regions: m.regions || [] }; } catch (e) { toast(e.message, 'error'); }
  try { S.site = await api('GET', '/api/site'); S.closedSig = JSON.stringify(S.site.closed); } catch { /* assume open */ }
  if (S.site.maintenance.on && !S.me.isAdmin) {
    clearInterval(S.pollTimer); S.pollTimer = setInterval(poll, 2500);
    showMaintenance(); return;
  }
  S.maint = false;
  if (window.TWPrefs) await TWPrefs.load();   // accent colour, text size, language: applied before the first screen is built
  if (!S.me.onboarded) { renderOnboarding(); return; }
  buildShell();
  try { await Promise.all([loadSocial(), refreshMine()]); } catch (e) { toast(e.message, 'error'); }
  clearInterval(S.pollTimer); S.pollTimer = setInterval(poll, 2500);
  if (!location.hash || location.hash === '#/') location.hash = '#/feed';
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
window.TW = {
  $, h, icon, api, qs, enc, toast, T, nm, avatar, safeColor, ink, STATUS, statusKey,
  openSheet, confirmSheet, btn, busy, field, tabs, selectEl, suggestInput, gamePicker, switchEl, emptyState, stagger, when,
  personRow, groupCard, makeChat, openProfile, go, show, route, stale,
  loadSocial, refreshMine, renderFriends, renderBadge, renderUserPanel, applyAutoGame,
  t: tr, loggedOut, prepAvatar, sendAvatar, autoOn,
  get S() { return S; }, get me() { return S.me; }, set me(u) { S.me = u; }
};

(async function boot() {
  try { S.me = await api('GET', '/api/me'); await start(); }
  catch (e) { renderAuth(); if (e.status === 0) toast(e.message, 'error'); }
})();
})();
