/* Looking for group board (#/lfg). Short-lived posts: "need 2 for ranked tonight". */
(() => {
'use strict';
const TW = window.TW, TWPages = window.TWPages;
const { h, icon, api, enc, toast, T, nm, avatar, btn, busy, field, openSheet, confirmSheet, selectEl, gamePicker, switchEl, emptyState, stagger, show, stale, gameThumb } = TW;
const t = TW.t;

TWPrefs.addStrings('sv', {
  'Looking for group': 'Söker lag', 'Find people to play with right now. Posts disappear on their own.': 'Hitta folk att spela med just nu. Inläggen försvinner av sig själva.',
  'Post': 'Lägg upp', 'Post a request': 'Lägg upp en förfrågan', 'All games': 'Alla spel', 'Any mode': 'Alla lägen', 'Any region': 'Alla regioner',
  'Casual': 'Avslappnat', 'Competitive': 'Tävlingsinriktat', 'Mine only': 'Bara mina', 'Game': 'Spel', 'Mode': 'Läge', 'Region': 'Region',
  'Players needed': 'Spelare som behövs', 'Open for': 'Öppet i', '{n} hour': '{n} timme', '{n} hours': '{n} timmar', 'Note': 'Anteckning',
  'e.g. Ranked tonight, chill vibes, need a healer': 't.ex. Ranked ikväll, lugn stämning, behöver en healer', 'Uses a microphone': 'Använder mikrofon',
  'Mic': 'Mik', 'Attach one of your groups (optional)': 'Bifoga en av dina grupper (valfritt)', 'No group': 'Ingen grupp',
  'Pick a game first.': 'Välj ett spel först.', 'Choose a region.': 'Välj en region.', 'Your request is live.': 'Din förfrågan är publicerad.',
  'I’m in': 'Jag är med', 'Withdraw': 'Dra tillbaka', 'Full': 'Full', 'Closed': 'Stängd', 'Close': 'Stäng', 'Delete': 'Radera', 'Your post': 'Ditt inlägg',
  '{n} of {m} joined': '{n} av {m} har gått med', '{n} left': '{n} kvar', 'ends in {x}': 'slutar om {x}', 'less than a minute': 'mindre än en minut',
  'Nobody is looking for a group': 'Ingen söker lag', 'Be the first: post what you want to play and when.': 'Bli först: skriv vad du vill spela och när.',
  'Nothing matches those filters.': 'Inget matchar de filtren.', 'Delete this post?': 'Radera det här inlägget?', 'People who joined will no longer see it.': 'De som gått med kommer inte längre att se det.',
  'Close this post?': 'Stänga det här inlägget?', 'It will be hidden from the board.': 'Det döljs från tavlan.', 'Joined': 'Gick med', 'Nobody yet': 'Ingen än',
  'You said you’re in. {name} can see it and message you.': 'Du har sagt att du är med. {name} kan se det och skriva till dig.', 'Group': 'Grupp',
  'Attach one of your groups: everyone who joins is added to it automatically once all spots are taken.': 'Bifoga en av dina grupper: alla som går med läggs till i den automatiskt när alla platser är tagna.',
  'You were added to {name} so you can start playing.': 'Du lades till i {name} så att du kan börja spela.',
  'Everyone who joined was added to the group.': 'Alla som gick med lades till i gruppen.', 'You’re in the group now. Say hi!': 'Du är med i gruppen nu. Säg hej!',
  'This group will take everyone who joins once it’s full.': 'Gruppen tar emot alla som går med när den är full.'
});

const MODES = () => [['casual', t('Casual')], ['competitive', t('Competitive')]];
const HOURS = [1, 2, 4, 8];
const hrLabel = (n) => n === 1 ? t('{n} hour', { n }) : t('{n} hours', { n });
const left = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return t('less than a minute');
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
};

TWPages.lfg = async (_, tok) => {
  const f = { game: '', mode: '', region: '', mine: false };
  const gameF = gamePicker({ multi: false, value: '', anyLabel: t('All games'), placeholder: t('All games') });
  const modeF = selectEl(MODES(), '', t('Any mode'));
  const regionF = selectEl(TW.S.meta.regions || [], '', t('Any region'));
  const mineF = h('label', { class: 'lfg-mine' }, switchEl(false, (v) => { f.mine = v; load(); }, t('Mine only')), h('span', { text: t('Mine only') }));
  const board = h('div', { class: 'lfg-board' });
  const filters = h('div', { class: 'lfg-filters card' }, gameF, modeF, regionF, mineF);
  show(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: t('Looking for group') }), h('p', { class: 'muted', text: t('Find people to play with right now. Posts disappear on their own.') })),
      btn(t('Post'), { cls: 'primary', icon: 'plus', onclick: openPost })), filters, board));

  let posts = [], sig = '', first = true;
  gameF.addEventListener('change', () => { f.game = gameF.value; load(); });
  modeF.addEventListener('change', () => { f.mode = modeF.value; load(); });
  regionF.addEventListener('change', () => { f.region = regionF.value; load(); });

  function card(p) {
    const filled = p.filled, free = Math.max(0, p.slots - filled);
    const full = !p.open && !p.mine ? false : free === 0;
    const state = free === 0 ? t('Full') : t('{n} left', { n: free });
    const head = h('div', { class: 'lfg-top' }, gameThumb(p.game),
      h('div', { class: 'lfg-title' }, h('h3', { text: T(p.game) }),
        h('div', { class: 'chips' },
          h('span', { class: 'chip ' + (p.mode === 'competitive' ? 'accent' : ''), text: p.mode === 'competitive' ? t('Competitive') : t('Casual') }),
          h('span', { class: 'chip', text: T(p.region) }),
          p.mic ? h('span', { class: 'chip', title: t('Uses a microphone') }, icon('mic', 14), t('Mic')) : null)),
      h('span', { class: 'lfg-slots' + (free === 0 ? ' full' : ''), text: state }));
    const who = h('button', { class: 'lfg-who', type: 'button', onclick: () => TW.openProfile(p.poster.id) }, avatar(p.poster, 'sm', true), h('span', { text: p.mine ? t('Your post') : nm(p.poster) }));
    const note = p.note ? h('p', { class: 'lfg-note', text: T(p.note) }) : null;
    const group = p.group ? h('a', { class: 'chip accent lfg-group', href: '#/group/' + enc(p.group.id), text: T(p.group.name) }) : null;
    const addedNote = p.group && free === 0
      ? h('p', { class: 'lfg-added small', text: p.inGroup ? (p.mine ? t('Everyone who joined was added to the group.') : t('You’re in the group now. Say hi!')) : t('This group will take everyone who joins once it’s full.') }) : null;
    const joined = h('div', { class: 'lfg-joined' },
      p.responders.length ? h('div', { class: 'lfg-faces' }, p.responders.map(r => h('button', { type: 'button', onclick: () => TW.openProfile(r.id), title: nm(r), 'aria-label': nm(r) }, avatar(r, 'sm', true)))) : null,
      h('span', { class: 'muted small', text: p.mine && !p.responders.length ? t('Nobody yet') : t('{n} of {m} joined', { n: filled, m: p.slots }) }));
    const actions = h('div', { class: 'lfg-actions' });
    if (p.mine) {
      const close = btn(t('Close'), { cls: 'small ghost', onclick: () => confirmSheet(t('Close this post?'), t('It will be hidden from the board.'), t('Close'), async () => { await api('POST', '/api/lfg/' + p.id + '/close'); load(); }) });
      const del = btn(t('Delete'), { cls: 'small danger', onclick: () => confirmSheet(t('Delete this post?'), t('People who joined will no longer see it.'), t('Delete'), async () => { await api('DELETE', '/api/lfg/' + p.id); load(); }) });
      actions.append(close, del);
    } else if (p.responded) {
      const b = btn(t('Withdraw'), { cls: 'small ghost' });
      b.onclick = () => busy(b, async () => { await api('DELETE', '/api/lfg/' + p.id + '/join'); load(); });
      actions.append(b);
    } else {
      const b = btn(full || free === 0 ? t('Full') : t('I’m in'), { cls: 'small primary' });
      if (free === 0) b.disabled = true;
      else b.onclick = () => busy(b, async () => { await api('POST', '/api/lfg/' + p.id + '/join'); toast(t('You said you’re in. {name} can see it and message you.', { name: nm(p.poster) })); load(); });
      actions.append(b);
    }
    return h('article', { class: 'card lfg-card' + (p.mine ? ' mine' : ''), 'data-key': 'p' + p.id },
      head, note, h('div', { class: 'lfg-meta' }, who, group, h('span', { class: 'muted small lfg-time', text: t('ends in {x}', { x: left(p.expiresAt) }) })), joined, addedNote, actions);
  }

  function draw() {
    const nodes = posts.length ? posts.map(card) : [emptyState(f.game || f.mode || f.region || f.mine ? t('Nothing matches those filters.') : t('Nobody is looking for a group'),
      f.game || f.mode || f.region || f.mine ? '' : t('Be the first: post what you want to play and when.'))];
    board.replaceChildren(...nodes);
    if (first) { stagger(board); first = false; }
  }
  async function load() {
    const q = TW.qs({ game: f.game, mode: f.mode, region: f.region, mine: f.mine ? 'true' : '' });
    let r; try { r = await api('GET', '/api/lfg' + q); } catch (e) { if (!stale(tok)) toast(e.message, 'error'); return; }
    if (stale(tok)) return;
    const s = JSON.stringify(r.map(p => [p.id, p.filled, p.open, p.responded, p.responders.length, p.slots]));
    posts = r;
    if (s !== sig || true) { sig = s; draw(); }
  }
  await load();
  TW.S.chatTimer = setInterval(() => { if (!document.hidden && !document.querySelector('.overlay')) load().catch(() => {}); }, 3000);

  function openPost() {
    let close = () => {};
    const gp = gamePicker({ multi: false, value: f.game || '', placeholder: t('Game') });
    const mode = selectEl(MODES(), 'casual');
    const region = selectEl(TW.S.meta.regions || [], TW.me.region || '', t('Region'));
    const slots = selectEl([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [String(n), String(n)]), '1');
    const hours = selectEl(HOURS.map(n => [String(n), hrLabel(n)]), '2');
    const note = h('input', { class: 'input', type: 'text', maxlength: 140, placeholder: t('e.g. Ranked tonight, chill vibes, need a healer'), autocomplete: 'off' });
    let mic = false;
    const micRow = h('label', { class: 'lfg-mine' }, switchEl(false, (v) => { mic = v; }, t('Uses a microphone')), h('span', { text: t('Uses a microphone') }));
    const mine = (TW.S.mine || []);
    const grp = selectEl([['', t('No group')], ...mine.map(g => [String(g.id), T(g.name)])], '');
    const go = btn(t('Post'), { cls: 'primary' });
    const body = h('form', { class: 'stack', style: 'gap:14px', onsubmit: (e) => e.preventDefault() },
      field(t('Game'), gp), h('div', { class: 'row2' }, field(t('Mode'), mode), field(t('Region'), region)),
      h('div', { class: 'row2' }, field(t('Players needed'), slots), field(t('Open for'), hours)),
      field(t('Note'), note), micRow, mine.length ? field(t('Attach one of your groups (optional)'), grp, t('Attach one of your groups: everyone who joins is added to it automatically once all spots are taken.')) : null,
      h('div', { class: 'sheet-actions' }, go));
    go.onclick = () => busy(go, async () => {
      if (!gp.value) return toast(t('Pick a game first.'), 'error');
      if (!region.value) return toast(t('Choose a region.'), 'error');
      await api('POST', '/api/lfg', { game: gp.value, mode: mode.value, region: region.value, slots: +slots.value, hours: +hours.value, note: note.value.trim(), mic, groupId: grp.value ? +grp.value : null });
      close(); toast(t('Your request is live.')); load();
    });
    close = openSheet(t('Post a request'), body);
  }
};
})();
