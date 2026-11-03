/* Notifications: unread badges, the bell's notification center, @mentions, page title count, and alerts (browser + desktop app).
   Loads after app.js and works through window.TW plus DOM observers, so app.js needs no changes. No innerHTML anywhere. */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, icon, api, toast, T, nm, avatar, enc } = TW;

/* ---------- preferences (this device only) ---------- */
const PREF_KEY = 'tw_notify';
const DEFAULTS = { dm: true, mention: true, group: true, system: true, muted: [] };
function loadPrefs() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
let prefs = loadPrefs();
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } refresh(); }
const isMuted = (gid) => prefs.muted.includes(Number(gid));

/* ---------- state ---------- */
const N = { sum: null, seen: null, readBusy: false, total: 0 };
const viewing = () => !document.hidden && document.hasFocus();
function openConv() {
  const m = /^#\/(dm|group)\/(\d+)/.exec(location.hash);
  return m && viewing() ? { kind: m[1] === 'dm' ? 'dm' : 'group', key: m[2] } : null;
}

/* What counts toward badges and the title. A chat you're looking at never counts. */
function counts() {
  const out = { dm: {}, group: {}, dmTotal: 0, groupTotal: 0, mentionExtra: 0 };
  const s = N.sum; if (!s) return out;
  const open = openConv();
  if (prefs.dm) for (const [k, v] of Object.entries(s.dm)) { if (open && open.kind === 'dm' && open.key === k) continue; out.dm[k] = v.n; out.dmTotal += v.n; }
  if (prefs.group) for (const [k, v] of Object.entries(s.groups)) {
    if (isMuted(k) || (open && open.kind === 'group' && open.key === k)) continue;
    out.group[k] = v.n; out.groupTotal += v.n;
  }
  // a mention in a muted group still gets through
  out.mentionExtra = (s.mentions || []).filter(m => !m.read && m.groupId && isMuted(m.groupId) && !(open && open.kind === 'group' && open.key === String(m.groupId))).length;
  return out;
}
const social = () => { const S = TW.S; return { reqs: S && S.reqs ? S.reqs.incoming.length : 0, invites: S ? S.invites.length : 0 }; };

/* ---------- badges ---------- */
function badge(host, n) {
  if (!host) return;
  let b = host.querySelector(':scope > .ubadge');
  if (!n) { if (b) b.remove(); return; }
  const txt = n > 99 ? '99+' : String(n);
  if (!b) { b = h('span', { class: 'ubadge' }); host.append(b); b.classList.add('pop'); }
  else if (b.textContent !== txt) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  b.textContent = txt;
  b.setAttribute('aria-label', `${n} unread`);
}

function decorate() {
  const c = counts(), sc = social();
  document.querySelectorAll('a.frow[href^="#/dm/"]').forEach(a => badge(a, c.dm[a.getAttribute('href').slice(5)] || 0));
  document.querySelectorAll('.rail-groups a[data-gid]').forEach(a => badge(a, c.group[a.dataset.gid] || 0));
  const friendsN = c.dmTotal + sc.reqs + sc.invites;
  badge(document.querySelector('.nav-main a[href="#/friends"]'), friendsN);
  badge(document.querySelector('.bottom-nav a.bn-item[href="#/friends"] .bn-ico'), friendsN);
  N.total = c.dmTotal + c.groupTotal + c.mentionExtra + sc.reqs + sc.invites;
  const bell = document.querySelector('.topbar .actions a.icon-btn[href="#/friends"]');
  if (bell) {
    badge(bell, N.total);
    bell.setAttribute('aria-label', N.total ? `Notifications, ${N.total} unread` : 'Notifications');
    bell.setAttribute('aria-haspopup', 'dialog');
    bell.classList.add('bell');
  }
  applyTitle();
}

/* ---------- page title: "(3) Third Wheel" ---------- */
let titleGuard = false;
function applyTitle() {
  const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
  const want = N.total > 0 ? `(${N.total > 99 ? '99+' : N.total}) ${base}` : base;
  if (document.title !== want) { titleGuard = true; document.title = want; }
}
const titleEl = document.querySelector('title');
if (titleEl) new MutationObserver(() => { if (titleGuard) { titleGuard = false; return; } applyTitle(); }).observe(titleEl, { childList: true });

/* ---------- polling ---------- */
async function tick() {
  const S = TW.S;
  if (!TW.me || (S && S.maint)) { if (!TW.me) { N.sum = null; N.seen = null; N.total = 0; } return; }
  try { N.sum = await api('GET', '/api/notifications/summary'); } catch { return; }
  collectAlerts();
  markOpenRead();
  refresh();
}
function refresh() { decorate(); if (center) renderCenter(false); }
setInterval(tick, 3000);
addEventListener('hashchange', () => { refresh(); setTimeout(tick, 150); });
addEventListener('focus', () => { refresh(); tick(); });
document.addEventListener('visibilitychange', () => { refresh(); if (!document.hidden) tick(); });

/* The open chat is read as long as you're looking at it. */
function markOpenRead() {
  const open = openConv(); if (!open || N.readBusy || !N.sum) return;
  const bucket = open.kind === 'dm' ? N.sum.dm : N.sum.groups;
  if (!bucket[open.key] && !(N.sum.mentions || []).some(m => !m.read && (open.kind === 'group' ? String(m.groupId) === open.key : String(m.peerId) === open.key))) return;
  N.readBusy = true;
  api('POST', '/api/notifications/read', { kind: open.kind, key: Number(open.key) })
    .then(() => { delete bucket[open.key]; (N.sum.mentions || []).forEach(m => { if (open.kind === 'group' ? String(m.groupId) === open.key : String(m.peerId) === open.key) m.read = true; }); N.sum.mentionCount = N.sum.mentions.filter(m => !m.read).length; refresh(); })
    .catch(() => {}).finally(() => { N.readBusy = false; });
}

/* ---------- alerts ---------- */
const groupName = (gid) => { const g = (TW.S.mine || []).find(x => String(x.id) === String(gid)); return g ? T(g.name) : 'a group'; };
const clip = (t, n = 110) => { t = T(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function collectAlerts() {
  const s = N.sum, first = !N.seen;
  if (first) N.seen = { dm: {}, group: {}, mention: 0 };
  const open = openConv(), out = [], mentionedGroups = new Set();

  const fresh = (s.mentions || []).filter(m => !m.read && m.id > N.seen.mention);
  fresh.forEach(m => { N.seen.mention = Math.max(N.seen.mention, m.id); });
  if (!first && prefs.mention) for (const m of fresh) {
    const here = open && (m.groupId ? open.kind === 'group' && open.key === String(m.groupId) : open.kind === 'dm' && open.key === String(m.peerId));
    if (here) continue;
    if (m.groupId) mentionedGroups.add(String(m.groupId));
    out.push({ kind: 'mention', title: `${nm(m.from)} mentioned you`, body: (m.groupId ? 'in ' + groupName(m.groupId) + ': ' : '') + clip(m.snippet), route: m.groupId ? '#/group/' + m.groupId : '#/dm/' + m.peerId, tag: 'tw-m-' + m.id });
  }
  for (const [k, v] of Object.entries(s.dm)) {
    const prev = N.seen.dm[k] || 0; if (v.newest <= prev) continue; N.seen.dm[k] = v.newest;
    if (first || !prefs.dm || (open && open.kind === 'dm' && open.key === k)) continue;
    out.push({ kind: 'dm', title: nm(v.from), body: clip(v.snippet) || 'New message' + (v.n > 1 ? ` (+${v.n - 1} more)` : ''), route: '#/dm/' + k, tag: 'tw-dm-' + k });
  }
  for (const [k, v] of Object.entries(s.groups)) {
    const prev = N.seen.group[k] || 0; if (v.newest <= prev) continue; N.seen.group[k] = v.newest;
    if (first || !prefs.group || isMuted(k) || mentionedGroups.has(k) || (open && open.kind === 'group' && open.key === k)) continue;
    out.push({ kind: 'group', title: groupName(k), body: `${nm(v.from)}: ${clip(v.snippet) || 'New message'}` + (v.n > 1 ? ` (+${v.n - 1} more)` : ''), route: '#/group/' + k, tag: 'tw-g-' + k });
  }
  out.slice(0, 4).forEach(deliver);
}

function deliver(a) {
  if (viewing()) { if (a.kind !== 'group') toast(`${a.title}: ${a.body}`); return; }   // you're here: a quiet in-page toast is enough
  if (!prefs.system) return;
  if (window.__TW_DESKTOP) {                                  // the desktop app drains this queue into Windows notifications
    const q = (window.TWApp._q = window.TWApp._q || []);
    q.push({ title: a.title, body: a.body, route: a.route, tag: a.tag });
    if (q.length > 30) q.shift();
    return;
  }
  if (typeof Notification !== 'undefined' && window.isSecureContext && Notification.permission === 'granted') {
    try {
      const n = new Notification(a.title, { body: a.body, tag: a.tag, icon: 'icon.svg' });
      n.onclick = () => { window.focus(); location.hash = a.route; n.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}
window.TWApp = window.TWApp || {};
window.TWApp._q = [];
window.TWApp.drain = () => { const q = window.TWApp._q; window.TWApp._q = []; return q; };

/* ---------- notification center (bell popover) ---------- */
let center = null, bellEl = null, centerSig = '';
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
};

function item({ who, tile, title, sub, href, right, onclick }) {
  const el = h(href ? 'a' : 'div', { class: 'nitem' + (href ? ' link' : ''), href },
    who ? avatar(who, 'md') : tile || h('span', { class: 'nico' }, icon('bell', 18)),
    h('div', { class: 'nmeta' }, h('b', { text: title }), sub ? h('span', { class: 'muted small', text: sub }) : null),
    right || null);
  if (href) el.addEventListener('click', () => closeCenter(false));
  if (onclick) el.addEventListener('click', onclick);
  return el;
}
const section = (title, rows) => rows.length ? h('div', { class: 'nsection' }, h('div', { class: 'section-title', text: title }), ...rows) : null;
const countPill = (n) => h('span', { class: 'ncount', text: n > 99 ? '99+' : String(n) });

function buildRows() {
  const s = N.sum || { dm: {}, groups: {}, mentions: [] }, c = counts(), S = TW.S;
  const mentions = (s.mentions || []).filter(m => !m.read).slice(0, 8).map(m => item({
    who: m.from, title: `${nm(m.from)} mentioned you`, sub: `${m.groupId ? 'in ' + groupName(m.groupId) + ' · ' : ''}${clip(m.snippet, 70)}`,
    href: m.groupId ? '#/group/' + m.groupId : '#/dm/' + m.peerId, right: h('span', { class: 'muted small', text: ago(m.createdAt) })
  }));
  const dms = Object.entries(s.dm).filter(([k]) => c.dm[k]).sort((a, b) => b[1].newest - a[1].newest).map(([k, v]) => item({
    who: v.from, title: nm(v.from), sub: clip(v.snippet, 70), href: '#/dm/' + k, right: countPill(v.n)
  }));
  const groups = Object.entries(s.groups).filter(([k]) => c.group[k]).sort((a, b) => b[1].newest - a[1].newest).map(([k, v]) => {
    const g = (S.mine || []).find(x => String(x.id) === k);
    const tile = h('span', { class: 'gtile big', 'aria-hidden': 'true' }, (T(g ? g.name : '?')[0] || '?').toUpperCase());
    if (g) { tile.style.background = TW.safeColor(g.color); tile.style.color = TW.ink(g.color); }
    return item({ tile, title: g ? T(g.name) : 'A group', sub: `${nm(v.from)}: ${clip(v.snippet, 60)}`, href: '#/group/' + k, right: countPill(v.n) });
  });
  const reqs = (S.reqs.incoming || []).map(r => {
    const act = async (verb) => { try { await api('POST', `/api/friends/requests/${enc(r.id)}/${verb}`); await TW.loadSocial(); if (verb === 'accept') toast('You’re now friends'); } catch (e) { toast(e.message, 'error'); } };
    const yes = TW.btn('Accept', { cls: 'small', onclick: () => act('accept') }), no = TW.btn('Decline', { cls: 'small ghost', onclick: () => act('decline') });
    return item({ who: r.from || {}, title: nm(r.from || {}), sub: 'Friend request', right: h('div', { class: 'nacts' }, yes, no) });
  });
  const invs = (S.invites || []).map(inv => {
    const gg = inv.group || {};
    const join = TW.btn('Join', { cls: 'small', onclick: async () => { try { await api('POST', `/api/invites/${enc(inv.id)}/accept`); await Promise.all([TW.loadSocial(), TW.refreshMine()]); toast('Joined ' + T(gg.name)); } catch (e) { toast(e.message, 'error'); } } });
    const no = TW.btn('Decline', { cls: 'small ghost', onclick: async () => { try { await api('POST', `/api/invites/${enc(inv.id)}/decline`); await TW.loadSocial(); } catch (e) { toast(e.message, 'error'); } } });
    return item({ title: T(gg.name || 'Group invite'), sub: `Invited by ${inv.from && typeof inv.from === 'object' ? nm(inv.from) : T(inv.from)}`, right: h('div', { class: 'nacts' }, join, no) });
  });
  return [section('Mentions', mentions), section('Direct messages', dms), section('Groups', groups), section('Friend requests', reqs), section('Group invites', invs)].filter(Boolean);
}

function renderCenter(animate) {
  if (!center) return;
  const rows = buildRows();
  const sig = JSON.stringify([N.sum && [N.sum.dm, N.sum.groups, N.sum.mentions], TW.S.reqs, TW.S.invites, prefs.muted]);
  if (!animate && sig === centerSig) return;
  centerSig = sig;
  const body = center.querySelector('.nbody'), keep = body.scrollTop;
  const focusIdx = [...center.querySelectorAll('a,button')].indexOf(document.activeElement);
  body.replaceChildren(...(rows.length ? rows : [h('div', { class: 'nempty' }, h('b', { text: 'You’re all caught up' }), h('p', { class: 'muted', text: 'New messages, mentions, friend requests and invites show up here.' }))]));
  body.scrollTop = keep;
  if (focusIdx > 0) { const f = [...center.querySelectorAll('a,button')][focusIdx]; f && f.focus({ preventScroll: true }); }
  if (animate && !TWM.reduce()) [...body.children].forEach((c, i) => c.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 60 + i * 50, easing: TWM.SPRING, fill: 'backwards' }));
}

function openCenter(bell) {
  if (center) return;
  bellEl = bell;
  const markAll = TW.btn('Mark all read', { cls: 'small ghost' });
  markAll.addEventListener('click', async () => { try { await api('POST', '/api/notifications/read-all'); await tick(); } catch (e) { toast(e.message, 'error'); } });
  center = h('div', { class: 'ncenter', role: 'dialog', 'aria-label': 'Notifications' },
    h('div', { class: 'nhead' }, h('h3', { text: 'Notifications' }), markAll,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close notifications', onclick: () => closeCenter(true) }, icon('x', 18))),
    h('div', { class: 'nbody' }));
  const r = bell.getBoundingClientRect(), w = Math.min(390, innerWidth - 16);
  center.style.width = w + 'px';
  center.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  center.style.top = (r.bottom + 8) + 'px';
  document.body.append(center);
  bell.setAttribute('aria-expanded', 'true');
  centerSig = '';
  renderCenter(true);
  if (!TWM.reduce()) center.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: TWM.SPRING });
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
  const first = center.querySelector('.nitem a, a.nitem, .nitem button') || center.querySelector('.icon-btn');
  first && first.focus({ preventScroll: true });
  tick();
}
function closeCenter(refocus) {
  if (!center) return;
  const c = center; center = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', onKey, true);
  if (bellEl) { bellEl.setAttribute('aria-expanded', 'false'); if (refocus) bellEl.focus(); }
  const done = () => c.remove();
  setTimeout(done, 240);
  if (!TWM.reduce()) c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.97)' }], { duration: 160, easing: 'ease-in' }).finished.then(done, done);
  else done();
}
function outside(e) { if (center && !center.contains(e.target) && !(bellEl && bellEl.contains(e.target))) closeCenter(false); }
function onKey(e) { if (e.key === 'Escape' && center) { e.preventDefault(); e.stopPropagation(); closeCenter(true); } }

// The bell was a plain link to #/friends; it now opens the center instead.
document.addEventListener('click', (e) => {
  const bell = e.target.closest && e.target.closest('.topbar .actions a.icon-btn[href="#/friends"]');
  if (!bell) return;
  e.preventDefault(); e.stopPropagation();
  center ? closeCenter(false) : openCenter(bell);
}, true);

/* ---------- Settings → Notifications ---------- */
function permissionBlock() {
  const note = (text) => h('p', { class: 'muted small', text });
  if (window.__TW_DESKTOP) return note('Alerts appear as Windows notifications while Third Wheel is in the background or minimized, and its taskbar button flashes.');
  if (!window.isSecureContext || typeof Notification === 'undefined') return note('Browser notifications need a secure (https) address, so they’re unavailable here. Badges and the tab title still update, and the desktop app shows Windows notifications.');
  const state = () => Notification.permission;
  const wrap = h('div', { class: 'stack', style: 'gap:8px' });
  const draw = () => {
    wrap.replaceChildren(state() === 'granted' ? note('Browser notifications are on for this device.')
      : state() === 'denied' ? note('Notifications are blocked for this site in your browser settings.')
      : h('div', {}, TW.btn('Enable browser notifications', { icon: 'bell', onclick: async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } draw(); } })),
      note('On phones, alerts only arrive while Third Wheel is open; background push needs https and isn’t set up yet.'));
  };
  draw();
  return wrap;
}

/* The group list loads after the page opens, so the muted-groups section is (re)filled whenever my groups change. */
function fillMuted(box) {
  const mine = TW.S.mine || [], sig = JSON.stringify(mine.map(g => [g.id, g.name]));
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(...(mine.length
    ? mine.map(g => h('div', { class: 'nrow' }, h('div', { class: 'nrow-text' }, h('b', { text: T(g.name) }), h('span', { class: 'muted small', text: 'Mute group' })),
        TW.switchEl(isMuted(g.id), (v) => { prefs.muted = prefs.muted.filter(x => x !== Number(g.id)); if (v) prefs.muted.push(Number(g.id)); savePrefs(); }, 'Mute ' + T(g.name))))
    : [h('p', { class: 'muted small', text: 'Join a group to mute it here.' })]));
}

function injectSettings() {
  if (location.hash !== '#/settings') return;
  const page = document.querySelector('#view .page');
  if (!page) return;
  const existing = page.querySelector('.notify-settings');
  if (existing) { fillMuted(existing.querySelector('.muted-groups')); return; }
  const h1 = page.querySelector('h1'); if (!h1 || h1.textContent !== 'Settings') return;
  const row = (label, hint, key) => h('div', { class: 'nrow' }, h('div', { class: 'nrow-text' }, h('b', { text: label }), h('span', { class: 'muted small', text: hint })),
    TW.switchEl(!!prefs[key], (v) => { prefs[key] = v; savePrefs(); }, label));
  const muted = h('div', { class: 'stack muted-groups', style: 'gap:6px' });
  fillMuted(muted);
  const card = h('div', { class: 'card notify-settings', style: 'padding:24px;display:flex;flex-direction:column;gap:14px' },
    h('h3', { text: 'Notifications' }),
    h('p', { class: 'muted small', text: 'Choose what shows unread badges and alerts on this device. Mentions of your @username always appear in the bell.' }),
    row('Direct messages', 'Badges and alerts for new DMs', 'dm'),
    row('Mentions', 'Alert me when someone @mentions me', 'mention'),
    row('Group messages', 'Badges and alerts for group chat', 'group'),
    row('Alerts when away', 'Show Windows / browser notifications while the app is in the background', 'system'),
    permissionBlock(),
    h('div', { class: 'section-title', text: 'Muted groups' }), muted);
  const last = page.lastElementChild;
  page.insertBefore(card, last && last.classList.contains('card') ? last : null);
}

/* ---------- keep everything decorated as the app re-renders lists ---------- */
let queued = false;
function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); injectSettings(); }); }
const onlyBadges = (m) => ![...m.addedNodes, ...m.removedNodes].some(n => !(n.nodeType === 1 && n.classList && n.classList.contains('ubadge')));
new MutationObserver((muts) => { if (!muts.every(onlyBadges)) schedule(); }).observe(document.body, { childList: true, subtree: true });
tick();
})();
