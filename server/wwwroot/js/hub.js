/* Sidebar pages: Messages, Discover, My games. Loaded after app.js; uses window.TW and registers routes in TWPages. */
(() => {
'use strict';
const TW = window.TW, TWPages = window.TWPages;
const { h, icon, api, enc, toast, T, nm, avatar, btn, busy, openSheet, emptyState, stagger, show, stale, go, gamePicker, gameThumb, openProfile } = TW;
const t = TW.t;

TWPrefs.addStrings('sv', {
  'Your direct messages with friends.': 'Dina privata meddelanden med vänner.', 'New message': 'Nytt meddelande', 'Search conversations': 'Sök i konversationer',
  'No conversations yet': 'Inga konversationer än', 'Add friends, then click one to start chatting.': 'Lägg till vänner och klicka på en för att börja chatta.',
  'No matches': 'Inga träffar', 'Message deleted': 'Meddelandet är raderat', 'Attachment': 'Bilaga', 'You': 'Du', 'Choose a friend': 'Välj en vän',
  'You have no friends to message yet.': 'Du har inga vänner att skriva till än.', 'now': 'nu',
  'Discover': 'Upptäck', 'Groups and players picked for you.': 'Grupper och spelare utvalda för dig.', 'Trending now': 'Populärt just nu',
  'Busy groups you aren’t in yet.': 'Aktiva grupper du inte är med i än.', '{n} messages this week': '{n} meddelanden den här veckan',
  'Nothing to discover yet': 'Inget att upptäcka än', 'Add a few games and join a group, and we’ll start suggesting people and groups.': 'Lägg till några spel och gå med i en grupp så börjar vi föreslå människor och grupper.',
  'Fullscreen': 'Helskärm', 'Exit fullscreen': 'Avsluta helskärm', 'Fullscreen isn’t available here. Try F11.': 'Helskärm är inte tillgängligt här. Testa F11.', 'Seen': 'Sedd', 'Sent': 'Skickat',
  'Static profile pictures': 'Stillbilder som profilbild', 'Show animated profile pictures as a still image. Helps on slower computers and phones.': 'Visa animerade profilbilder som stillbild. Hjälper på långsammare datorer och telefoner.',
  'Read receipts': 'Läskvitton', 'Let friends see when you’ve read their message. If you turn this off, you won’t see their “Seen” either.': 'Låt vänner se när du har läst deras meddelande. Stänger du av det ser du inte heller deras “Sedd”.',
  'More': 'Mer', 'Account': 'Konto', 'You haven’t joined any groups yet.': 'Du har inte gått med i några grupper än.', 'Reports': 'Rapporter',
  'Copy': 'Kopiera', 'Copied {name}': 'Kopierade {name}',
  'Verified accounts': 'Verifierade konton', 'Verified': 'Verifierad', 'Unlink': 'Koppla bort', 'Unlinked': 'Bortkopplad', 'Verify {name}': 'Verifiera {name}',
  'Not set up on this server.': 'Inte konfigurerat på den här servern.', 'Prove it’s really your account.': 'Bevisa att det verkligen är ditt konto.',
  'Finish signing in in your browser, then come back here.': 'Slutför inloggningen i webbläsaren och kom sedan tillbaka hit.',
  'You sign in on Steam’s or Discord’s own site. We never see your password, only your public name.': 'Du loggar in på Steams eller Discords egen sida. Vi ser aldrig ditt lösenord, bara ditt publika namn.',
  'Pinned': 'Fästa', 'Pinned messages': 'Fästa meddelanden', 'Pin message': 'Fäst meddelande', 'Unpin message': 'Lossa meddelande', 'Search': 'Sök', 'Search messages': 'Sök meddelanden',
  'Search this conversation': 'Sök i den här konversationen', 'Type at least 2 letters.': 'Skriv minst 2 bokstäver.', 'No messages found.': 'Inga meddelanden hittades.',
  'Nothing is pinned yet.': 'Inget är fäst än.', 'Use the pin button on a message.': 'Använd nålen på ett meddelande.', 'Message pinned': 'Meddelandet fästes', 'Message unpinned': 'Meddelandet lossades',
  'Load earlier messages': 'Ladda tidigare meddelanden', 'Voice message': 'Röstmeddelande', 'Record a voice message': 'Spela in ett röstmeddelande', 'Recording a voice message': 'Spelar in ett röstmeddelande',
  'Recording…': 'Spelar in…', 'Send voice message': 'Skicka röstmeddelande', 'Cancel': 'Avbryt', 'That was too short.': 'Det var för kort.', 'That recording is too large.': 'Inspelningen är för stor.',
  'Voice messages need a secure connection (https) or the desktop app.': 'Röstmeddelanden kräver en säker anslutning (https) eller skrivbordsappen.',
  'Couldn’t use the microphone. Check that it is allowed.': 'Kunde inte använda mikrofonen. Kontrollera att den är tillåten.',
  'Open in browser': 'Öppna i webbläsaren', 'Download': 'Ladda ner', 'This video can’t play inside the app.': 'Den här videon kan inte spelas i appen.',
  'Theme': 'Tema', 'Pick a look. Accent colour (below) works with every theme. Saved on this device.': 'Välj ett utseende. Accentfärgen (nedan) fungerar med alla teman. Sparas på den här enheten.',
  'Custom': 'Eget', 'Custom background colour': 'Egen bakgrundsfärg', 'Pick a background colour': 'Välj en bakgrundsfärg', 'Square': 'Fyrkantig', 'Sharp': 'Skarp', 'Default': 'Standard', 'Round': 'Rund',
  'Compact': 'Tät', 'Roomy': 'Rymlig', 'Corners': 'Hörn', 'Spacing': 'Avstånd', 'Font': 'Typsnitt', 'Reset theme': 'Återställ tema', 'Theme reset': 'Temat återställdes',
  'Dark': 'Mörkt', 'Dim': 'Dämpat', 'Midnight': 'Midnatt', 'Forest': 'Skog', 'Plum': 'Plommon', 'Light': 'Ljust', 'Sand': 'Sand', 'System': 'System', 'Humanist': 'Humanistisk', 'Rounded': 'Rundad', 'Serif': 'Serif', 'Mono': 'Mono',
  'My games': 'Mina spel', 'The games you play, your ranks, your groups and the friends who play with you.': 'Spelen du spelar, dina rank, dina grupper och vännerna som spelar med dig.',
  'Add a game': 'Lägg till ett spel', 'Remove {game}': 'Ta bort {game}', 'Edit ranks': 'Redigera rank', 'No groups for this game yet': 'Inga grupper för det här spelet än',
  'Find groups': 'Hitta grupper', 'Your groups': 'Dina grupper', 'Friends who play this': 'Vänner som spelar det här', 'No friends play this yet': 'Inga vänner spelar det här än',
  '{n} playing now': '{n} spelar nu', '{n} friends': '{n} vänner', '1 friend': '1 vän', 'You haven’t added any games yet': 'Du har inte lagt till några spel än',
  'Search for a game above to get started.': 'Sök efter ett spel ovan för att komma igång.', 'Saved': 'Sparat'
});

const ago = (iso) => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return t('now'); if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd'; return d.toLocaleDateString();
};
const head = (title, sub, action) => h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null), action || null);
const section = (title, sub, ...kids) => h('section', { class: 'section hub-section' }, h('div', { class: 'section-title', text: title }), sub ? h('p', { class: 'muted small', text: sub }) : null, ...kids);

/* ---------- Messages ---------- */
function snippet(c) {
  if (c.deleted) return t('Message deleted');
  let x = T(c.text || '');
  if (/^\[gif:/.test(x)) x = 'GIF';
  if (!x && c.hasFile) x = t('Attachment');
  return (c.fromMe ? t('You') + ': ' : '') + x;
}

TWPages.messages = async (_, tok) => {
  const search = h('input', { class: 'input', type: 'search', placeholder: t('Search conversations'), 'aria-label': t('Search conversations'), autocomplete: 'off', maxlength: 40 });
  const list = h('div', { class: 'stack conv-list', style: 'gap:8px' });
  const newBtn = btn(t('New message'), { icon: 'plus', onclick: openNew });
  show(h('div', { class: 'page' }, head(t('Messages'), t('Your direct messages with friends.'), newBtn), h('div', { class: 'searchbox search-query', style: 'display:block' }, h('span', { class: 'ico' }, icon('search', 18)), search), list));
  let convs = [], unread = {}, first = true;

  function draw() {
    const q = search.value.trim().toLowerCase();
    const rows = convs.filter(c => !q || nm(c.peer).toLowerCase().includes(q) || T(c.peer.username).toLowerCase().includes(q));
    const items = rows.map(c => {
      const n = (unread[c.peer.id] && unread[c.peer.id].n) || 0;
      return h('a', { class: 'conv' + (n ? ' unread' : ''), href: '#/dm/' + enc(c.peer.id), 'data-key': 'c' + c.peer.id, 'aria-label': nm(c.peer) + (n ? ', ' + n + ' unread' : '') },
        avatar(c.peer, 'md', true),
        h('div', { class: 'meta' }, h('div', { class: 'top' }, h('b', { text: nm(c.peer) }), h('time', { class: 'muted small', text: ago(c.createdAt) })),
          h('span', { class: 'snippet', text: snippet(c) })),
        n ? h('span', { class: 'conv-badge', text: n > 9 ? '9+' : String(n) }) : null);
    });
    TW.stagger ? null : null;
    const nodes = items.length ? items : [emptyState(q ? t('No matches') : t('No conversations yet'), q ? '' : t('Add friends, then click one to start chatting.'))];
    if (first) { list.replaceChildren(...nodes); stagger(list); first = false; } else list.replaceChildren(...nodes);
  }
  async function load() {
    const [c, s] = await Promise.all([api('GET', '/api/messages/conversations'), api('GET', '/api/notifications/summary')]);
    if (stale(tok)) return; convs = c; unread = s.dm || {}; draw();
  }
  search.addEventListener('input', draw);
  await load();
  TW.S.chatTimer = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 3000);   // cleared automatically when you leave the page

  function openNew() {
    let close = () => {};
    const friends = [...TW.S.friends].sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || nm(a).localeCompare(nm(b)));
    const rows = friends.map(f => { const a = TW.personRow(f, { big: true, href: '#/dm/' + enc(f.id) }); a.addEventListener('click', () => close()); return a; });
    close = openSheet(t('New message'), rows.length ? h('div', { class: 'stack', style: 'gap:8px' }, h('p', { class: 'muted small', text: t('Choose a friend') }), ...rows) : emptyState(t('You have no friends to message yet.'), ''));
  }
};

/* Unread total on the sidebar's Messages link (the notification summary is already polled by the app; this just reads it). */
(function messagesBadge() {
  let last = -1;
  async function refresh() {
    if (!TW.me || document.hidden) return;
    const targets = [...document.querySelectorAll('.nav-main a[href="#/messages"], .bn-item[href="#/messages"] .bn-ico')]; if (!targets.length) return;
    let s; try { s = await api('GET', '/api/notifications/summary'); } catch { return; }
    const n = Object.values(s.dm || {}).reduce((a, x) => a + (x.n || 0), 0);
    for (const link of targets) {
      let b = link.querySelector('.nav-badge');
      if (!n) { if (b) b.remove(); continue; }
      if (!b) { b = h('span', { class: 'nav-badge' }); link.append(b); }
      b.textContent = n > 9 ? '9+' : String(n);
      if (n !== last) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    }
    last = n;
  }
  setInterval(refresh, 4000); document.addEventListener('visibilitychange', refresh); setTimeout(refresh, 1500);
})();

/* ---------- Discover ---------- */
TWPages.discover = async (_, tok) => {
  const recG = h('div'), trend = h('div'), recP = h('div');
  const page = h('div', { class: 'page' }, head(t('Discover'), t('Groups and players picked for you.')), recG, trend, recP);
  show(page);
  const dead = () => stale(tok);
  const jobs = [];
  if (window.TWProfile) jobs.push(TWProfile.groupRecs(recG, dead), TWProfile.peopleRecs(recP, dead));
  jobs.push((async () => {
    let list; try { list = await api('GET', '/api/discover/trending'); } catch { return; }
    if (dead() || !list.length) return;
    const row = h('div', { class: 'rec-row stagger' }, list.map(x => h('div', { class: 'rec-item' }, TW.groupCard(x.group),
      x.activity ? h('div', { class: 'reasons' }, h('span', { class: 'chip reason', text: t('{n} messages this week', { n: x.activity }) })) : null)));
    stagger(row);
    trend.replaceChildren(section(t('Trending now'), t('Busy groups you aren’t in yet.'), row));
  })());
  await Promise.all(jobs);
  if (!dead() && !recG.children.length && !trend.children.length && !recP.children.length)
    page.append(emptyState(t('Nothing to discover yet'), t('Add a few games and join a group, and we’ll start suggesting people and groups.')));
};

/* ---------- My games ---------- */
TWPages.games = async (_, tok) => {
  const picker = gamePicker({ multi: true, value: TW.me.favoriteGames || [], placeholder: t('Add a game') });
  const grid = h('div', { class: 'mg-grid' });
  show(h('div', { class: 'page' }, head(t('My games'), t('The games you play, your ranks, your groups and the friends who play with you.'),
    btn(t('Edit ranks'), { cls: 'ghost', onclick: () => go('#/settings/profile') })), h('div', { class: 'card mg-add' }, picker), grid));
  let saving = Promise.resolve();

  async function load() {
    const r = await api('GET', '/api/games/mine'); if (stale(tok)) return;
    draw(r.games || []);
  }
  function draw(games) {
    if (!games.length) { grid.replaceChildren(emptyState(t('You haven’t added any games yet'), t('Search for a game above to get started.'))); return; }
    grid.replaceChildren(...games.map(g => {
      const friends = g.friends.slice(0, 6).map(f => h('button', { class: 'mg-pal', type: 'button', title: nm(f), 'aria-label': nm(f), onclick: () => openProfile(f.id) }, avatar(f, 'sm', true)));
      const stats = [g.friendCount === 1 ? t('1 friend') : t('{n} friends', { n: g.friendCount }), g.playingNow ? t('{n} playing now', { n: g.playingNow }) : null].filter(Boolean).join(' · ');
      const rm = h('button', { class: 'icon-btn mg-remove', type: 'button', 'aria-label': t('Remove {game}', { game: g.name }), onclick: () => saveGames((TW.me.favoriteGames || []).filter(x => x !== g.name)) }, icon('x', 16));
      return h('article', { class: 'card mg-card', 'data-key': 'g' + g.name },
        h('div', { class: 'mg-top' }, gameThumb(g.name), h('div', { class: 'mg-name' }, h('h3', { text: T(g.name) }),
          (g.rank || g.role) ? h('div', { class: 'chips' }, g.rank ? h('span', { class: 'chip accent', text: T(g.rank) }) : null, g.role ? h('span', { class: 'chip', text: T(g.role) }) : null) : null), rm),
        h('div', { class: 'mg-block' }, h('div', { class: 'section-title', text: t('Friends who play this') }),
          g.friendCount ? h('div', { class: 'mg-pals' }, ...friends, h('span', { class: 'muted small', text: stats })) : h('span', { class: 'muted small', text: t('No friends play this yet') })),
        h('div', { class: 'mg-block' }, h('div', { class: 'section-title', text: t('Your groups') }),
          g.groups.length ? h('div', { class: 'chips' }, g.groups.map(x => h('a', { class: 'chip accent', href: '#/group/' + enc(x.id), text: T(x.name) })))
            : h('div', { class: 'row', style: 'align-items:center;gap:10px;flex-wrap:wrap' }, h('span', { class: 'muted small', text: t('No groups for this game yet') }),
              btn(t('Find groups'), { cls: 'small ghost', onclick: () => { TW.S.q.game = g.name; go('#/search'); } }))));
    }));
    stagger(grid);
  }
  // Saving goes through the normal settings call (real catalog games only); never touches age.
  function saveGames(list) {
    saving = saving.then(async () => {
      const me = TW.me;
      try {
        await api('PUT', '/api/me/settings', { region: me.region, favoriteGames: list, playing: T(me.playing || ''), status: me.status || 'online', onboarded: true });
        TW.me = await api('GET', '/api/me'); picker.value = TW.me.favoriteGames || []; await load();
      } catch (e) { toast(e.message, 'error'); picker.value = TW.me.favoriteGames || []; }
    });
    return saving;
  }
  picker.addEventListener('change', () => saveGames(picker.value));
  await load();
};
})();
