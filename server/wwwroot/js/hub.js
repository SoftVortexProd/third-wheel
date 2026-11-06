/* Sidebar pages: Messages, Discover, My games. Loaded after app.js; uses window.TW and registers routes in TWPages. */
(() => {
'use strict';
const TW = window.TW, TWPages = window.TWPages;
const { h, icon, api, enc, toast, T, nm, avatar, btn, busy, openSheet, emptyState, stagger, show, stale, go, gamePicker, gameThumb, openProfile, when } = TW;
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
  'or': 'eller', 'Continue with {name}': 'Fortsätt med {name}', 'Finish signing in in your browser. This window continues by itself.': 'Slutför inloggningen i webbläsaren. Det här fönstret fortsätter av sig självt.',
  'Tick the box that says you agree to the Terms, then try again.': 'Kryssa i rutan för att godkänna villkoren och försök igen.', 'There is no account for that sign-in yet. Switch to Sign up to create one.': 'Det finns inget konto för den inloggningen än. Byt till Skapa konto för att skapa ett.',
  'This account or device has been suspended.': 'Det här kontot eller den här enheten är avstängd.', 'That sign-in didn’t work. Please try again.': 'Inloggningen fungerade inte. Försök igen.', 'The sign-in was cancelled.': 'Inloggningen avbröts.',
  'That sign-in method isn’t available on this server.': 'Den inloggningsmetoden finns inte på den här servern.', 'That account is already linked to someone else.': 'Det kontot är redan kopplat till någon annan.',
  'Sign-in methods': 'Inloggningsmetoder', 'Link': 'Koppla', 'Linked': 'Kopplad', 'Not set up on this server': 'Inte konfigurerad på den här servern', 'Link accounts from the website in your browser.': 'Koppla konton från webbplatsen i webbläsaren.',
  'Use these to sign in without a password.': 'Använd dessa för att logga in utan lösenord.', 'This is the only way you can sign in. Link another method first.': 'Det här är det enda sättet du kan logga in på. Koppla en annan metod först.', 'Details': 'Detaljer',
  'More': 'Mer', 'Show friends list': 'Visa vänlistan', 'Hide friends list': 'Dölj vänlistan',
  'Simple mode': 'Enkelt läge', 'Hide explanatory text and keep only the controls.': 'Dölj förklarande text och behåll bara kontrollerna.', 'Profile look': 'Profillook', 'Connections': 'Kopplingar',
  'History': 'Historik', 'Voice chat': 'Röstchatt', 'Good teammate': 'Bra lagkamrat', 'Great teammate': 'Mycket bra lagkamrat', 'Legendary teammate': 'Legendarisk lagkamrat', 'Open group': 'Öppna grupp', 'Find a group': 'Hitta en grupp', 'Requested': 'Skickad',
  'Everyone you’ve played with: voice chats with friends and LFG groups that filled up. Say who was a good teammate.': 'Alla du har spelat med: röstchattar och spelsökningar som blev fulla. Berätta vem som var en bra lagkamrat.',
  'Thanks! They’ll see a teammate badge after a few.': 'Tack! De får ett lagkamratmärke efter några.', 'Nobody else to show here.': 'Ingen annan att visa här.', 'No sessions yet': 'Inga sessioner än',
  'Join a voice chat with a friend or fill an LFG post and it shows up here.': 'Gå med i en röstchatt med en vän eller fyll en spelsökning så dyker den upp här.', '{n} people said they were a good teammate': '{n} personer sa att de var en bra lagkamrat',
  'Avatar frame': 'Avatarram', 'Animated rings around your profile picture. Shown next to your name everywhere.': 'Animerade ringar runt din profilbild. Visas bredvid ditt namn överallt.', 'None': 'Ingen', 'Frame applied': 'Ramen användes', 'Frame removed': 'Ramen togs bort',
  'Avatar frames are exclusive to RCKT. Ask an admin for RCKT to wear one.': 'Avatarramar är exklusiva för RCKT. Be en admin om RCKT för att bära en.', 'Aurora': 'Norrsken', 'Ember': 'Glöd', 'Neon': 'Neon', 'Glitch': 'Glitch', 'Royal': 'Kunglig', 'Frost': 'Frost', 'Toxic': 'Giftig', 'Void': 'Tomhet', 'Rainbow': 'Regnbåge', 'Heartbeat': 'Hjärtslag',
  'Profile layout': 'Profillayout', 'Drag sections (or use the arrows) to reorder them. Turn a section off to hide it from everyone else.': 'Dra sektioner (eller använd pilarna) för att ändra ordning. Stäng av en sektion för att dölja den för alla andra.',
  'About me': 'Om mig', 'Favorite games': 'Favoritspel', 'Gamer tags': 'Spelartaggar', 'How you play': 'Hur du spelar', 'When you play': 'När du spelar', 'Good teammate badge': 'Märket bra lagkamrat', 'Move up': 'Flytta upp', 'Move down': 'Flytta ner', 'Show {name}': 'Visa {name}',
  'Import my Steam games': 'Importera mina Steam-spel', 'Sync name': 'Synka namn', 'Steam name updated to {name}': 'Steam-namn uppdaterat till {name}', 'Steam API key not set up on this server. Contact the server admin.': 'Steam API-nyckel är inte konfigurerad på denna server. Kontakta serveradministratören.', 'Import from Steam': 'Importera från Steam', 'Add to my games': 'Lägg till i mina spel', 'Games imported': 'Spel importerade', '{n} of {m} selected': '{n} av {m} valda', 'You can have up to {m} favorite games.': 'Du kan ha upp till {m} favoritspel.',
  'Pick up to 12. Hours played come from Steam and show on your profile.': 'Välj upp till 12. Speltimmarna kommer från Steam och visas på din profil.', 'Bring in the games you own, with hours played.': 'Hämta spelen du äger, med speltimmar.',
  'Your Steam game list is private. Set “Game details” to Public in Steam’s privacy settings, then try again.': 'Din Steam-spellista är privat. Ställ in “Speldetaljer” på Offentlig i Steams sekretessinställningar och försök igen.', 'None of your Steam games are in our catalog yet.': 'Inga av dina Steam-spel finns i vår katalog än.',
  'Processing video…': 'Bearbetar video…', 'This video is being converted so it plays everywhere. It will appear here in a moment.': 'Videon konverteras så att den spelas överallt. Den dyker upp här strax.',
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
  TW.S.chatTimer = (window.TWRT ? TWRT.every : setInterval)(() => { if (!document.hidden) load().catch(() => {}); }, 3000);
  if (window.TWRT) (TW.S.rtOff = TW.S.rtOff || []).push(TWRT.pokes('chat', () => load().catch(() => {})));   // cleared automatically when you leave the page

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
  (window.TWRT ? TWRT.every : setInterval)(refresh, 4000); if (window.TWRT) TWRT.pokes('chat', refresh); document.addEventListener('visibilitychange', refresh); setTimeout(refresh, 1500);
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

/* ---------- History: who I played with ---------- */
TWPages.history = async (_, tok) => {
  const list = h('div', { class: 'stack hist-list', style: 'gap:12px' });
  show(h('div', { class: 'page' }, head(t('History'), t('Everyone you’ve played with: voice chats with friends and LFG groups that filled up. Say who was a good teammate.')), list));
  const KIND = { voice: t('Voice chat'), lfg: t('Looking for group') };
  const dur = (a, b) => { const m = Math.round((new Date(b) - new Date(a)) / 60000); return m < 1 ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  function person(sid, pl) {
    const p = pl.person; let good = pl.good;
    const thumb = h('button', { class: 'icon-btn hist-thumb', type: 'button', 'aria-pressed': String(good), 'aria-label': t('Good teammate'), title: t('Good teammate') }, icon('check', 16));
    const paint = () => { thumb.setAttribute('aria-pressed', String(good)); thumb.classList.toggle('on', good); };
    thumb.addEventListener('click', () => busy(thumb, async () => { await api('POST', `/api/sessions/${sid}/rate`, { userId: p.id, good: !good }); good = !good; pl.good = good; paint(); if (good) toast(t('Thanks! They’ll see a teammate badge after a few.')); }));
    paint();
    const act = p.isFriend ? btn(t('Message'), { cls: 'small ghost', onclick: () => go('#/dm/' + enc(p.id)) })
      : (() => { const a = btn(t('Add friend'), { cls: 'small', icon: 'plus' }); a.addEventListener('click', () => busy(a, async () => { await api('POST', '/api/friends/request', { username: p.username }); a.replaceWith(h('span', { class: 'chip ok' }, icon('check', 12), t('Requested'))); TW.loadSocial().catch(() => {}); })); return a; })();
    return h('div', { class: 'hist-person' }, h('button', { class: 'hist-who', type: 'button', onclick: () => openProfile(p.id) }, avatar(p, 'sm', true), h('span', { text: nm(p) })), thumb, act);
  }
  const r = await api('GET', '/api/sessions'); if (stale(tok)) return;
  list.replaceChildren(...(r.length ? r.map(s => h('article', { class: 'card hist-card', 'data-key': 's' + s.id },
    h('div', { class: 'hist-top' }, s.game ? gameThumb(s.game) : null, h('div', { class: 'hist-title' }, h('b', { text: s.game ? T(s.game) : (KIND[s.kind] || '') }),
      h('span', { class: 'muted small', text: [KIND[s.kind], s.groupName ? T(s.groupName) : '', when(s.startedAt), dur(s.startedAt, s.endedAt)].filter(Boolean).join(' · ') })),
      s.groupId ? btn(t('Open group'), { cls: 'small ghost', onclick: () => go('#/group/' + enc(s.groupId)) }) : btn(t('Find a group'), { cls: 'small ghost', onclick: () => go('#/lfg') })),
    s.players.length ? h('div', { class: 'stack', style: 'gap:8px' }, s.players.map(pl => person(s.id, pl))) : h('p', { class: 'muted small', text: t('Nobody else to show here.') }))) : [emptyState(t('No sessions yet'), t('Join a voice chat with a friend or fill an LFG post and it shows up here.'))]));
  stagger(list);
};

})();


TWPrefs.addStrings('sv', {
  'Set Playing & Status': 'Ställ in spel och status',
  'Currently playing': 'Spelar just nu',
  'Clear game': 'Rensa spel',
  'Status updated!': 'Status uppdaterad!',
  'Account Suspended': 'Kontot är avstängt',
  'Appeal this ban': 'Överklaga avstängningen',
  'Explain why your account should be unbanned...': 'Förklara varför ditt konto borde öppnas igen...',
  'Submit appeal': 'Skicka överklagan',
  'Appeal submitted! An administrator will review your account.': 'Överklagan skickad! En administratör kommer att granska ditt konto.',
  'Ban Appeals': 'Överklaganden',
  'No ban appeals': 'Inga överklaganden',
  'There are no pending or past appeals right now.': 'Det finns inga aktiva eller tidigare överklaganden just nu.',
  'Unban & Approve': 'Häv bannlysning & godkänn',
  'Reject': 'Avslå',
  'Approved & Unbanned': 'Godkänd & återställd',
  'Rejected': 'Avvisad',
  'Birthday': 'Födelsedatum',
  'Must be 13 or older (enter a valid birthday)': 'Du måste vara minst 13 år (ange giltigt födelsedatum)',
  'Delete group': 'Radera grupp',
  'Delete lobby': 'Radera lobby',
  'Are you sure you want to delete this lobby? This cannot be undone.': 'Är du säker på att du vill ta bort den här gruppen? Detta kan inte ångras.',
  'Select your rank to join': 'Välj din rank för att gå med',
  'This group requires a competitive rank for {0}': 'Den här gruppen kräver en tävlingsrank för {0}',
  'Primary role': 'Huvudroll',
  'Secondary role': 'Sekundär roll',
  'Add secondary role': 'Lägg till sekundär roll',
  'Unranked': 'Orankad',
  'Auto-detected based on your location: {0}': 'Automatiskt vald baserat på din plats: {0}',
  'Your matchmaking region.': 'Din matchmaking-region.',
  'Instant 30s Clip Catcher (F8)': 'Snabbklipp-inspelare 30 sek (F8)',
  'Press F8 in any game to capture the last 30 seconds and upload it directly into chat.': 'Tryck F8 i valfritt spel för att spara de senaste 30 sekunderna och ladda upp direkt i chatten.'
,
  'Terms of Service': 'Användarvillkor',
  'Privacy Policy': 'Integritetspolicy',
  'Cookie Policy': 'Cookiepolicy',
  'I agree to the ': 'Jag godkänner ',
  ', and essential ': ', och nödvändiga ',
  'You must agree to the Terms of Service, Privacy Policy, and Cookies to sign up.': 'Du måste godkänna användarvillkoren, integritetspolicyn och cookies för att registrera dig.',
  'Terms of Service & Cookie Consent': 'Användarvillkor & Cookies',
  'I Accept & Continue': 'Jag godkänner & fortsätt',
  'Terms & Cookies accepted. Welcome!': 'Villkor & cookies godkända. Välkommen!',
  'Welcome! Before continuing, please review and accept Third Wheel’s Terms of Service, Privacy Policy, and Cookie Policy.': 'Välkommen! Innan du fortsätter, vänligen läs och godkänn Third Wheels användarvillkor, integritetspolicy och cookiepolicy.',
  'Read Terms of Service': 'Läs användarvillkor',
  'Read Privacy Policy': 'Läs integritetspolicy',
  'Read Cookie Policy': 'Läs cookiepolicy',
  'Profile effect': 'Profileffekt',
  'Profile effects are exclusive to RCKT. Ask an admin for RCKT to wear one.': 'Profileffekter är exklusiva för RCKT. Be en admin om RCKT för att använda en.',
  'Effect applied': 'Effekt applicerad',
  'Effect removed': 'Effekt borttagen',
  'Atmospheric particle effects shown on your profile card.': 'Atmosfäriska partikeleffekter som visas på ditt profilkort.',
  'Share screen': 'Dela skärm',
  'Stop sharing screen': 'Sluta dela skärm',
  'Could not share screen.': 'Kunde inte dela skärm.',
  'Screen': 'Skärm',
  'Cinema mode': 'Bioläge',
  'Close cinema': 'Stäng bioläge',
  'Your stream': 'Din ström',
  'Microphone muted': 'Mikrofon avstängd',
  'Microphone unmuted': 'Mikrofon påslagen',
  'Audio deafened': 'Ljud avstängt',
  'Audio undeafened': 'Ljud påslaget',
  'Share game lobby invite': 'Dela spellobbyinbjudan',
  'Invite to Game Lobby': 'Bjud in till spellobby',
  'Send Lobby Invite': 'Skicka lobbyinbjudan',
  'Join Game': 'Gå med i spel',
  'Join link, Steam URL or Server IP': 'Anslutningslänk, Steam-URL eller server-IP',
  'Open spots': 'Lediga platser',
  'Note (optional)': 'Anteckning (valfritt)',
  'Copied join code': 'Kopierade anslutningskod',
  'Please enter a join URL or server IP': 'Ange en anslutningslänk eller server-IP'
});
