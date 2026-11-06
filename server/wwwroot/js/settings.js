/* Settings page: left sidebar of tabs (profile, profile look, connections, appearance, safety, language, account).
   Loaded after app.js (window.TW) and prefs.js (window.TWPrefs). Other modules add cards to a tab by listening for
   `tw:settings-tab` ({ detail: { tab, root } }), which fires once each time a tab panel is first built. */
(() => {
'use strict';
const TW = window.TW, P = window.TWPrefs, t = TW.t;
const { h, api, toast, btn, busy, field, selectEl, suggestInput, switchEl, gamePicker, T, nm, avatar, enc, emptyState } = TW;

/* ---------- icons for the sidebar (own tiny set; app.js's list has no palette/globe) ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const PATHS = {
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  appearance: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11.5h.01',
  safety: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  language: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  account: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  look: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
  connections: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  chev: 'M6 9l6 6 6-6',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12.5 9H3l5-6.5 3.5 4.5 4.5-6z',
  id: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h4',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  gamepad: 'M6 12h4M8 10v4M15 13h.01M18 11h.01M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.3 6.5A3 3 0 0 0 4.4 18c1 0 1.8-.5 2.3-1.3L7.5 15h9l.8 1.7c.5.8 1.3 1.3 2.3 1.3a3 3 0 0 0 2.9-3.3l-1.3-6.5A4 4 0 0 0 17.3 5z',
  frame: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  swatch: 'M12 2.7l5.5 6.8a7 7 0 1 1-11 0z',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  userX: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM18 8l5 5M23 8l-5 5',
  key: 'M21 2l-2 2m-1.5 1.5L14 9M3 21l9-9M12 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  rocket: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2 6-6 2 2-6z',
  award: 'M12 15l-4 6 1.5-6.5L6 11l6.5-.5L12 4l-9.5 6.5L18 11l-3.5 3.5L16 21z',
  check: 'M20 6L9 17l-5-5',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  steam: 'M11.979 2a10 10 0 0 0-9.979 9.805l5.727 2.368a3.298 3.298 0 0 1 1.867-.577l2.29-3.31a4.34 4.34 0 0 1 4.1-6.286 4.35 4.35 0 1 1-4.35 4.35c0-.097.009-.192.025-.286L8.41 11.23a3.3 3.3 0 0 1-2.915 3.193L3.11 20.08A10 10 0 1 0 11.979 2zm3.98 4.35a2.175 2.175 0 1 0 0 4.35 2.175 2.175 0 0 0 0-4.35zm-8.48 9.35a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
  discord: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8',
  sparkles: 'M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z',
  sparkle: 'M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
};
function ico(name, size = 20) {
  const s = document.createElementNS(SVGNS, 'svg');
  const isFilled = name === 'steam' || name === 'discord';
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: size, height: size,
    fill: isFilled ? 'currentColor' : 'none',
    stroke: isFilled ? 'none' : 'currentColor',
    'stroke-width': isFilled ? 0 : 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
  })) s.setAttribute(k, v);
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', PATHS[name] || PATHS.gear); s.append(p);
  return s;
}
function iconFor(title) {
  const s = String(title || '').toLowerCase();
  if (s.includes('picture') || s.includes('avatar') || s.includes('bild')) return 'camera';
  if (s.includes('banner')) return 'image';
  if (s.includes('name') || s.includes('namn')) return 'id';
  if (s.includes('about you') || s.includes('om dig')) return 'sliders';
  if (s.includes('about me') || s.includes('om mig') || s.includes('bio')) return 'id';
  if (s.includes('frame') || s.includes('ram')) return 'frame';
  if (s.includes('layout')) return 'layers';
  if (s.includes('gamer tag') || s.includes('tag')) return 'gamepad';
  if (s.includes('verified') || s.includes('verifierad')) return 'connections';
  if (s.includes('steam')) return 'steam';
  if (s.includes('discord')) return 'discord';
  if (s.includes('theme') || s.includes('tema')) return 'appearance';
  if (s.includes('accent') || s.includes('colour') || s.includes('färg')) return 'swatch';
  if (s.includes('text size') || s.includes('textstorlek') || s.includes('font')) return 'type';
  if (s.includes('motion') || s.includes('animation') || s.includes('rörelse')) return 'zap';
  if (s.includes('filter') || s.includes('safety') || s.includes('säkerhet') || s.includes('nsfw')) return 'safety';
  if (s.includes('receipt') || s.includes('kvitto')) return 'check';
  if (s.includes('block') || s.includes('blocker')) return 'userX';
  if (s.includes('language') || s.includes('språk')) return 'language';
  if (s.includes('password') || s.includes('lösenord')) return 'key';
  if (s.includes('account') || s.includes('konto')) return 'account';
  if (s.includes('rckt')) return 'rocket';
  if (s.includes('notif') || s.includes('avisering')) return 'bell';
  if (s.includes('install') || s.includes('app')) return 'download';
  if (s.includes('logout') || s.includes('log out') || s.includes('logga ut')) return 'logout';
  if (s.includes('availability') || s.includes('tillgänglig')) return 'clock';
  if (s.includes('style') || s.includes('spelstil')) return 'compass';
  if (s.includes('rank') || s.includes('teammate') || s.includes('lagkamrat')) return 'award';
  return 'gear';
}
const gname = (g) => (typeof g === 'string' ? g : (g && g.name) || '');
const errToast = (e) => toast(e && e.message ? e.message : t('Something went wrong.'), 'error');

/* ---------- small custom controls ---------- */
/* Slider: role=slider, pointer + keyboard. Returns { el, set(v) }. */
function slider({ min, max, step, value, label, format, onInput, onCommit }) {
  const fill = h('span', { class: 'sl-fill' }), thumb = h('span', { class: 'sl-thumb' });
  const out = h('output', { class: 'sl-out' });
  const el = h('div', { class: 'slider', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': String(min), 'aria-valuemax': String(max) },
    h('span', { class: 'sl-track' }, fill), thumb);
  let v = value;
  const clamp = (x) => Math.min(max, Math.max(min, Math.round(x / step) * step));
  const paint = () => {
    const pct = ((v - min) / (max - min)) * 100;
    fill.style.width = pct + '%'; thumb.style.left = pct + '%';
    el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuetext', format(v)); out.textContent = format(v);
  };
  const set = (x, fire) => { const n = clamp(x); if (n === v && !fire) return; v = n; paint(); if (onInput) onInput(v); };
  const fromEvent = (e) => { const r = el.getBoundingClientRect(); return min + ((e.clientX - r.left) / r.width) * (max - min); };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); set(fromEvent(e)); });
  el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) set(fromEvent(e)); });
  const end = (e) => { if (el.hasPointerCapture(e.pointerId)) { el.releasePointerCapture(e.pointerId); el.classList.remove('drag'); if (onCommit) onCommit(v); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 5, PageDown: -step * 5 }[e.key];
    if (d != null) { e.preventDefault(); set(v + d); if (onCommit) onCommit(v); }
    else if (e.key === 'Home') { e.preventDefault(); set(min); if (onCommit) onCommit(v); }
    else if (e.key === 'End') { e.preventDefault(); set(max); if (onCommit) onCommit(v); }
  });
  paint();
  return { el: h('div', { class: 'slider-wrap' }, el, out), set: (x) => { v = clamp(x); paint(); if (onInput) onInput(v); } };
}

/* A labelled on/off row built on the shared switch. */
function switchRow(label, hint, on, onChange, locked, iconName) {
  const sw = switchEl(on, onChange, label);
  if (locked) { sw.disabled = true; sw.setAttribute('aria-disabled', 'true'); sw.classList.add('locked'); }
  const name = iconName || iconFor(label);
  const icon = name ? ico(name, 18) : null;
  if (icon) icon.classList.add('srow-ico');
  return h('div', { class: 'srow' },
    h('div', { class: 'srow-left' },
      icon,
      h('div', { class: 'srow-text' }, h('b', { text: label }), hint ? h('span', { class: 'muted small', text: hint }) : null)
    ),
    sw);
}
const card = (...kids) => h('div', { class: 'card scard' }, ...kids);
const cardHead = (title, hint, iconName) => {
  const name = iconName || iconFor(title);
  const icon = name ? ico(name, 20) : null;
  if (icon) icon.classList.add('scard-ico');
  return h('div', { class: 'scard-head' },
    h('div', { class: 'scard-title-row' }, icon, h('h3', { text: title })),
    hint ? h('p', { class: 'muted small', text: hint }) : null);
};

/* ================= tab builders: (panel, ctx) -> fill panel ================= */

/* ---- Profile & identity ---- */
function profileTab(panel, ctx) {
  const me = TW.me;
  /* picture */
  const prev = h('div', { class: 'avatar-preview' });
  const drawPrev = () => prev.replaceChildren(avatar(TW.me, 'xl'));
  drawPrev();
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', class: 'sr-only', tabindex: '-1', 'aria-label': t('Choose a profile picture') });
  const upBtn = btn(t('Upload picture'), { icon: 'plus', onclick: () => file.click() });
  const rmBtn = btn(t('Remove'), { cls: 'ghost', onclick: () => busy(rmBtn, async () => { TW.me = await api('DELETE', '/api/me/avatar'); apply(); toast(t('Picture removed')); }) });
  const apply = () => { drawPrev(); TW.renderUserPanel(); rmBtn.hidden = !TW.me.avatar; ctx.who.textContent = t('Signed in as @{name}', { name: T(TW.me.username) }); };
  file.addEventListener('change', () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    busy(upBtn, async () => {
      const cropped = await TW.cropImage(f, { aspect: 1, shape: 'circle', title: t('Crop profile picture'), outWidth: 512, outHeight: 512 });
      if (!cropped) return;
      TW.me = await TW.sendAvatar(cropped);
      apply();
      toast(t('Profile picture updated'));
    });
  });
  rmBtn.hidden = !me.avatar;
  const pic = h('div', { class: 'card pic-card' }, prev,
    h('div', { class: 'pic-meta' }, h('div', { class: 'scard-title-row' }, ico('camera', 20), h('h3', { text: t('Profile picture') })),
      h('p', { class: 'muted small', text: t('PNG, JPG, WebP or GIF up to 5 MB. GIFs stay animated.') }),
      h('div', { class: 'row', style: 'gap:8px;flex:none;flex-wrap:wrap' }, upBtn, rmBtn), file));

  /* banner */
  const bannerPrev = h('div', { class: 'banner-preview' });
  const drawBannerPrev = () => {
    bannerPrev.style.backgroundImage = TW.me.banner ? ('url(' + TW.me.banner + ')') : 'none';
    bannerPrev.style.backgroundColor = TW.me.banner ? 'transparent' : 'var(--color-raised)';
  };
  drawBannerPrev();
  const bannerFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', class: 'sr-only', tabindex: '-1', 'aria-label': t('Choose a profile banner') });
  const upBannerBtn = btn(t('Upload banner'), { icon: 'plus', onclick: () => bannerFile.click() });
  const rmBannerBtn = btn(t('Remove'), { cls: 'ghost', onclick: () => busy(rmBannerBtn, async () => {
    TW.me = await api('DELETE', '/api/me/banner');
    applyBanner();
    toast(t('Banner removed'));
  }) });
  const applyBanner = () => {
    drawBannerPrev();
    TW.renderUserPanel();
    rmBannerBtn.hidden = !TW.me.banner;
  };
  bannerFile.addEventListener('change', () => {
    const f = bannerFile.files && bannerFile.files[0]; bannerFile.value = ''; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast(t('Image must be 5 MB or smaller.'), 'error'); return; }
    busy(upBannerBtn, async () => {
      const cropped = await TW.cropImage(f, { aspect: 3, shape: 'rect', title: t('Crop profile banner'), outWidth: 900, outHeight: 300 });
      if (!cropped) return;
      TW.me = await TW.sendBanner(cropped);
      applyBanner();
      toast(t('Profile banner updated'));
    });
  });
  rmBannerBtn.hidden = !me.banner;
  const bannerCard = h('div', { class: 'card banner-card' }, bannerPrev,
    h('div', { class: 'pic-meta' }, h('div', { class: 'scard-title-row' }, ico('image', 20), h('h3', { text: t('Profile banner') })),
      h('p', { class: 'muted small', text: t('Shown behind your nameplate and profile header. PNG, JPG, WebP or GIF up to 5 MB.') }),
      h('div', { class: 'row', style: 'gap:8px;flex:none;flex-wrap:wrap' }, upBannerBtn, rmBannerBtn), bannerFile));

  /* name + username (needs the password) */
  const dn = h('input', { class: 'input', type: 'text', maxlength: 32, value: T(me.displayName || ''), placeholder: T(me.username), autocomplete: 'nickname' });
  const un = h('input', { class: 'input', type: 'text', maxlength: 20, value: T(me.username), autocapitalize: 'none', spellcheck: 'false', autocomplete: 'off' });
  const pw = h('input', { class: 'input', type: 'password', maxlength: 128, placeholder: t('Your current password'), autocomplete: 'current-password' });
  const fdn = field(t('Display name'), dn, t('Shown to friends and in chats. Leave empty to use your username.'));
  const fun = field(t('Username'), un, t('3–20 letters, numbers or underscores. Friends find you with this.'));
  const fpw = field(t('Current password'), pw, t('Required to change your display name or username.'));
  const idSave = h('button', { class: 'btn', type: 'submit' }, t('Save name'));
  const idForm = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const okU = fun.setError(/^[A-Za-z0-9_]{3,20}$/.test(un.value.trim()) ? '' : t('Use 3–20 letters, numbers or underscores'));
    const okD = fdn.setError(dn.value.trim().length <= 32 ? '' : t('At most 32 characters'));
    const okP = fpw.setError(pw.value ? '' : t('Enter your password to confirm'));
    if (!(okU && okD && okP)) return;
    idSave.disabled = true; const idle = TWM.busyBtn(idSave);
    try {
      TW.me = await api('PUT', '/api/me/profile', { displayName: dn.value.trim(), username: un.value.trim(), password: pw.value });
      pw.value = ''; apply(); TW.loadSocial().catch(() => {}); toast(t('Name updated'));
    } catch (ex) {
      if (/password/i.test(ex.message)) fpw.setError(ex.message); else if (/username/i.test(ex.message)) fun.setError(ex.message); else errToast(ex);
    } finally { idSave.disabled = false; idle(); }
  } }, h('div', { class: 'row' }, fdn, fun), fpw, h('div', {}, idSave));
  const idCard = card(cardHead(t('Name')), idForm);

  /* region, age (locked once chosen), status, playing, favorite games */
  const autoReg = (TW.detectRegion ? TW.detectRegion() : 'EU');
  const metaRegions = (TW.S && TW.S.meta && TW.S.meta.regions) || [];
  const region = selectEl(metaRegions, (me && me.region) || autoReg, t('Choose a region'));
  const calcAge = TW.calcAge || ((bd) => {
    if (!bd) return 0;
    const b = new Date(bd), today = new Date();
    if (isNaN(b.getTime())) return 0;
    let a = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a--;
    return a;
  });
  const bday = h('input', { class: 'input', type: 'date', value: me.birthDate || '' });
  const isDesktop = !!window.__TW_DESKTOP;
  const status = selectEl([['online', t('Online')], ['idle', t('Idle')], ['dnd', t('Do not disturb')], ['offline', t('Appear offline')]], TW.statusKey(me.status) || 'online');
  // "Currently playing" is a real game or nothing: pick it from the list (the desktop app also sets it automatically).
  const playing = gamePicker({ multi: false, value: T(me.playing || ''), placeholder: t('Not playing anything') });
  if (!isDesktop) {
    playing.style.opacity = '0.6';
    playing.style.pointerEvents = 'none';
  }
  const gp = gamePicker({ multi: true, value: me.favoriteGames || [] });
  const fr = field(t('Region'), region, me.region ? t('Your matchmaking region.') : t('Auto-detected based on your location: {0}', autoReg));
  const fa = field(t('Birthday'), bday, me.age ? t('Age: {0} (automatically updated each year)', me.age) : t('Must be 13 or older.'));
  const fs = field(t('Status'), status), fp = field(t('Currently playing'), playing, isDesktop ? t('Pick a game. It shows next to your name in friends lists.') : t('Requires desktop app to update currently playing.'));
  const save = h('button', { class: 'btn', type: 'submit' }, t('Save changes'));
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const bd = bday.value;
    const a = bd ? calcAge(bd) : me.age;
    const ok = [fr.setError(region.value ? '' : t('Choose a region')), fa.setError(a >= 13 && a <= 99 ? '' : t('Must be 13 or older (enter a valid birthday)'))].every(Boolean);
    if (!ok) return;
    const body = { region: region.value, favoriteGames: gp.value, playing: (isDesktop ? playing.value : (me.playing || '')), status: status.value, birthDate: bd, age: a, onboarded: true };
    await busy(save, async () => {
      await api('PUT', '/api/me/settings', body);
      TW.me = await api('GET', '/api/me'); TW.renderUserPanel(); toast(t('Settings saved')); document.dispatchEvent(new Event('tw:me'));
    });
  } }, h('div', { class: 'row' }, fr, fa), h('div', { class: 'row' }, fs, fp),
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('Favorite games') }), gp), h('div', {}, save));
  const general = card(cardHead(t('About you')), form);

  /* bio, play style, availability, ranks: injected by profile.js */
  const extras = h('div', { class: 'stack', style: 'gap:16px' });
  if (window.TWProfile) TWProfile.settings(extras);

  panel.append(h('div', { class: 'id-pair' }, pic, bannerCard), idCard, general, extras);
}

/* ---- Profile look: frame + the order of the sections on your profile ---- */
function lookTab(panel) {
  panel.append(framesCard(), effectsCard(), layoutCard());
}

/* ---- Connections: gamer tags, verified Steam / Discord, Steam import ---- */
function connectionsTab(panel) {
  panel.append(gamerTagsCard(), signinCard());
}

/* gamer tags: platform -> handle, saved with the preferences */
const PLATFORMS = ['Steam', 'Discord'];
function gamerTagsCard() {
  const tags = { ...(P.get().gamerTags || {}) };
  const list = h('div', { class: 'chips tag-list' });
  const platform = selectEl(PLATFORMS.map(p => [p, p]), PLATFORMS[0]);
  const handle = h('input', { class: 'input', type: 'text', maxlength: 32, placeholder: t('Your name on that platform'), 'aria-label': t('Gamer tag'), autocomplete: 'off' });
  const fh = field(t('Gamer tag'), handle);
  const persist = () => P.save({ gamerTags: tags }).catch(errToast);
  const draw = () => {
    list.replaceChildren(...(Object.keys(tags).length ? Object.entries(tags).map(([k, v]) =>
      h('span', { class: 'chip tag-chip' }, h('b', { text: k }), h('span', { class: 'tag-val', text: v }),
        h('button', { type: 'button', class: 'tag-x', 'aria-label': t('Remove {name}', { name: k }), onclick: () => { delete tags[k]; draw(); persist(); } }, TW.icon('x', 12))))
      : [h('span', { class: 'muted small', text: t('No gamer tags yet.') })]));
  };
  const add = btn(t('Add tag'), { icon: 'plus' });
  const submit = () => {
    const v = handle.value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (!fh.setError(v.length >= 2 && v.length <= 32 ? '' : t('Use 2–32 characters'))) return;
    if (!tags[platform.value] && Object.keys(tags).length >= 10) { fh.setError(t('You can add up to 10 tags')); return; }
    tags[platform.value] = v; handle.value = ''; fh.setError(''); draw(); persist(); toast(t('Gamer tag saved'));
  };
  add.addEventListener('click', submit);
  handle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  draw();
  return card(cardHead(t('Gamer tags'), t('Show friends where to find you on supported platforms: Steam and Discord.')), verifyBlock(), list,
    h('div', { class: 'row tag-form' }, field(t('Platform'), platform), fh), h('div', {}, add));
}

TWPrefs.addStrings('sv', {
  'Email': 'E-post', 'Email address': 'E-postadress', 'Confirmed': 'Bekräftad', 'Not confirmed yet': 'Inte bekräftad än', 'Waiting for confirmation: {email}': 'Väntar på bekräftelse: {email}',
  'Send confirmation again': 'Skicka bekräftelsen igen', 'Save email': 'Spara e-post', 'Confirmation sent. Check your inbox.': 'Bekräftelse skickad. Kolla din inkorg.',
  'Used to confirm it’s you and to reset your password.': 'Används för att bekräfta att det är du och för att återställa ditt lösenord.',
  'Your password': 'Ditt lösenord', 'Enter a valid email address.': 'Ange en giltig e-postadress.', 'Email isn’t set up on this server.': 'E-post är inte konfigurerat på den här servern.',
  'We send a link to confirm it. It also lets you reset your password.': 'Vi skickar en länk för att bekräfta den. Den låter dig också återställa lösenordet.',
  'Forgot password?': 'Glömt lösenordet?', 'Reset password': 'Återställ lösenord', 'Send link': 'Skicka länk', 'Change password': 'Byt lösenord', 'New password': 'Nytt lösenord',
  'Choose a new password': 'Välj ett nytt lösenord', 'Password changed': 'Lösenordet är bytt', 'You can log in with your new password now.': 'Du kan logga in med ditt nya lösenord nu.',
  'Enter the email on your account. If it is confirmed, we send a link to choose a new password.': 'Ange e-postadressen på ditt konto. Om den är bekräftad skickar vi en länk för att välja ett nytt lösenord.',
  'If that address belongs to an account, a reset link is on its way. Check your inbox (and spam).': 'Om adressen tillhör ett konto är en återställningslänk på väg. Kolla inkorgen (och skräpposten).',
  'Please confirm your email: we sent you a link.': 'Bekräfta din e-post: vi har skickat en länk.', 'Resend': 'Skicka igen'
});

/* Email on the account: confirmed with a link, used for password reset. Google/Discord sign-ups arrive already confirmed. */
function emailCard() {
  const body = h('div', { class: 'stack', style: 'gap:10px' });
  const c = card(cardHead(t('Email address'), t('Used to confirm it’s you and to reset your password.')), body);
  c.hidden = true;
  async function load() {
    let r; try { r = await api('GET', '/api/me/email'); } catch { return; }
    if (!r.canSend && !r.email) { c.hidden = true; return; }
    c.hidden = false;
    const kids = [];
    if (r.email) kids.push(h('div', { class: 'verify-row' }, h('b', { text: r.email }), r.verified ? h('span', { class: 'chip ok' }, TW.icon('check', 12), t('Confirmed')) : h('span', { class: 'chip', text: t('Not confirmed yet') })));
    if (r.pending) kids.push(h('p', { class: 'muted small', text: t('Waiting for confirmation: {email}', { email: r.pending }) }));
    if (r.canSend) {
      if (r.pending || (r.email && !r.verified)) {
        const again = btn(t('Send confirmation again'), { cls: 'small ghost' });
        again.addEventListener('click', () => busy(again, async () => { try { await api('POST', '/api/me/email/resend'); toast(t('Confirmation sent. Check your inbox.')); } catch (ex) { toast(T(ex.message), 'error'); } }));
        kids.push(again);
      }
      const em = h('input', { class: 'input', type: 'email', autocomplete: 'email', maxlength: 120, placeholder: 'you@example.com' });
      const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 128 });
      const save = btn(t('Save email'), { cls: 'small' });
      save.addEventListener('click', () => busy(save, async () => {
        try { await api('PUT', '/api/me/email', { email: em.value.trim(), password: pw.value }); toast(t('Confirmation sent. Check your inbox.')); em.value = ''; pw.value = ''; load(); }
        catch (ex) { toast(T(ex.message), 'error'); }
      }));
      kids.push(field(t('Email'), em), r.oauthOnly ? h('span') : field(t('Your password'), pw), h('div', {}, save));
    }
    body.replaceChildren(...kids);
  }
  load();
  return c;
}

/* Sign-in methods: Google / Apple / Discord linked to this account (sign in without a password). */
function signinCard() {
  const list = h('div', { class: 'stack', style: 'gap:10px' });
  const BRAND = { google: 'Google', apple: 'Apple', discord: 'Discord' };
  async function load() {
    let r; try { r = await api('GET', '/api/me/signin-methods'); } catch { return; }
    list.replaceChildren(...r.methods.map(m => {
      const row = h('div', { class: 'verify-row' }, h('b', { text: m.label }));
      if (m.linked) {
        const un = btn(t('Unlink'), { cls: 'small ghost' });
        un.addEventListener('click', () => busy(un, async () => { await api('DELETE', '/api/me/signin-methods/' + m.id); toast(t('Unlinked')); load(); }));
        row.append(h('span', { class: 'chip ok' }, TW.icon('check', 12), t('Linked')), un);
      } else if (!m.available) row.append(h('span', { class: 'muted small', text: t('Not set up on this server') }));
      else if (window.__TW_DESKTOP) row.append(h('span', { class: 'muted small', text: t('Link accounts from the website in your browser.') }));
      else row.append(btn(t('Link'), { cls: 'small', onclick: () => { location.href = '/auth/' + m.id + '/start?mode=link'; } }));
      return row;
    }));
  }
  load();
  addEventListener('focus', () => { if (list.isConnected) load(); });
  return card(cardHead(t('Sign-in methods'), t('Use these to sign in without a password.')), list);
}

/* Avatar frames: animated rings around your picture. Exclusive to RCKT (everyone can look; only RCKT can wear one). */
function framesCard() {
  const grid = h('div', { class: 'frame-grid', role: 'radiogroup', 'aria-label': t('Avatar frame') });
  const note = h('div');
  let current = TW.me.frame || '';
  const build = async () => {
    let r; try { r = await api('GET', '/api/frames'); } catch { return; }
    current = r.mine || '';
    const mk = (id, name) => {
      const sample = { ...TW.me, frame: id || null };
      const b = h('button', { type: 'button', class: 'frame-tile', role: 'radio', 'aria-checked': String(current === id), 'aria-label': name, disabled: !r.rckt && !!id }, TW.avatar(sample, 'lg'), h('span', { text: name }));
      b.addEventListener('click', () => busy(b, async () => {
        await api('PUT', '/api/me/frame', { frame: id });
        TW.me = await api('GET', '/api/me'); TW.renderUserPanel(); toast(t(id ? 'Frame applied' : 'Frame removed')); build();
      }));
      return b;
    };
    grid.replaceChildren(mk('', t('None')), ...r.frames.map(f => mk(f.id, t(f.name))));
    note.replaceChildren(...(r.rckt ? [] : [h('div', { class: 'frame-lock' }, h('b', { text: 'RCKT ' }), t('Avatar frames are exclusive to RCKT. Ask an admin for RCKT to wear one.'))]));
    grid.querySelectorAll('.frame-tile[disabled]').forEach(b => { b.style.opacity = '.75'; });
  };
  build();
  return card(cardHead(t('Avatar frame'), t('Animated rings around your profile picture. Shown next to your name everywhere.')), note, grid);
}

/* Profile effects: atmospheric animations on your profile sheet. Exclusive to RCKT. */
function effectsCard() {
  const grid = h('div', { class: 'frame-grid', role: 'radiogroup', 'aria-label': t('Profile effect') });
  const note = h('div');
  let current = (TW.me && TW.me.effect) || '';
  const build = async () => {
    let r; try { r = await api('GET', '/api/effects'); } catch { return; }
    current = r.mine || '';
    const mk = (id, name) => {
      const b = h('button', {
        type: 'button',
        class: 'frame-tile' + (current === id ? ' active' : ''),
        role: 'radio',
        'aria-checked': String(current === id),
        'aria-label': name,
        disabled: !r.rckt && !!id
      },
      h('div', {
        class: 'effect-preview-box ' + (id || 'none'),
        style: 'width:48px;height:48px;border-radius:12px;background:var(--color-surface);border:1px solid var(--color-border);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;'
      },
        id ? h('div', { class: 'profile-effect ' + id }) : ico('sparkles', 20)
      ),
      h('span', { text: name }));
      b.addEventListener('click', () => busy(b, async () => {
        await api('PUT', '/api/me/effect', { effect: id });
        TW.me = await api('GET', '/api/me');
        toast(t(id ? 'Effect applied' : 'Effect removed'));
        build();
      }));
      return b;
    };
    grid.replaceChildren(mk('', t('None')), ...(r.effects || []).map(e => mk(e.id, t(e.name))));
    note.replaceChildren(...(r.rckt ? [] : [h('div', { class: 'frame-lock' }, h('b', { text: 'RCKT ' }), t('Profile effects are exclusive to RCKT. Ask an admin for RCKT to wear one.'))]));
    grid.querySelectorAll('.frame-tile[disabled]').forEach(b => { b.style.opacity = '.75'; });
  };
  build();
  return card(cardHead(t('Profile effect'), t('Atmospheric particle effects shown on your profile card.')), note, grid);
}

/* Profile layout: the order of the sections on your profile, and which ones everybody else can see. */
const SECTION_NAMES = { bio: 'About me', games: 'Favorite games', tags: 'Gamer tags', play: 'How you play', when: 'When you play', reputation: 'Good teammate badge' };
function layoutCard() {
  const list = h('div', { class: 'stack layout-list', style: 'gap:8px' });
  let order = [], hidden = new Set(), saveT = 0, dragging = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api('PUT', '/api/me/profile-layout', { order, hidden: [...hidden] }).catch(errToast), 400); };
  const move = (id, d) => { const i = order.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(true); save(); };
  function draw(flip) {
    const paint = () => list.replaceChildren(...order.map((id, i) => {
      const row = h('div', { class: 'layout-row' + (hidden.has(id) ? ' off' : ''), draggable: 'true', 'data-key': 'l' + id, 'data-id': id },
        h('span', { class: 'layout-grip', 'aria-hidden': 'true', text: '⋮⋮' }), h('b', { class: 'layout-name', text: t(SECTION_NAMES[id] || id) }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Move up'), disabled: i === 0, onclick: () => move(id, -1) }, TW.icon('chev', 16)),
        h('button', { type: 'button', class: 'icon-btn flip', 'aria-label': t('Move down'), disabled: i === order.length - 1, onclick: () => move(id, 1) }, TW.icon('chev', 16)),
        TW.switchEl(!hidden.has(id), (on) => { if (on) hidden.delete(id); else hidden.add(id); row.classList.toggle('off', !on); save(); }, t('Show {name}', { name: t(SECTION_NAMES[id] || id) })));
      row.addEventListener('dragstart', (e) => { dragging = id; row.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ } });
      row.addEventListener('dragend', () => { dragging = null; row.classList.remove('drag'); });
      row.addEventListener('dragover', (e) => { if (dragging && dragging !== id) e.preventDefault(); });
      row.addEventListener('drop', (e) => { e.preventDefault(); if (!dragging || dragging === id) return; order.splice(order.indexOf(dragging), 1); order.splice(order.indexOf(id), 0, dragging); draw(true); save(); });
      return row;
    }));
    flip && window.TWM ? TWM.flip(list, '.layout-row', paint) : paint();
  }
  api('GET', '/api/me/profile-layout').then(r => { order = r.order; hidden = new Set(r.hidden); draw(); }).catch(() => {});
  return card(cardHead(t('Profile layout'), t('Drag sections (or use the arrows) to reorder them. Turn a section off to hide it from everyone else.')), list);
}

/* Steam: import the games you own (only ones we have in the catalog), with hours played. */
function steamImport(box) {
  const go = btn(t('Import my Steam games'), { cls: 'small', icon: 'plus' });
  go.addEventListener('click', () => busy(go, async () => {
    const r = await api('GET', '/api/verify/steam/library');
    if (r.needsKey) { toast(t('Steam API key not set up on this server. Contact the server admin.'), 'error'); return; }
    if (r.isPrivate) { toast(t('Your Steam game list is private. Set “Game details” to Public in Steam’s privacy settings, then try again.'), 'error'); return; }
    if (!r.games.length) { toast(t('None of your Steam games are in our catalog yet.'), 'error'); return; }
    const picked = new Set(r.games.filter(g => g.inFavorites).map(g => g.name));
    let close = () => {};
    const count = h('span', { class: 'muted small' });
    const paint = () => { count.textContent = t('{n} of {m} selected', { n: picked.size, m: r.max }); };
    const rows = r.games.map(g => {
      const b = h('button', { type: 'button', class: 'steam-row', role: 'checkbox', 'aria-checked': String(picked.has(g.name)) }, TW.gameThumb(g.name), h('span', { class: 'steam-name', text: T(g.name) }), h('span', { class: 'muted small', text: g.hours + ' h' }), TW.icon('check', 16));
      b.addEventListener('click', () => { if (picked.has(g.name)) picked.delete(g.name); else if (picked.size < r.max) picked.add(g.name); else { toast(t('You can have up to {m} favorite games.', { m: r.max }), 'error'); return; } b.setAttribute('aria-checked', String(picked.has(g.name))); paint(); });
      return b;
    });
    const save = btn(t('Add to my games'), { cls: 'primary' });
    save.addEventListener('click', () => busy(save, async () => {
      await api('POST', '/api/verify/steam/import', { games: [...picked] });
      TW.me = await api('GET', '/api/me'); toast(t('Games imported')); close();
    }));
    paint();
    close = TW.openSheet(t('Import from Steam'), h('div', { class: 'stack', style: 'gap:10px' }, h('p', { class: 'muted small', text: t('Pick up to 12. Hours played come from Steam and show on your profile.') }), count,
      h('div', { class: 'stack steam-list', style: 'gap:6px' }, rows), h('div', { class: 'sheet-actions' }, save)));
  }));
  box.append(h('div', { class: 'verify-row' }, h('div', { class: 'verify-plat' }, ico('steam', 18), h('b', { text: 'Steam' })), h('span', { class: 'muted small', text: t('Bring in the games you own, with hours played.') }), go));
}

/* Verified tags: sign in through Steam / Discord to prove the account is yours (a check mark on your profile). */
function verifyBlock() {
  const box = h('div', { class: 'stack verify-box', style: 'gap:10px' });
  const NAMES = { Steam: 'Steam', Discord: 'Discord' };
  async function load() {
    let prov, mine;
    try { [prov, mine] = await Promise.all([api('GET', '/api/verify/providers'), api('GET', '/api/verify/mine')]); } catch { return; }
    const have = new Map(mine.map(v => [v.platform, v]));
    const row = (platform, enabled) => {
      const v = have.get(platform);
      if (v) {
        const rm = btn(t('Unlink'), { cls: 'small ghost' });
        rm.addEventListener('click', () => busy(rm, async () => { await api('DELETE', '/api/verify/' + enc(platform)); toast(t('Unlinked')); load(); }));
        const acts = [rm];
        if (platform === 'Steam') {
          const syncBtn = btn(t('Sync name'), { cls: 'small ghost', onclick: () => busy(syncBtn, async () => {
            try {
              const res = await api('POST', '/api/verify/steam/sync');
              toast(t('Steam name updated to {name}', { name: res.handle }));
              load();
            } catch (e) { errToast(e); }
          }) });
          acts.unshift(syncBtn);
        }
        return h('div', { class: 'verify-row' },
          h('div', { class: 'verify-plat' }, ico(platform.toLowerCase(), 18), h('b', { text: platform })),
          h('span', { class: 'chip ok' }, TW.icon('check', 12), t('Verified')),
          h('span', { class: 'tag-val muted', text: T(v.handle) }),
          h('div', { class: 'verify-actions' }, ...acts));
      }
      if (!enabled) return h('div', { class: 'verify-row muted small' },
        h('div', { class: 'verify-plat' }, ico(platform.toLowerCase(), 18), h('b', { text: platform })),
        h('span', { text: t('Not set up on this server.') }));
      const go = btn(t('Verify {name}', { name: platform }), { cls: 'small', icon: 'check' });
      go.addEventListener('click', () => busy(go, async () => {
        const r = await api('POST', `/api/verify/${platform.toLowerCase()}/start`);
        toast(t('Finish signing in in your browser, then come back here.'));
        location.href = r.url;
      }));
      return h('div', { class: 'verify-row' },
        h('div', { class: 'verify-plat' }, ico(platform.toLowerCase(), 18), h('b', { text: platform })),
        h('span', { class: 'muted small', text: t('Prove it’s really your account.') }),
        go);
    };
    box.replaceChildren(h('div', { class: 'section-title', text: t('Verified accounts') }), row('Steam', prov.steam), row('Discord', prov.discord),
      h('p', { class: 'muted small', text: t('You sign in on Steam’s or Discord’s own site. We never see your password, only your public name.') }));
    if (have.has('Steam')) steamImport(box);
  }
  load();
  addEventListener('focus', () => { if (box.isConnected) load(); });   // coming back from the browser: show the new check mark
  return box;
}

/* ---- Appearance & theme ---- */
const SWATCHES = [   // [saved value, label, shown colour]; the first is the app's built-in indigo (the server's default value)
  ['#7c8cff', 'Indigo', '#4f5ee6'], ['#2f80ed', 'Blue', '#2f80ed'], ['#0e9aa7', 'Teal', '#0e9aa7'], ['#2e9e5b', 'Green', '#2e9e5b'],
  ['#7aa21a', 'Lime', '#7aa21a'], ['#e0a100', 'Amber', '#e0a100'], ['#e8590c', 'Orange', '#e8590c'], ['#d63a45', 'Red', '#d63a45'],
  ['#d6409f', 'Pink', '#d6409f'], ['#9b51e0', 'Purple', '#9b51e0'], ['#6e56cf', 'Violet', '#6e56cf'], ['#8a8f9c', 'Slate', '#8a8f9c']
];
/* Theme: colour preset or custom background, roundness, density, font. Saved on this device (js/theme.js). */
function themeCard() {
  const T = window.TWTheme; if (!T) return null;
  const tiles = h('div', { class: 'theme-tiles', role: 'radiogroup', 'aria-label': t('Theme') });
  const hexIn = h('input', { class: 'input', type: 'text', maxlength: 7, 'aria-label': t('Custom background colour'), placeholder: '#101820', autocomplete: 'off', spellcheck: 'false' });
  const pick = h('input', { type: 'color', class: 'color-pick', 'aria-label': t('Pick a background colour') });
  const radius = selectEl(Object.keys(T.RADII).map(k => [k, t({ square: 'Square', sharp: 'Sharp', default: 'Default', round: 'Round' }[k])]), T.get().radius);
  const density = selectEl(Object.keys(T.DENSITY).map(k => [k, t({ compact: 'Compact', default: 'Default', roomy: 'Roomy' }[k])]), T.get().density);
  const font = selectEl(Object.keys(T.FONTS).map(k => [k, t(T.FONTS[k].label)]), T.get().font);
  const entries = [...Object.keys(T.PRESETS).map(k => [k, t(T.PRESETS[k].label), T.swatch(k)]), ['custom', t('Custom'), null]];
  const buttons = entries.map(([key, label, sw]) => {
    const b = h('button', { type: 'button', class: 'theme-tile', role: 'radio', 'aria-label': label, onclick: () => T.set({ preset: key }) },
      h('span', { class: 'theme-prev', style: sw ? `background:${sw[0]}` : '' }, sw ? [h('i', { style: `background:${sw[1]}` }), h('i', { style: `background:${sw[2]}` })] : h('i', { class: 'custom-i', text: '+' })),
      h('span', { text: label }));
    b.dataset.key = key; tiles.append(b); return b;
  });
  const paint = () => {
    const s = T.get();
    buttons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.key === s.preset)));
    const c = /^#[0-9a-f]{6}$/i.test(s.custom) ? s.custom : '#101820';
    pick.value = c; if (document.activeElement !== hexIn) hexIn.value = c;
    customRow.hidden = s.preset !== 'custom';
  };
  const setCustom = (v) => { v = v.trim().toLowerCase(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/.test(v)) T.set({ preset: 'custom', custom: v }); };
  pick.addEventListener('input', () => setCustom(pick.value));
  hexIn.addEventListener('change', () => setCustom(hexIn.value));
  const customRow = h('div', { class: 'hex-row' }, pick, hexIn);
  radius.addEventListener('change', () => T.set({ radius: radius.value }));
  density.addEventListener('change', () => T.set({ density: density.value }));
  font.addEventListener('change', () => T.set({ font: font.value }));
  const reset = btn(t('Reset theme'), { cls: 'ghost small', onclick: () => { T.reset(); radius.value = 'default'; density.value = 'default'; font.value = 'system'; paint(); toast(t('Theme reset')); } });
  document.addEventListener('tw:theme', paint);
  paint();
  return card(cardHead(t('Theme'), t('Pick a look. Accent colour (below) works with every theme. Saved on this device.')), tiles, customRow,
    h('div', { class: 'theme-grid-row' }, field(t('Corners'), radius), field(t('Spacing'), density), field(t('Font'), font)),
    switchRow(t('Simple mode'), t('Hide explanatory text and keep only the controls.'), !!T.get().simple, (v) => T.set({ simple: v })), h('div', {}, reset));
}

function appearanceTab(panel) {
  const cur = () => String(P.get().accentColor || '').toLowerCase();
  const grid = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('Accent colour') });
  const items = [];
  const hex = h('input', { class: 'input', type: 'text', maxlength: 7, placeholder: '#7c8cff', 'aria-label': t('Custom colour'), autocomplete: 'off', spellcheck: 'false' });
  const prev = h('span', { class: 'hex-prev', 'aria-hidden': 'true' });
  const mark = () => {
    const c = cur(), known = SWATCHES.some(s => s[0] === c);
    items.forEach(({ b, val }) => { const on = c === val; b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (!known && val === SWATCHES[0][0]) ? 0 : -1; });
    if (!known) { hex.value = c; prev.style.background = c; } else { prev.style.background = ''; }
  };
  const pick = (val) => { P.save({ accentColor: val }).catch(errToast); hex.value = SWATCHES.some(s => s[0] === val) ? '' : val; mark(); };
  SWATCHES.forEach(([val, name, shown]) => {
    const b = h('button', { type: 'button', class: 'swatch', role: 'radio', 'aria-label': t(name), title: t(name), onclick: () => pick(val) }, TW.icon('check', 16));
    b.style.background = shown; grid.append(b); items.push({ b, val });
  });
  grid.addEventListener('keydown', (e) => {   // roving arrow keys
    const i = items.findIndex(x => x.b === document.activeElement); if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return; e.preventDefault(); const n = items[(i + d + items.length) % items.length]; n.b.focus(); pick(n.val);
  });
  const applyHex = () => {
    let v = hex.value.trim().toLowerCase(); if (v && v[0] !== '#') v = '#' + v;
    if (!/^#[0-9a-f]{6}$/.test(v)) { toast(t('Enter a colour like #7c8cff'), 'error'); return; }
    pick(v);
  };
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } });
  hex.addEventListener('input', () => { const v = hex.value.trim(); prev.style.background = /^#?[0-9a-f]{6}$/i.test(v) ? (v[0] === '#' ? v : '#' + v) : ''; });
  mark();
  const custom = h('div', { class: 'hex-row' }, prev, hex, btn(t('Apply'), { cls: 'ghost small', onclick: applyHex }));

  const reset = btn(t('Reset to 100%'), { cls: 'ghost small' });
  const size = slider({ min: 85, max: 140, step: 5, value: Math.round((P.get().fontScale || 1) * 100), label: t('Text size'), format: (v) => v + '%',
    onInput: (v) => P.applyScale(v / 100), onCommit: (v) => P.save({ fontScale: v / 100 }).catch(errToast) });
  reset.addEventListener('click', () => { size.set(100); P.save({ fontScale: 1 }).catch(errToast); });
  const sample = h('div', { class: 'card sample' }, h('b', { text: t('Preview') }), h('p', { class: 'muted', text: t('Text and colours update as you change them.') }),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;flex:none' }, h('span', { class: 'btn small', text: t('Button') }), h('span', { class: 'chip accent', text: t('Chip') })));

  const motion = selectEl([['system', t('Follow system')], ['on', t('Always on')], ['off', t('Off')]], TWM.motionPref());
  motion.addEventListener('change', () => { TWM.setMotionPref(motion.value); toast(motion.value === 'off' ? t('Animations off') : motion.value === 'on' ? t('Animations always on') : t('Animations follow your system')); });
  const clipCatch = window.__TW_DESKTOP ? switchRow(t('Instant 30s Clip Catcher (F8)'), t('Press F8 in any game to capture the last 30 seconds and upload it directly into chat.'), TWPrefs.get('clip_catcher', true), (v) => TWPrefs.save({ clip_catcher: v })) : null;
  const detect = window.__TW_DESKTOP ? switchRow(t('Detect the game I’m playing'), t('Shows the game you’re playing as your status. Only the game’s name is shared.'), TW.autoOn(),
    (v) => { try { localStorage.setItem('tw_autogame', v ? 'on' : 'off'); } catch { /* ignore */ } TW.applyAutoGame(); }) : null;

  panel.append(
    themeCard(),
    card(cardHead(t('Accent colour'), t('Used for buttons, highlights and links across the app.')), grid, custom),
    card(cardHead(t('Text size'), t('Make text larger or smaller everywhere in the app.')), size.el, h('div', {}, reset), sample),
    card(cardHead(t('Motion')), field(t('Animations'), motion, t('Use “Always on” if your system turns animations off.')),
      switchRow(t('Static profile pictures'), t('Show animated profile pictures as a still image. Helps on slower computers and phones.'), !!P.get().disablePfpAnimation,
        (v) => P.save({ disablePfpAnimation: v }).then(() => { toast(t('Saved')); setTimeout(() => location.reload(), 500); }).catch(errToast)),
      detect));
}

/* ---- Content & safety ---- */
function safetyTab(panel) {
  const prefs = P.get();
  const minor = TW.me.age > 0 && TW.me.age < 18;
  if (minor && prefs.nsfwFilter === false) P.save({ nsfwFilter: true }).catch(() => {});
  const filters = card(cardHead(t('Content filters')),
    switchRow(t('Hide 18+ / NSFW content'), minor ? t('Always on for accounts under 18.') : t('Blur or hide mature content in chats and profiles.'), minor ? true : prefs.nsfwFilter !== false,
      (v) => P.save({ nsfwFilter: v }).catch(errToast), minor),
    switchRow(t('Chat safety filter'), t('Mask profanity in messages you receive.'), prefs.profanityFilter !== false, (v) => P.save({ profanityFilter: v }).catch(errToast)));

  // Read receipts: shared both ways, so turning it off also hides other people's "Seen" from you.
  const receiptRow = h('div');
  api('GET', '/api/me/receipts').then(r => receiptRow.replaceChildren(switchRow(t('Read receipts'), t('Let friends see when you’ve read their message. If you turn this off, you won’t see their “Seen” either.'), r.on,
    (v) => api('PUT', '/api/me/receipts', { on: v }).catch(errToast)))).catch(() => {});
  filters.append(receiptRow);

  const list = h('div', { class: 'stack', style: 'gap:8px' });
  const draw = (rows) => {
    TWM.flip(list, '.arow', () => list.replaceChildren(...(rows.length ? rows.map(b => {
      const u = { ...b, avatarColor: b.color };
      const un = btn(t('Unblock'), { cls: 'small ghost' });
      un.addEventListener('click', () => busy(un, async () => {
        await api('DELETE', '/api/me/blocks/' + enc(b.id));
        rows = rows.filter(x => x.id !== b.id); draw(rows); toast(t('Unblocked {name}', { name: nm(u) }));
      }));
      const when = b.blockedAt ? new Date(b.blockedAt) : null;
      return h('div', { class: 'arow', 'data-key': 'b' + b.id }, avatar(u, 'md'),
        h('div', { class: 'meta' }, h('b', { text: nm(u) }), h('span', { class: 'muted small', text: '@' + T(b.username) + (when && !isNaN(when) ? ' · ' + when.toLocaleDateString() : '') })),
        h('div', { class: 'act' }, un));
    }) : [emptyState(t('No blocked users'), t('People you block can’t message you and won’t appear in your friends list.'))])));
  };
  list.append(h('span', { class: 'spinner', role: 'status', 'aria-label': t('Loading') }));
  api('GET', '/api/me/blocks').then(draw).catch((e) => list.replaceChildren(emptyState(t('That didn’t load'), e.message)));
  panel.append(filters, card(cardHead(t('Blocked users')), list));
}

/* ---- Language ---- */
const LANGS = [['en', 'English', 'English'], ['sv', 'Svenska', 'Swedish']];
function languageTab(panel) {
  const group = h('div', { class: 'lang-grid', role: 'radiogroup', 'aria-label': t('Language') });
  const cards = LANGS.map(([code, native, english]) => {
    const b = h('button', { type: 'button', class: 'lang-card', role: 'radio', lang: code, 'aria-checked': String(P.language() === code), onclick: () => choose(code) },
      h('span', { class: 'lang-name', text: native }), h('span', { class: 'muted small', text: english }), TW.icon('check', 18));
    group.append(b); return { code, b };
  });
  const choose = (code) => {
    if (code === P.language()) return;
    cards.forEach(c => c.b.setAttribute('aria-checked', String(c.code === code)));
    P.setLanguage(code);                                     // re-renders the app in the new language right away
    P.save({ language: code }).catch(errToast);
  };
  panel.append(card(cardHead(t('Language'), t('Choose the language for menus and buttons. Messages and names are never translated.')), group));
}

/* ---- Account & security ---- */
function accountTab(panel) {
  const out = btn(t('Log out'), { cls: 'danger', onclick: async () => { try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ } TW.loggedOut(); } });
  const legalRow = h('div', { class: 'srow-legal', style: 'display:flex;gap:12px;align-items:center;margin-top:8px;font-size:12px;color:var(--color-text-3);' },
    h('a', { href: '#', text: t('Terms of Service'), onclick: (e) => { e.preventDefault(); if (TW.showTermsOfService) TW.showTermsOfService(); } }),
    h('span', { text: '·' }),
    h('a', { href: '#', text: t('Privacy Policy'), onclick: (e) => { e.preventDefault(); if (TW.showPrivacyPolicy) TW.showPrivacyPolicy(); } }),
    h('span', { text: '·' }),
    h('a', { href: '#', text: t('Cookie Policy'), onclick: (e) => { e.preventDefault(); if (TW.showCookiePolicy) TW.showCookiePolicy(); } })
  );
  panel.append(window.TWAccount ? TWAccount.card() : h('span'), emailCard(),
    h('div', { class: 'card scard logout-card' }, h('div', {}, h('div', { class: 'scard-title-row' }, ico('logout', 20), h('h3', { text: t('Log out') })), h('p', { class: 'muted small', text: t('You’ll need your password to come back.') })), out),
    legalRow);
}

/* Folding rows: every settings card becomes one line (its title) that opens when you click it. Works on cards built by other modules too (RCKT, password, ...). */
const FOLD_SKIP = '.pic-card, .banner-card, .logout-card, .sample';
function foldify(panel, openFirst) {
  const cards = [...panel.querySelectorAll('.card')].filter(c => !c.dataset.fold && !c.matches(FOLD_SKIP) && !c.parentElement.closest('.card') && c.querySelector('h3'));
  if (!cards.length) return;
  const total = panel.querySelectorAll('.card.fold').length + cards.length;
  for (const card of cards) {
    const h3 = card.querySelector('h3');
    let headBlock = h3; while (headBlock.parentElement !== card) headBlock = headBlock.parentElement;
    const hint = headBlock === h3 ? [] : [...headBlock.children].filter(x => x !== h3 && !x.contains(h3));
    const rest = [...card.children].filter(x => x !== headBlock);
    const body = h('div', { class: 'fold-body' }, ...hint, ...rest);
    const iconName = card.dataset.icon || iconFor(h3.textContent);
    const iconEl = iconName ? ico(iconName, 18) : null;
    if (iconEl) iconEl.classList.add('fold-icon');
    const chevEl = ico('chev');
    chevEl.classList.add('fold-chev');
    const head = h('button', { class: 'fold-head', type: 'button', 'aria-expanded': 'false' },
      h('span', { class: 'fold-title-wrap' }, iconEl, h('span', { text: h3.textContent })),
      chevEl);
    const open = !!openFirst && total <= 1;                    // tabs with a single card (Connections, Language) show it; everything else starts as one line each
    const set = (on) => { card.classList.toggle('open', on); head.setAttribute('aria-expanded', String(on)); body.hidden = !on; };
    head.addEventListener('click', () => set(!card.classList.contains('open')));
    card.style.padding = ''; card.style.gap = '';
    card.replaceChildren(head, body); card.classList.add('fold'); card.dataset.fold = '1'; set(open);
  }
}


/* ---- Voice & audio settings tab ---- */
function voiceTab(panel) {
  const card = h('section', { class: 'scard' });
  card.append(h('h3', { text: t('Audio devices') }),
    h('p', { class: 'muted small', text: t('Choose your microphone and speaker or headphones for voice chat.') }));

  const micSelect = h('select', { class: 'input' }, h('option', { value: '' }, t('Default microphone')));
  const spkSelect = h('select', { class: 'input' }, h('option', { value: '' }, t('Default speaker / headphones')));
  const meterFill = h('div', { style: 'height:100%;width:0%;background:var(--color-primary,#4f5ee6);border-radius:4px;transition:width 0.08s ease;' });
  const meterBar = h('div', { style: 'height:8px;background:var(--color-line-2,#26262c);border-radius:4px;overflow:hidden;margin-top:6px;' }, meterFill);

  async function loadDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      const curMic = localStorage.getItem('tw_audio_mic') || '';
      const curSpk = localStorage.getItem('tw_audio_speaker') || '';

      micSelect.replaceChildren(
        h('option', { value: '' }, t('Default microphone')),
        ...mics.map(m => h('option', { value: m.deviceId, selected: m.deviceId === curMic }, m.label || t('Microphone ({id})', { id: m.deviceId.slice(0, 5) })))
      );

      spkSelect.replaceChildren(
        h('option', { value: '' }, t('Default speaker / headphones')),
        ...speakers.map(s => h('option', { value: s.deviceId, selected: s.deviceId === curSpk }, s.label || t('Headphones ({id})', { id: s.deviceId.slice(0, 5) })))
      );
    } catch {}
  }

  let testStream = null, testMeterTimer = null;
  async function testMic(deviceId) {
    if (testStream) { testStream.getTracks().forEach(t => t.stop()); testStream = null; }
    if (testMeterTimer) { clearInterval(testMeterTimer); testMeterTimer = null; }
    try {
      testStream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false });
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(testStream);
      const an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      testMeterTimer = setInterval(() => {
        if (!card.isConnected) {
          if (testStream) testStream.getTracks().forEach(t => t.stop());
          clearInterval(testMeterTimer);
          return;
        }
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const pct = Math.min(100, Math.round((peak / 128) * 100 * 2.5));
        meterFill.style.width = pct + '%';
      }, 100);
    } catch {
      meterFill.style.width = '0%';
    }
  }

  micSelect.addEventListener('change', () => {
    localStorage.setItem('tw_audio_mic', micSelect.value);
    testMic(micSelect.value);
  });
  spkSelect.addEventListener('change', () => {
    localStorage.setItem('tw_audio_speaker', spkSelect.value);
  });

  loadDevices();
  testMic(localStorage.getItem('tw_audio_mic') || '');

  card.append(
    h('div', { class: 'field', style: 'margin-top:14px;' },
      h('label', { class: 'label', text: t('Microphone (Input)') }),
      micSelect,
      h('div', { style: 'margin-top:6px;' },
        h('span', { class: 'muted small', text: t('Input level test:') }),
        meterBar
      )
    ),
    h('div', { class: 'field', style: 'margin-top:14px;' },
      h('label', { class: 'label', text: t('Headphones / Speakers (Output)') }),
      spkSelect,
      h('p', { class: 'muted small', text: t('Select where you want to hear incoming voice audio.') })
    )
  );

  panel.append(card);
}

/* ================= page ================= */
const TABS = [['profile', 'Profile & identity', 'profile', profileTab], ['look', 'Profile look', 'look', lookTab], ['voice', 'Voice & audio', 'mic', voiceTab], ['connections', 'Connections', 'connections', connectionsTab],
  ['appearance', 'Appearance & theme', 'appearance', appearanceTab], ['safety', 'Content & safety', 'safety', safetyTab], ['language', 'Language', 'language', languageTab], ['account', 'Account & security', 'account', accountTab]];
let SL = null;

function build() {
  const who = h('p', { class: 'muted', text: t('Signed in as @{name}', { name: T(TW.me.username) }) });
  const pill = h('span', { class: 'slide-pill', 'aria-hidden': 'true' });
  const links = TABS.map(([key, label, icon]) => h('a', { class: 'snav', href: '#/settings/' + key, 'data-tab': key }, ico(icon), h('span', { class: 't', text: t(label) })));
  const nav = h('nav', { class: 'settings-nav', 'aria-label': t('Settings sections') }, pill, ...links);
  const body = h('div', { class: 'settings-body' });
  const root = h('div', { class: 'page settings-page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: t('Settings') }), who)),
    h('div', { class: 'settings-layout' }, nav, body));
  const panels = {}, order = TABS.map(x => x[0]);
  const ctx = { who };
  let cur = null, ready = false;

  function place(animate) {
    const a = links.find(l => l.getAttribute('aria-current') === 'page');
    if (!a || !a.offsetWidth) { pill.style.opacity = '0'; return; }
    pill.style.transition = animate && !TWM.reduce() ? '' : 'none';
    pill.style.opacity = '1'; pill.style.width = a.offsetWidth + 'px'; pill.style.height = a.offsetHeight + 'px';
    pill.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (a.scrollIntoView && nav.scrollWidth > nav.clientWidth) { const l = a.offsetLeft - 12; nav.scrollTo({ left: Math.max(0, l), behavior: animate ? 'smooth' : 'instant' }); }
  }
  async function go(tab, first) {
    const prev = cur ? order.indexOf(cur) : -1, idx = order.indexOf(tab);
    cur = tab;
    links.forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    place(!first && ready);
    if (!panels[tab]) {
      const def = TABS[idx];
      const p = h('section', { class: 'settings-panel', 'aria-label': t(def[1]), hidden: true });
      panels[tab] = p; body.append(p);
      try {
        def[3](p, ctx);
      } catch (err) {
        console.error('Settings tab failed:', tab, err);
      }
      document.dispatchEvent(new CustomEvent('tw:settings-tab', { detail: { tab, root: p } }));
      foldify(p, tab === 'connections' || tab === 'language');
      if (window.MutationObserver) { let q = 0; new MutationObserver(() => { clearTimeout(q); q = setTimeout(() => foldify(p, false), 30); }).observe(p, { childList: true, subtree: true }); }   // cards that arrive later (profile extras, RCKT, ...)
    }
    Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== cur; });
    if (!first && prev !== idx) TWM.slide(panels[tab], idx > prev ? 1 : -1);
  }
  window.addEventListener('resize', () => { if (root.isConnected) place(false); });
  // text size / language changes resize the links; keep the highlight glued to the active one
  const ro = window.ResizeObserver ? new ResizeObserver(() => place(false)) : null;
  if (ro) links.forEach(l => ro.observe(l));
  return { root, go, place, markReady() { ready = true; place(false); }, dispose() { if (ro) ro.disconnect(); } };
}

async function view(tab) {
  const key = TABS.some(x => x[0] === tab) ? tab : 'profile';
  if (SL && SL.root.isConnected) { SL.go(key); return; }       // same page, just another tab: switch in place
  if (SL) SL.dispose();
  SL = build();
  TW.show(SL.root);
  SL.go(key, true);
  requestAnimationFrame(() => SL && SL.markReady());
  setTimeout(() => SL && SL.markReady(), 80);                   // rAF doesn't run in hidden windows
}
document.addEventListener('tw:lang', () => { if (SL) SL.dispose(); SL = null; });

window.TWSettings = { view };
})();
