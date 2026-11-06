/* Clip catcher, web side. The desktop app records the last 30 s of a game when you press F8 and hands the finished video to window.TWApp.clipReady().
   Here: a small window with a preview, a trim step (two sliders; the server cuts the video while converting it), and where to post it:
   your profile or one of your groups. In Settings -> Clips you can skip the questions and post every clip to one place automatically. */
(() => {
'use strict';
const TW = window.TW;
if (!TW || !window.TWPrefs) return;
const { h, api, toast, T, openSheet, btn, field } = TW;
const t = (k, v) => TW.t(k, v);

TWPrefs.addStrings('sv', {
  'New clip': 'Nytt klipp', 'Trim': 'Klipp till', 'Start': 'Start', 'End': 'Slut', 'Post to': 'Lägg upp i', 'My profile': 'Min profil', 'Title (optional)': 'Titel (valfritt)',
  'Post clip': 'Lägg upp klipp', 'Posting…': 'Lägger upp…', 'Clip posted.': 'Klippet är uppe.', 'Clip posted to your profile.': 'Klippet ligger på din profil.', 'Discard': 'Släng',
  'Clips': 'Klipp', 'Clip catcher': 'Klippfångaren', 'Ask me every time': 'Fråga varje gång', 'After pressing F8': 'Efter F8',
  'Press F8 while playing (desktop app) to keep the last 30 seconds. Choose what happens with the clip afterwards.': 'Tryck F8 under spelet (skrivbordsappen) för att spara de senaste 30 sekunderna. Välj vad som händer med klippet sedan.',
  'Show the trim window': 'Visa trimfönstret', 'Post straight away to': 'Lägg upp direkt i', 'No clips yet.': 'Inga klipp än.', 'Delete clip': 'Ta bort klipp', 'Clip deleted': 'Klippet togs bort',
  'Processing video…': 'Bearbetar video…', 'The clip catcher is on in the tray menu of the desktop app. It only records while a game is running.': 'Klippfångaren slås på i skrivbordsappens ikonmeny. Den spelar bara in medan ett spel körs.',
  'The server cuts the video to this part.': 'Servern klipper videon till den här delen.', 'Pick a place to post it.': 'Välj var den ska läggas upp.'
});
TWPrefs.addStrings('de', {
  'New clip': 'Neuer Clip', 'Trim': 'Zuschneiden', 'Start': 'Start', 'End': 'Ende', 'Post to': 'Posten in', 'My profile': 'Mein Profil', 'Title (optional)': 'Titel (optional)',
  'Post clip': 'Clip posten', 'Posting…': 'Wird gepostet…', 'Clip posted.': 'Clip gepostet.', 'Clip posted to your profile.': 'Clip ist auf deinem Profil.', 'Discard': 'Verwerfen',
  'Clips': 'Clips', 'Clip catcher': 'Clip-Catcher', 'Ask me every time': 'Jedes Mal fragen', 'After pressing F8': 'Nach F8',
  'Press F8 while playing (desktop app) to keep the last 30 seconds. Choose what happens with the clip afterwards.': 'Drücke beim Spielen F8 (Desktop-App), um die letzten 30 Sekunden zu behalten. Wähle, was danach mit dem Clip passiert.',
  'Show the trim window': 'Zuschneide-Fenster zeigen', 'Post straight away to': 'Sofort posten in', 'No clips yet.': 'Noch keine Clips.', 'Delete clip': 'Clip löschen', 'Clip deleted': 'Clip gelöscht',
  'Processing video…': 'Video wird verarbeitet…', 'The clip catcher is on in the tray menu of the desktop app. It only records while a game is running.': 'Der Clip-Catcher wird im Tray-Menü der Desktop-App eingeschaltet. Er nimmt nur auf, solange ein Spiel läuft.',
  'The server cuts the video to this part.': 'Der Server schneidet das Video auf diesen Teil zu.', 'Pick a place to post it.': 'Wähle, wohin der Clip soll.'
});
TWPrefs.addStrings('es', {
  'New clip': 'Clip nuevo', 'Trim': 'Recortar', 'Start': 'Inicio', 'End': 'Fin', 'Post to': 'Publicar en', 'My profile': 'Mi perfil', 'Title (optional)': 'Título (opcional)',
  'Post clip': 'Publicar clip', 'Posting…': 'Publicando…', 'Clip posted.': 'Clip publicado.', 'Clip posted to your profile.': 'El clip está en tu perfil.', 'Discard': 'Descartar',
  'Clips': 'Clips', 'Clip catcher': 'Capturador de clips', 'Ask me every time': 'Preguntar siempre', 'After pressing F8': 'Tras pulsar F8',
  'Press F8 while playing (desktop app) to keep the last 30 seconds. Choose what happens with the clip afterwards.': 'Pulsa F8 mientras juegas (app de escritorio) para guardar los últimos 30 segundos. Elige qué pasa después con el clip.',
  'Show the trim window': 'Mostrar la ventana de recorte', 'Post straight away to': 'Publicar directamente en', 'No clips yet.': 'Aún no hay clips.', 'Delete clip': 'Eliminar clip', 'Clip deleted': 'Clip eliminado',
  'Processing video…': 'Procesando vídeo…', 'The clip catcher is on in the tray menu of the desktop app. It only records while a game is running.': 'El capturador de clips se activa en el menú de la bandeja de la app de escritorio. Solo graba mientras se ejecuta un juego.',
  'The server cuts the video to this part.': 'El servidor recorta el vídeo a esta parte.', 'Pick a place to post it.': 'Elige dónde publicarlo.'
});
TWPrefs.addStrings('fi', {
  'New clip': 'Uusi klippi', 'Trim': 'Leikkaa', 'Start': 'Alku', 'End': 'Loppu', 'Post to': 'Julkaise kohteeseen', 'My profile': 'Oma profiili', 'Title (optional)': 'Otsikko (valinnainen)',
  'Post clip': 'Julkaise klippi', 'Posting…': 'Julkaistaan…', 'Clip posted.': 'Klippi julkaistu.', 'Clip posted to your profile.': 'Klippi on profiilissasi.', 'Discard': 'Hylkää',
  'Clips': 'Klipit', 'Clip catcher': 'Klippien nappaaja', 'Ask me every time': 'Kysy joka kerta', 'After pressing F8': 'F8:n jälkeen',
  'Press F8 while playing (desktop app) to keep the last 30 seconds. Choose what happens with the clip afterwards.': 'Paina F8 pelatessasi (työpöytäsovellus) tallentaaksesi viimeiset 30 sekuntia. Valitse, mitä klipille sen jälkeen tapahtuu.',
  'Show the trim window': 'Näytä leikkausikkuna', 'Post straight away to': 'Julkaise heti kohteeseen', 'No clips yet.': 'Ei vielä klippejä.', 'Delete clip': 'Poista klippi', 'Clip deleted': 'Klippi poistettu',
  'Processing video…': 'Käsitellään videota…', 'The clip catcher is on in the tray menu of the desktop app. It only records while a game is running.': 'Klippien nappaaja kytketään päälle työpöytäsovelluksen ilmaisinalueen valikosta. Se tallentaa vain pelin ollessa käynnissä.',
  'The server cuts the video to this part.': 'Palvelin leikkaa videon tähän osaan.', 'Pick a place to post it.': 'Valitse, minne se julkaistaan.'
});

const store = {
  get(k, d) { try { const v = localStorage.getItem('tw.clip.' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tw.clip.' + k, v); } catch { /* ignore */ } }
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function upload(kind, id, file, trim, onPct) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/uploads?kind=${kind}&id=${encodeURIComponent(id)}`);
    x.setRequestHeader('X-TW', '1'); x.setRequestHeader('X-Filename', encodeURIComponent(file.name)); x.setRequestHeader('Content-Type', file.type || 'video/webm');
    if (trim) x.setRequestHeader('X-Trim', `${trim[0].toFixed(2)},${trim[1].toFixed(2)}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onPct) onPct(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* ignore */ } x.status >= 200 && x.status < 300 ? resolve(j) : reject(new Error(j.error || j.message || 'Upload failed.')); };
    x.onerror = () => reject(new Error('Upload failed.'));
    x.send(file);
  });
}

/** Post a clip: upload (with optional trim), then attach it to the profile or send it as a message in the group. */
async function post(file, dest, trim, title, onPct) {
  if (dest === 'profile') {
    const r = await upload('p', 0, file, trim, onPct);
    await api('POST', '/api/me/clips', { fileId: r.id, title: title || '' });
    toast(t('Clip posted to your profile.')); document.dispatchEvent(new Event('tw:clips'));
  } else if (dest.startsWith('g:')) {
    const gid = dest.slice(2);
    const r = await upload('g', gid, file, trim, onPct);
    await api('POST', `/api/groups/${encodeURIComponent(gid)}/messages`, { text: '', fileId: r.id });
    toast(t('Clip posted.'));
  } else throw new Error(t('Pick a place to post it.'));
}

async function myGroups() { try { return await api('GET', '/api/groups/mine'); } catch { return []; } }

async function open(file) {
  const groups = await myGroups();
  const auto = store.get('dest', ''), askTrim = store.get('trim', '1') === '1';
  if (auto && !askTrim && (auto === 'profile' || groups.some(g => 'g:' + g.id === auto))) {
    try { toast(t('Posting…')); await post(file, auto, null, '', null); } catch (e) { toast(T(e.message), 'error'); }
    return;
  }
  const url = URL.createObjectURL(file);
  const video = h('video', { class: 'clip-video', src: url, controls: true, muted: true, playsinline: true });
  let dur = 30, a = 0, b = 30;
  const lo = h('input', { type: 'range', min: 0, max: 30, step: 0.1, value: 0, 'aria-label': t('Start'), class: 'clip-range' });
  const hi = h('input', { type: 'range', min: 0, max: 30, step: 0.1, value: 30, 'aria-label': t('End'), class: 'clip-range' });
  const lab = h('div', { class: 'muted small clip-times' });
  const paint = () => { a = +lo.value; b = +hi.value; lab.textContent = `${fmt(a)} – ${fmt(b)}  (${(b - a).toFixed(1)} s)`; };
  const setDur = () => {
    if (!isFinite(video.duration) || video.duration <= 0) return;
    dur = video.duration; for (const r of [lo, hi]) r.max = dur; hi.value = dur; lo.value = 0; paint();
  };
  video.addEventListener('loadedmetadata', setDur);
  // WebM from a recorder often reports Infinity until it is seeked once
  video.addEventListener('loadedmetadata', () => { if (!isFinite(video.duration)) { video.currentTime = 1e7; video.addEventListener('timeupdate', function f() { video.removeEventListener('timeupdate', f); video.currentTime = 0; setDur(); }); } });
  lo.addEventListener('input', () => { if (+lo.value > +hi.value - 1) lo.value = Math.max(0, +hi.value - 1); video.currentTime = +lo.value; paint(); });
  hi.addEventListener('input', () => { if (+hi.value < +lo.value + 1) hi.value = Math.min(dur, +lo.value + 1); video.currentTime = Math.max(0, +hi.value - 0.1); paint(); });
  video.addEventListener('timeupdate', () => { if (video.currentTime > b) { video.pause(); video.currentTime = a; } });
  paint();

  const destSel = h('select', { class: 'select', 'aria-label': t('Post to') },
    h('option', { value: 'profile', text: t('My profile') }), ...groups.map(g => h('option', { value: 'g:' + g.id, text: T(g.name) })));
  const want = auto || store.get('last', 'profile'); if ([...destSel.options].some(o => o.value === want)) destSel.value = want;
  const title = h('input', { class: 'input', type: 'text', maxlength: 60, placeholder: t('Title (optional)') });
  const bar = h('div', { class: 'upload-bar', hidden: true }, h('i'));
  const go = btn(t('Post clip'), { cls: 'primary' });
  const drop = btn(t('Discard'), { cls: 'ghost' });
  const body = h('div', { class: 'stack' }, video,
    h('div', { class: 'stack', style: 'gap:4px' }, h('b', { class: 'small', text: t('Trim') }), lo, hi, lab, h('span', { class: 'muted small', text: t('The server cuts the video to this part.') })),
    field(t('Post to'), destSel), destSel.value === 'profile' ? title : title, bar, h('div', { class: 'row', style: 'gap:8px;justify-content:flex-end' }, drop, go));
  const close = openSheet(t('New clip'), body);
  const done = () => { URL.revokeObjectURL(url); close(); };
  drop.addEventListener('click', done);
  destSel.addEventListener('change', () => { title.hidden = destSel.value !== 'profile'; });
  title.hidden = destSel.value !== 'profile';
  go.addEventListener('click', async () => {
    go.disabled = true; drop.disabled = true; go.textContent = t('Posting…'); bar.hidden = false;
    const trimmed = (a > 0.05 || b < dur - 0.05) ? [a, b] : null;
    try {
      await post(file, destSel.value, trimmed, title.value.trim(), (p) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; });
      store.set('last', destSel.value); done();
    } catch (e) { toast(T(e.message), 'error'); go.disabled = false; drop.disabled = false; go.textContent = t('Post clip'); bar.hidden = true; }
  });
}

/* the desktop app calls this with the finished clip (base64) */
window.TWApp = window.TWApp || {};
function fromB64(name, b64, type) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}
window.TWApp.clipReady = (name, b64) => { try { open(fromB64(name || 'clip.webm', b64, /\.mp4$/i.test(name) ? 'video/mp4' : 'video/webm')); } catch (e) { console.error('clip', e); } };
window.TWApp.uploadClip = window.TWApp.clipReady;   // older desktop builds
window.TW.uploadClip = (file) => open(file);        // also usable from the website
window.TWClips = { open, post, store };

/* ---- the Clips section of a profile (watch, and delete your own) ---- */
async function profileSection(userId, isMe) {
  let list; try { list = await api('GET', `/api/users/${encodeURIComponent(userId)}/clips`); } catch { return null; }
  if (!list.length) return null;
  const box = h('div', { class: 'section', 'data-sec': 'clips' }, h('div', { class: 'section-title', text: t('Clips') }));
  const grid = h('div', { class: 'clip-grid' });
  for (const c of list) {
    const card = h('div', { class: 'clip-card' });
    if (c.processing) card.append(h('div', { class: 'clip-wait muted small', text: t('Processing video…') }));
    else card.append(h('video', { src: c.url, controls: true, preload: 'metadata', playsinline: true }));
    if (c.title) card.append(h('div', { class: 'small', text: T(c.title) }));
    if (isMe) card.append(h('button', { class: 'linklike small', type: 'button', text: t('Delete clip'), onclick: async () => {
      try { await api('DELETE', '/api/me/clips/' + c.id); card.remove(); toast(t('Clip deleted')); } catch (e) { toast(T(e.message), 'error'); }
    } }));
    grid.append(card);
  }
  box.append(grid); return box;
}
TW.clipsSection = profileSection;

/* ---- Settings card (added to the Profile look tab by settings.js through TW.clipSettingsCard) ---- */
TW.clipSettingsCard = (card, cardHead) => {
  const body = h('div', { class: 'stack', style: 'gap:10px' });
  const c = card(cardHead(t('Clip catcher'), t('Press F8 while playing (desktop app) to keep the last 30 seconds. Choose what happens with the clip afterwards.')), body);
  myGroups().then(groups => {
    const sel = h('select', { class: 'select', 'aria-label': t('After pressing F8') },
      h('option', { value: '', text: t('Ask me every time') }), h('option', { value: 'profile', text: t('My profile') }), ...groups.map(g => h('option', { value: 'g:' + g.id, text: T(g.name) })));
    sel.value = store.get('dest', ''); sel.addEventListener('change', () => store.set('dest', sel.value));
    const trim = h('input', { type: 'checkbox', id: 'clip-trim' }); trim.checked = store.get('trim', '1') === '1'; trim.addEventListener('change', () => store.set('trim', trim.checked ? '1' : '0'));
    body.append(field(t('Post straight away to'), sel), h('label', { for: 'clip-trim', class: 'row', style: 'gap:8px;align-items:center;cursor:pointer' }, trim, h('span', { text: t('Show the trim window') })),
      h('p', { class: 'muted small', text: t('The clip catcher is on in the tray menu of the desktop app. It only records while a game is running.') }));
  });
  return c;
};
})();
