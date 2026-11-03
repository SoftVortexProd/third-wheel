/* Settings page: left sidebar of tabs (profile, appearance, safety, language, account).
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
  account: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
};
function ico(name, size = 20) {
  const s = document.createElementNS(SVGNS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', PATHS[name] || ''); s.append(p);
  return s;
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
function switchRow(label, hint, on, onChange, locked) {
  const sw = switchEl(on, onChange, label);
  if (locked) { sw.disabled = true; sw.setAttribute('aria-disabled', 'true'); sw.classList.add('locked'); }
  return h('div', { class: 'srow' }, h('div', { class: 'srow-text' }, h('b', { text: label }), hint ? h('span', { class: 'muted small', text: hint }) : null), sw);
}
const card = (...kids) => h('div', { class: 'card scard' }, ...kids);
const cardHead = (title, hint) => h('div', {}, h('h3', { text: title }), hint ? h('p', { class: 'muted small', text: hint }) : null);

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
    busy(upBtn, async () => { TW.me = await TW.sendAvatar(await TW.prepAvatar(f)); apply(); toast(t('Profile picture updated')); });
  });
  rmBtn.hidden = !me.avatar;
  const pic = h('div', { class: 'card pic-card' }, prev,
    h('div', { class: 'pic-meta' }, h('h3', { text: t('Profile picture') }),
      h('p', { class: 'muted small', text: t('PNG, JPG, WebP or GIF up to 5 MB. GIFs stay animated.') }),
      h('div', { class: 'row', style: 'gap:8px;flex:none;flex-wrap:wrap' }, upBtn, rmBtn), file));

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
  const region = selectEl(TW.S.meta.regions, me.region || '', t('Choose a region'));
  const ageLocked = me.age > 0;
  const age = h('input', { class: 'input', type: 'number', min: 13, max: 99, value: me.age || '', inputmode: 'numeric', disabled: ageLocked });
  const status = selectEl([['online', t('Online')], ['idle', t('Idle')], ['dnd', t('Do not disturb')], ['offline', t('Appear offline')]], TW.statusKey(me.status) || 'online');
  const playing = h('input', { class: 'input', type: 'text', maxlength: 40, value: T(me.playing || ''), placeholder: t('What are you playing right now?'), autocomplete: 'off' });
  suggestInput(playing, () => TW.S.meta.games.map(g => [gname(g), gname(g)]));
  const gp = gamePicker({ multi: true, value: me.favoriteGames || [] });
  const fr = field(t('Region'), region);
  const fa = field(t('Age'), age, ageLocked ? t('Your age can only be changed by an admin.') : t('Must be 13 or older.'));
  const fs = field(t('Status'), status), fp = field(t('Currently playing'), playing, t('Shown next to your name in friends lists.'));
  const save = h('button', { class: 'btn', type: 'submit' }, t('Save changes'));
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const a = parseInt(age.value, 10);
    const ok = [fr.setError(region.value ? '' : t('Choose a region')), ageLocked || fa.setError(a >= 13 && a <= 99 ? '' : t('Enter an age from 13 to 99'))].every(Boolean);
    if (!ok) return;
    const body = { region: region.value, favoriteGames: gp.value, playing: playing.value.trim(), status: status.value, onboarded: true };
    if (!ageLocked) body.age = a;     // once an age is set only an admin can change it, so never send it again
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

  panel.append(pic, idCard, general, extras, gamerTagsCard());
}

/* gamer tags: platform -> handle, saved with the preferences */
const PLATFORMS = ['Steam', 'Discord', 'Xbox', 'PlayStation', 'Nintendo', 'Epic Games', 'Riot ID', 'Battle.net', 'EA app', 'Other'];
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
  return card(cardHead(t('Gamer tags'), t('Show friends where to find you: Steam, Discord, Xbox and more.')), list,
    h('div', { class: 'row tag-form' }, field(t('Platform'), platform), fh), h('div', {}, add));
}

/* ---- Appearance & theme ---- */
const SWATCHES = [   // [saved value, label, shown colour]; the first is the app's built-in indigo (the server's default value)
  ['#7c8cff', 'Indigo', '#4f5ee6'], ['#2f80ed', 'Blue', '#2f80ed'], ['#0e9aa7', 'Teal', '#0e9aa7'], ['#2e9e5b', 'Green', '#2e9e5b'],
  ['#7aa21a', 'Lime', '#7aa21a'], ['#e0a100', 'Amber', '#e0a100'], ['#e8590c', 'Orange', '#e8590c'], ['#d63a45', 'Red', '#d63a45'],
  ['#d6409f', 'Pink', '#d6409f'], ['#9b51e0', 'Purple', '#9b51e0'], ['#6e56cf', 'Violet', '#6e56cf'], ['#8a8f9c', 'Slate', '#8a8f9c']
];
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
  const detect = window.__TW_DESKTOP ? switchRow(t('Detect the game I’m playing'), t('Shows the game you’re playing as your status. Only the game’s name is shared.'), TW.autoOn(),
    (v) => { try { localStorage.setItem('tw_autogame', v ? 'on' : 'off'); } catch { /* ignore */ } TW.applyAutoGame(); }) : null;

  panel.append(
    card(cardHead(t('Accent colour'), t('Used for buttons, highlights and links across the app.')), grid, custom),
    card(cardHead(t('Text size'), t('Make text larger or smaller everywhere in the app.')), size.el, h('div', {}, reset), sample),
    card(cardHead(t('Motion')), field(t('Animations'), motion, t('Use “Always on” if your system turns animations off.')), detect));
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
  panel.append(window.TWAccount ? TWAccount.card() : h('span'),
    h('div', { class: 'card scard logout-card' }, h('div', {}, h('h3', { text: t('Log out') }), h('p', { class: 'muted small', text: t('You’ll need your password to come back.') })), out));
}

/* ================= page ================= */
const TABS = [['profile', 'Profile & identity', 'profile', profileTab], ['appearance', 'Appearance & theme', 'appearance', appearanceTab],
  ['safety', 'Content & safety', 'safety', safetyTab], ['language', 'Language', 'language', languageTab], ['account', 'Account & security', 'account', accountTab]];
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
      def[3](p, ctx);
      document.dispatchEvent(new CustomEvent('tw:settings-tab', { detail: { tab, root: p } }));
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
