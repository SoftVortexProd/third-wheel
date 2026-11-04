/* Profile features: per-game rank/role, play style, availability, recommendations. Loaded after app.js; uses window.TW.
   Everything user-supplied is shown through textContent (T() decodes the server's HTML entities). */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, icon, api, enc, toast, T, btn, busy, field, selectEl, suggestInput, emptyState } = TW;

/* ---- vocabularies (the server validates against the same lists) ---- */
const TAGS = ['chill', 'tryhard', 'mic', 'no-mic', 'talkative', 'quiet', 'beginner-friendly', 'team-player'];
const TAG_LABEL = { chill: 'Chill', tryhard: 'Tryhard', mic: 'Uses a mic', 'no-mic': 'No mic', talkative: 'Talkative', quiet: 'Quiet', 'beginner-friendly': 'Beginner friendly', 'team-player': 'Team player' };
const LANGS = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Polish', 'Turkish', 'Russian', 'Arabic', 'Hindi', 'Japanese', 'Korean', 'Chinese', 'Filipino', 'Indonesian', 'Swedish'];
const MODES = [['casual', 'Casual'], ['competitive', 'Competitive'], ['both', 'A bit of both']];
const MODE_LABEL = { casual: 'Casual', competitive: 'Competitive', both: 'Casual & competitive' };
// Day parts in the owner's local time. PART_START mirrors the server.
const PARTS = [
  { label: 'Morning', hours: '6–12', word: 'mornings' }, { label: 'Afternoon', hours: '12–18', word: 'afternoons' },
  { label: 'Evening', hours: '18–24', word: 'evenings' }, { label: 'Late night', hours: '0–6', word: 'late at night' }
];
const PART_START = [6, 12, 18, 0];

let META = null;
const meta = async () => META || (META = await api('GET', '/api/gamedetails/meta'));
const tzOffset = () => -new Date().getTimezoneOffset();   // minutes east of UTC
function tzLabel() {
  const o = tzOffset(), a = Math.abs(o);
  let name = ''; try { name = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  return `UTC${o < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}${name ? ' · ' + name : ''}`;
}
const words = (a) => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const section = (title, ...kids) => h('div', { class: 'section' }, h('div', { class: 'section-title', text: title }), ...kids);

/* ---- toggle chips ---- */
function toggleChip(text, on, onChange, label) {
  const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!on), 'aria-label': label || text }, text);
  b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); onChange(v); });
  return b;
}
function toggleGroup(options, selected, max, labelOf, aria) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': aria });
  for (const o of options) {
    wrap.append(toggleChip(labelOf(o), selected.includes(o), (v) => {
      const i = selected.indexOf(o);
      if (v && i < 0) {
        if (selected.length >= max) { toast(`Pick up to ${max}.`); wrap.querySelectorAll('.chip').forEach((c, j) => { if (options[j] === o) c.setAttribute('aria-pressed', 'false'); }); return; }
        selected.push(o);
      } else if (!v && i >= 0) selected.splice(i, 1);
    }));
  }
  return wrap;
}

/* ---- play style + availability form (settings and onboarding share it) ---- */
function styleForm(init = {}) {
  const av = init.availability || {};
  const st = {
    bio: T(init.bio || ''), mode: MODES.some(m => m[0] === init.playMode) ? init.playMode : 'both',
    tags: [...(init.tags || [])], langs: [...(init.languages || [])],
    wd: [0, 1, 2, 3].map(i => !!(av.weekdays || init.weekdays || [])[i]), we: [0, 1, 2, 3].map(i => !!(av.weekends || init.weekends || [])[i])
  };
  const bio = h('textarea', { class: 'textarea', maxlength: 160, rows: 2, placeholder: 'A line about how you play (optional)' });
  bio.value = st.bio; bio.addEventListener('input', () => { st.bio = bio.value; });
  const mode = selectEl(MODES, st.mode); mode.addEventListener('change', () => { st.mode = mode.value; });

  const langWrap = h('div', { class: 'chips' });
  const langIn = h('input', { class: 'input', type: 'text', maxlength: 20, placeholder: 'Add a language', 'aria-label': 'Add a language', autocomplete: 'off' });
  suggestInput(langIn, () => LANGS.filter(l => !st.langs.includes(l)).map(l => [l, l]));
  const drawLangs = () => {
    langWrap.replaceChildren(...st.langs.map(l => {
      const c = h('button', { type: 'button', class: 'chip accent removable', 'aria-label': `Remove ${l}` }, l, icon('x', 12));
      c.addEventListener('click', () => { st.langs.splice(st.langs.indexOf(l), 1); drawLangs(); });
      return c;
    }));
    langIn.hidden = st.langs.length >= 6;
  };
  langIn.addEventListener('input', () => {
    const hit = LANGS.find(l => l.toLowerCase() === langIn.value.trim().toLowerCase());
    if (hit && !st.langs.includes(hit) && st.langs.length < 6) { st.langs.push(hit); langIn.value = ''; drawLangs(); }
  });
  drawLangs();

  const availRow = (label, arr) => h('div', { class: 'avail-row' }, h('span', { class: 'avail-label', text: label }),
    h('div', { class: 'chips', role: 'group', 'aria-label': label + ' availability' },
      PARTS.map((p, i) => toggleChip(`${p.label} ${p.hours}`, arr[i], (v) => { arr[i] = v; }, `${label}: ${p.label} (${p.hours})`))));

  const el = h('div', { class: 'style-form stack', style: 'gap:16px' },
    field('About you', bio, 'Up to 160 characters.'),
    h('div', { class: 'row' }, field('How you play', mode)),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Your vibe' }), toggleGroup(TAGS, st.tags, 8, t => TAG_LABEL[t], 'Play style tags')),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Languages' }), langWrap, langIn),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'When you’re usually free' }),
      availRow('Weekdays', st.wd), availRow('Weekends', st.we),
      h('p', { class: 'muted small', text: `Times are in your local time (${tzLabel()}). Only these coarse day parts are shown to others.` })));
  return { el, value: () => ({ bio: st.bio.trim(), playMode: st.mode, tags: [...st.tags], languages: [...st.langs], tz: tzOffset(), weekdays: [...st.wd], weekends: [...st.we] }) };
}
const saveExtras = (x) => api('PUT', '/api/me/profile-extras', x);

/* ---- "usually online" (observed) and declared availability, as plain words ---- */
function onlineSummary(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== 8) return null;
  const shift = Math.round(tzOffset() / 180);                      // UTC 3-hour blocks -> viewer's local blocks
  const local = Array.from({ length: 8 }, (_, b) => blocks[(((b - shift) % 8) + 8) % 8]);
  const level = PART_START.map(s => Math.max(local[Math.floor(s / 3)], local[(Math.floor(s / 3) + 1) % 8]));
  const top = Math.max(...level);
  if (top < 2) return null;
  return words(PARTS.filter((_, i) => level[i] === top).slice(0, 2).map(p => p.word));
}
function declaredSummary(av) {
  if (!av || !av.set) return null;
  const f = (arr) => PARTS.filter((_, i) => arr[i]).map(p => p.word);
  const wd = f(av.weekdays), we = f(av.weekends);
  if (wd.join() === we.join()) return wd.length ? `Free ${words(wd)}` : null;
  return [wd.length ? `weekdays: ${words(wd)}` : '', we.length ? `weekends: ${words(we)}` : ''].filter(Boolean).join(' · ').replace(/^./, c => 'Free ' + c);
}

/* ---- settings: game details + play style cards ---- */
let settingsSlot = null, gameHolder = null;
function gameCard(m, d) {
  const favs = TW.me.favoriteGames || [];
  const metaGames = (m && m.games) || {};
  // Only games that support competitive ranks or squad roles
  const eligible = favs.filter(g => {
    const info = metaGames[g];
    return info && ((info.ranks && info.ranks.length) || (info.roles && info.roles.length));
  });

  const rows = eligible.map(g => {
    const info = metaGames[g] || { ranks: [], roles: [] };
    const cur = (d.games || []).find(x => x.game === g) || { rank: '', role: '' };
    const hasRanks = info.ranks && info.ranks.length > 0;
    const hasRoles = info.roles && info.roles.length > 0;

    let rank = null;
    if (hasRanks) {
      rank = h('input', { class: 'input', type: 'text', maxlength: 24, value: T(cur.rank), placeholder: 'Rank', 'aria-label': `${T(g)} rank`, autocomplete: 'off' });
      suggestInput(rank, () => info.ranks.map(x => [x, x]));
    }

    let role = null;
    if (hasRoles) {
      role = h('input', { class: 'input', type: 'text', maxlength: 24, value: T(cur.role), placeholder: hasRanks ? 'Role' : 'Playstyle / Role', 'aria-label': `${T(g)} role`, autocomplete: 'off' });
      suggestInput(role, () => info.roles.map(x => [x, x]));
    }

    const fields = [rank, role].filter(Boolean);
    const el = h('div', { class: 'gd-row' + (fields.length === 1 ? ' gd-single' : '') }, h('b', { class: 'gd-name', text: T(g) }), ...fields);
    return { g, rank, role, el };
  });

  const save = btn('Save game details', { icon: 'check' });
  save.addEventListener('click', () => busy(save, async () => {
    await api('PUT', '/api/me/game-details', {
      games: rows.map(r => ({
        game: r.g,
        rank: r.rank ? r.rank.value.trim() : '',
        role: r.role ? r.role.value.trim() : ''
      }))
    });
    toast('Game details saved');
  }));

  const note = favs.length && !rows.length
    ? 'None of your selected favorite games use competitive ranks or squad roles (like Valorant, CS2, or Overwatch). You can add competitive games in Settings to set ranks and roles.'
    : 'Pick your favorite games above and save, then add your rank and role for each here.';

  return h('div', { class: 'card', style: 'padding:24px;display:flex;flex-direction:column;gap:14px' },
    h('div', {}, h('h3', { text: 'Rank & role per game' }), h('p', { class: 'muted small', text: 'Shown on your profile for games with competitive ranks or squad roles (like “Valorant · Diamond · Controller”).' })),
    ...(rows.length ? rows.map(r => r.el) : [h('p', { class: 'muted', text: note })]),
    rows.length ? h('div', {}, save) : null);
}
async function refreshGames() {
  if (!gameHolder || !gameHolder.isConnected) return;
  try { const [m, d] = await Promise.all([meta(), api('GET', '/api/me/profile-extras')]); gameHolder.replaceChildren(gameCard(m, d)); } catch { /* keep what is there */ }
}
async function settings(slot) {
  settingsSlot = slot;
  let m, d;
  try { [m, d] = await Promise.all([meta(), api('GET', '/api/me/profile-extras')]); } catch { return; }
  if (settingsSlot !== slot) return;
  gameHolder = h('div');
  gameHolder.append(gameCard(m, d));
  const sf = styleForm(d);
  const save = btn('Save play style', { icon: 'check' });
  save.addEventListener('click', () => busy(save, async () => { await saveExtras(sf.value()); toast('Play style saved'); }));
  const seen = onlineSummary(d.online && d.online.blocks);
  slot.replaceChildren(gameHolder, h('div', { class: 'card', style: 'padding:24px;display:flex;flex-direction:column;gap:16px' },
    h('div', {}, h('h3', { text: 'Play style & availability' }), h('p', { class: 'muted small', text: 'Used to match you with groups and people who play like you.' })),
    sf.el,
    seen ? h('p', { class: 'muted small', text: `We’ve noticed you’re usually online in the ${seen} (your time).` }) : null,
    h('div', {}, save)));
}
document.addEventListener('tw:me', refreshGames);   // favorite games changed in the main settings form

/* ---- profile sheet: bio, vibe, ranks, availability ---- */
async function profileDetails(slot, id) {
  let d;
  try { d = await api('GET', `/api/users/${enc(id)}/details`); } catch { return; }
  const kids = [];
  if (d.bio) kids.push(h('p', { class: 'profile-bio', text: T(d.bio) }));
  const vibe = [MODE_LABEL[d.playMode] || null, ...(d.tags || []).map(t => TAG_LABEL[t] || t)].filter(Boolean);
  if (vibe.length) kids.push(section('How they play', h('div', { class: 'chips' }, vibe.map((t, i) => h('span', { class: 'chip' + (i === 0 ? ' accent' : ''), text: t })))));
  // Gamer tags (Steam, Discord, ...): tap one to copy the handle.
  // verified ones come first (with a check mark); a typed tag for the same platform is hidden so nobody can fake a verified one
  const verified = (d.verified || []).filter(v => v.platform && v.handle);
  const vp = new Set(verified.map(v => v.platform.toLowerCase()));
  const tagList = [...verified.map(v => [v.platform, T(v.handle), true]), ...Object.entries(d.gamerTags || {}).filter(([k, v]) => k && v && !vp.has(k.toLowerCase())).map(([k, v]) => [k, v, false])];
  if (tagList.length) kids.push(section(TW.t('Gamer tags'), h('div', { class: 'chips tag-list' }, tagList.map(([k, v, ok]) =>
    h('button', { class: 'chip tag-chip' + (ok ? ' verified' : ''), type: 'button', title: ok ? TW.t('Verified') + ' · ' + TW.t('Copy') : TW.t('Copy'), 'aria-label': `${k}: ${v}${ok ? '. ' + TW.t('Verified') : ''}. ${TW.t('Copy')}`, onclick: async () => {
      try { await navigator.clipboard.writeText(String(v)); TW.toast(TW.t('Copied {name}', { name: k })); } catch { TW.toast(`${k}: ${v}`); }
    } }, ok ? TW.icon('check', 12) : null, h('b', { text: k }), h('span', { class: 'tag-val', text: v }))))));
  if ((d.languages || []).length) kids.push(h('p', { class: 'muted small', text: 'Speaks ' + words(d.languages) }));
  const seen = onlineSummary(d.online && d.online.blocks), free = declaredSummary(d.availability);
  if (seen || free) kids.push(section('When they play', ...[seen ? `Usually online in the ${seen} (your time)` : null, free ? `${free} (their time)` : null].filter(Boolean).map(t => h('p', { class: 'avail-line', text: t }))));
  // Ranks and roles: upgrade the plain favorite-game chips in place ("Valorant · Diamond · Controller").
  const by = new Map((d.games || []).map(g => [g.game, g]));
  const fav = slot.parentElement && slot.parentElement.querySelector('.favgames');
  if (fav && by.size) fav.querySelectorAll('.chip').forEach(c => {
    const g = by.get(c.textContent); if (!g) return;
    c.textContent = [T(g.game), T(g.rank), T(g.role)].filter(Boolean).join(' · '); c.classList.add('accent');
  });
  if (!kids.length) return;
  slot.replaceChildren(...kids);
  if (!TWM.reduce()) slot.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: TWM.EASE });
}

/* ---- recommendations ---- */
const reasonChips = (reasons) => h('div', { class: 'reasons' }, (reasons || []).map(r => h('span', { class: 'chip reason', text: r })));
async function groupRecs(slot, dead) {
  let recs; try { recs = await api('GET', '/api/recommend/groups'); } catch { return; }
  if (dead() || !recs.length) return;
  const row = h('div', { class: 'rec-row stagger' }, recs.map(r => h('div', { class: 'rec-item' }, TW.groupCard(r.group), reasonChips(r.reasons))));
  TW.stagger(row);
  slot.replaceChildren(section('Recommended for you', h('p', { class: 'muted small', text: 'Based on your games, region, age and when you play.' }), row));
}
async function peopleRecs(slot, dead) {
  let recs; try { recs = await api('GET', '/api/recommend/people'); } catch { return; }
  if (dead() || !recs.length) return;
  const list = h('div', { class: 'stack stagger', style: 'gap:10px' }, recs.map(r => {
    const p = r.person;
    const add = btn('Add friend', { cls: 'small', icon: 'plus' });
    add.addEventListener('click', (e) => { e.stopPropagation(); busy(add, async () => {
      await api('POST', '/api/friends/request', { username: p.username });
      add.replaceWith(h('span', { class: 'chip ok' }, icon('check', 12), 'Requested')); toast('Friend request sent'); TW.loadSocial().catch(() => {});
    }); });
    const item = h('div', { class: 'rec-person', tabindex: '0', role: 'button', 'aria-label': `View ${TW.nm(p)}’s profile` }, TW.personRow(p, { big: true, action: add }), reasonChips(r.reasons));
    item.addEventListener('click', (e) => { if (!e.target.closest('.btn')) TW.openProfile(p.id); });
    item.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === item) { e.preventDefault(); TW.openProfile(p.id); } });
    return item;
  }));
  TW.stagger(list);
  slot.replaceChildren(section('People you may like', h('p', { class: 'muted small', text: 'Players who share your games, region and play times.' }), list));
}

/* ---- "when are you online": ping while the page is open and visible (the server records it at most every ~10 minutes) ---- */
let lastPing = 0;
async function ping() {
  if (!TW.me || document.hidden || Date.now() - lastPing < 9.5 * 60e3) return;
  lastPing = Date.now();
  try { await api('POST', '/api/me/ping'); } catch { /* not important */ }
}
setInterval(ping, 60e3); document.addEventListener('visibilitychange', ping); setTimeout(ping, 5000);

window.TWProfile = { styleForm, saveExtras, settings, profileDetails, groupRecs, peopleRecs };
})();
