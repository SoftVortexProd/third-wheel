/* Per-user appearance + language preferences: accent colour, text size, language (i18n) and the content/safety flags.
   Loaded BEFORE app.js so the login screen can already use the values cached on this device. Exposes window.TWPrefs. */
(() => {
'use strict';
const KEY = 'tw_prefs';
const DEFAULT_ACCENT = '#7c8cff';     // what the server stores by default; it means "use the built-in indigo"
const LANGS = ['en', 'sv'];
const root = document.documentElement;

const prefs = { accentColor: DEFAULT_ACCENT, fontScale: 1, language: 'en', nsfwFilter: true, profanityFilter: true, disablePfpAnimation: false, favGifs: [], gamerTags: {} };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };

/* ---------------- theme ---------------- */
const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, w) => a.map((v, i) => v * (1 - w) + b[i] * w);          // w=0 -> a, w=1 -> b
const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const VARS = ['--color-accent', '--color-accent-hover', '--color-accent-soft', '--color-accent-text', '--color-accent-border', '--color-on-accent'];

function applyAccent(hex) {
  const v = String(hex || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(v) || v === DEFAULT_ACCENT) { VARS.forEach(p => root.style.removeProperty(p)); return; }
  const a = hex2rgb(v), white = [255, 255, 255], surface = [9, 9, 11];
  const set = (p, c) => root.style.setProperty(p, typeof c === 'string' ? c : rgb2hex(c));
  set('--color-accent', v);
  set('--color-accent-hover', mix(a, white, .14));
  set('--color-accent-soft', mix(surface, a, .3));
  set('--color-accent-text', mix(a, white, .55));
  set('--color-accent-border', mix(surface, a, .45));
  set('--color-on-accent', contrast(a, white) >= contrast(a, [11, 11, 15]) ? '#ffffff' : '#0b0b0f');   // readable text on top of the accent
}
function applyScale(s) {
  const n = Math.min(1.4, Math.max(.85, Number(s) || 1));
  if (Math.abs(n - 1) < .001) root.style.removeProperty('--ts'); else root.style.setProperty('--ts', String(n));
}
function applyAll() { applyAccent(prefs.accentColor); applyScale(prefs.fontScale); root.lang = prefs.language; }
applyAll();

/* ---------------- i18n: English text is the key; unknown keys fall back to English ---------------- */
const SV = {
  'Online': 'Online', 'Idle': 'Inaktiv', 'Do not disturb': 'Stör ej', 'Offline': 'Offline',
  'your_name': 'ditt_namn', 'At least 8 characters': 'Minst 8 tecken', 'Username': 'Användarnamn',
  '3–20 letters, numbers, . _ -': '3–20 bokstäver, siffror, . _ -', 'Password': 'Lösenord', 'Log in': 'Logga in', 'Sign up': 'Skapa konto',
  'Create account': 'Skapa konto', 'Account': 'Konto', 'Use 3–20 letters, numbers, . _ or -': 'Använd 3–20 bokstäver, siffror, . _ eller -',
  'Password must be at least 8 characters': 'Lösenordet måste vara minst 8 tecken', 'Find a group that plays the way you do.': 'Hitta en grupp som spelar som du.',
  'Home': 'Hem', 'Social': 'Socialt', 'Play': 'Spela', 'Discover': 'Upptäck', 'Looking for group': 'Söker lag', 'Messages': 'Meddelanden', 'My games': 'Mina spel', 'Menu': 'Meny',
  'Search groups and people': 'Sök grupper och personer', 'Feed': 'Flöde', 'Find groups': 'Hitta grupper', 'Friends & invites': 'Vänner & inbjudningar',
  'My groups': 'Mina grupper', 'Create a group': 'Skapa en grupp', 'Admin panel': 'Adminpanel', 'Friend requests and invites': 'Vänförfrågningar och inbjudningar',
  'Settings': 'Inställningar', 'Friends': 'Vänner', 'Search': 'Sök', 'Playing {game}': 'Spelar {game}', 'Playing {game} with +{count}': 'Spelar {game} med +{count}', 'View profile': 'Visa profil',
  'No groups yet. Find one or create your own.': 'Inga grupper än. Hitta en eller skapa din egen.', 'Playing now': 'Spelar nu',
  'No friends yet': 'Inga vänner än', 'Search for people and send a request.': 'Sök efter personer och skicka en förfrågan.', '{n} online': '{n} online',
  'Your feed': 'Ditt flöde', 'Groups picked for your games, region and age.': 'Grupper utvalda för dina spel, din region och din ålder.',
  'Find your people': 'Hitta dina spelkompisar', 'Filter by game, play style, region and age.': 'Filtrera efter spel, spelstil, region och ålder.',
  'Requests, group invites and the people you play with.': 'Förfrågningar, gruppinbjudningar och personerna du spelar med.',
  'That didn’t load': 'Det gick inte att ladda', 'Please try again.': 'Försök igen.', 'Something went wrong.': 'Något gick fel.',
  /* settings: tabs */
  'Profile & identity': 'Profil & identitet', 'Appearance & theme': 'Utseende & tema', 'Content & safety': 'Innehåll & säkerhet',
  'Language': 'Språk', 'Account & security': 'Konto & säkerhet', 'Settings sections': 'Inställningsavsnitt',
  'Signed in as @{name}': 'Inloggad som @{name}',
  /* settings: profile */
  'Choose a profile picture': 'Välj en profilbild', 'Upload picture': 'Ladda upp bild', 'Remove': 'Ta bort', 'Picture removed': 'Bilden togs bort',
  'Profile picture updated': 'Profilbilden uppdaterades', 'Profile picture': 'Profilbild',
  'Disable animated profile pictures': 'Inaktivera animerade profilbilder',
  'Freeze animated GIFs to save CPU and battery on lower-end devices.': 'Frys animerade GIF-bilder fÃ¶r att spara processor och batteri pÃ¥ enklare enheter.',
  'Profile banner': 'Profilbanner',
  'Shown behind your nameplate and profile header. PNG, JPG, WebP or GIF up to 5 MB.': 'Visas bakom din namnbricka och profilrubrik. PNG, JPG, WebP eller GIF upp till 5 MB.',
  'Upload banner': 'Ladda upp banner',
  'Banner removed': 'Bannern togs bort',
  'Profile banner updated': 'Profilbannern uppdaterades',
  'Choose a profile banner': 'VÃ¤lj en profilbanner',
  'Crop profile picture': 'Beskär profilbild',
  'Crop profile banner': 'Beskär profilbanner',
  'Crop group picture': 'Beskär gruppbild',
  'Crop image': 'Beskär bild',
  'Drag to move the crop area': 'Dra för att flytta beskärningen',
  'Drag handles to resize': 'Dra i hörnen för att ändra storlek',
  'Center': 'Centrera',
  'Preview': 'Förhandsgranskning',
  'Apply': 'Använd',
  'Keep original': 'Behåll original',
  'Animation preserved on save': 'Animationen bevaras vid sparning',
  'Keep animated (full)': 'Behåll animerad (full storlek)',
  'Crop (static)': 'Beskär (statisk bild)',
  'Animated GIF detected': 'Animerad GIF identifierad',
  'This image is an animated GIF. You can keep it full-sized to preserve the animation, or crop it as a static image.': 'Den här bilden är en animerad GIF. Du kan behålla hela bilden för att bevara animationen, eller beskära den som en statisk bild.',
  'Group icon': 'Gruppikon',
  'Upload group picture': 'Ladda upp gruppbild',
  'Group icon updated': 'Gruppikonen uppdaterades',
  'Group icon removed': 'Gruppikonen togs bort',
  'PNG, JPG, WebP or GIF up to 5 MB. GIFs stay animated.': 'PNG, JPG, WebP eller GIF upp till 5 MB. GIF-bilder förblir animerade.',
  'Your current password': 'Ditt nuvarande lösenord', 'Display name': 'Visningsnamn',
  'Shown to friends and in chats. Leave empty to use your username.': 'Visas för vänner och i chattar. Lämna tomt för att använda ditt användarnamn.',
  '3–20 letters, numbers or underscores. Friends find you with this.': '3–20 bokstäver, siffror eller understreck. Vänner hittar dig med detta.',
  'Current password': 'Nuvarande lösenord', 'Required to change your display name or username.': 'Krävs för att ändra visningsnamn eller användarnamn.',
  'Save name': 'Spara namn', 'Use 3–20 letters, numbers or underscores': 'Använd 3–20 bokstäver, siffror eller understreck',
  'At most 32 characters': 'Högst 32 tecken', 'Enter your password to confirm': 'Ange ditt lösenord för att bekräfta', 'Name updated': 'Namnet uppdaterades',
  'Name': 'Namn', 'Choose a region': 'Välj en region', 'Appear offline': 'Visa som offline', 'What are you playing right now?': 'Vad spelar du just nu?',
  'Region': 'Region', 'Age': 'Ålder', 'Your age can only be changed by an admin.': 'Din ålder kan bara ändras av en admin.',
  'Must be 13 or older.': 'Måste vara 13 år eller äldre.', 'Status': 'Status', 'Currently playing': 'Spelar just nu',
  'Shown next to your name in friends lists.': 'Visas bredvid ditt namn i vänlistor.', 'Save changes': 'Spara ändringar',
  'Enter an age from 13 to 99': 'Ange en ålder mellan 13 och 99', 'Settings saved': 'Inställningarna sparades', 'Favorite games': 'Favoritspel',
  'About you': 'Om dig', 'Your name on that platform': 'Ditt namn på den plattformen', 'Gamer tag': 'Spelartagg', 'Remove {name}': 'Ta bort {name}',
  'No gamer tags yet.': 'Inga spelartaggar än.', 'Add tag': 'Lägg till tagg', 'Use 2–32 characters': 'Använd 2–32 tecken',
  'You can add up to 10 tags': 'Du kan lägga till upp till 10 taggar', 'Gamer tag saved': 'Spelartaggen sparades', 'Gamer tags': 'Spelartaggar',
  'Show friends where to find you: Steam, Discord, Xbox and more.': 'Visa vännerna var de hittar dig: Steam, Discord, Xbox och mer.', 'Platform': 'Plattform',
  /* settings: appearance */
  'Accent colour': 'Accentfärg', 'Custom colour': 'Egen färg', 'Enter a colour like #7c8cff': 'Ange en färg som #7c8cff', 'Apply': 'Använd',
  'Reset to 100%': 'Återställ till 100 %', 'Text size': 'Textstorlek', 'Preview': 'Förhandsvisning',
  'Text and colours update as you change them.': 'Text och färger uppdateras medan du ändrar dem.', 'Button': 'Knapp', 'Chip': 'Etikett',
  'Follow system': 'Följ systemet', 'Always on': 'Alltid på', 'Off': 'Av', 'Animations off': 'Animationer av', 'Animations always on': 'Animationer alltid på',
  'Animations follow your system': 'Animationer följer ditt system', 'Detect the game I’m playing': 'Upptäck spelet jag spelar',
  'Shows the game you’re playing as your status. Only the game’s name is shared.': 'Visar spelet du spelar som din status. Bara spelets namn delas.',
  'Used for buttons, highlights and links across the app.': 'Används för knappar, markeringar och länkar i hela appen.',
  'Make text larger or smaller everywhere in the app.': 'Gör text större eller mindre överallt i appen.', 'Motion': 'Rörelse', 'Animations': 'Animationer',
  'Use “Always on” if your system turns animations off.': 'Använd ”Alltid på” om ditt system stänger av animationer.',
  'Indigo': 'Indigo', 'Blue': 'Blå', 'Teal': 'Blågrön', 'Green': 'Grön', 'Lime': 'Lime', 'Amber': 'Bärnsten', 'Orange': 'Orange', 'Red': 'Röd',
  'Pink': 'Rosa', 'Purple': 'Lila', 'Violet': 'Violett', 'Slate': 'Skiffer',
  /* settings: safety */
  'Content filters': 'Innehållsfilter', 'Hide 18+ / NSFW content': 'Dölj 18+/NSFW-innehåll', 'Always on for accounts under 18.': 'Alltid på för konton under 18.',
  'Blur or hide mature content in chats and profiles.': 'Sudda eller dölj vuxeninnehåll i chattar och profiler.', 'Chat safety filter': 'Chattsäkerhetsfilter',
  'Mask profanity in messages you receive.': 'Maskera svordomar i meddelanden du får.', 'Unblock': 'Avblockera', 'Unblocked {name}': '{name} avblockerades',
  'No blocked users': 'Inga blockerade användare', 'People you block can’t message you and won’t appear in your friends list.': 'Personer du blockerar kan inte skriva till dig och syns inte i din vänlista.',
  'Loading': 'Laddar', 'Blocked users': 'Blockerade användare',
  /* settings: language + account */
  'Choose the language for menus and buttons. Messages and names are never translated.': 'Välj språk för menyer och knappar. Meddelanden och namn översätts aldrig.',
  'Log out': 'Logga ut', 'You’ll need your password to come back.': 'Du behöver ditt lösenord för att komma tillbaka.',
  'Password changed. Other devices were signed out.': 'Lösenordet byttes. Andra enheter loggades ut.', 'New password': 'Nytt lösenord', '8–72 characters.': '8–72 tecken.',
  'Repeat new password': 'Upprepa nytt lösenord', 'Change password': 'Byt lösenord', 'Type it again': 'Skriv det igen', 'Enter your current password': 'Ange ditt nuvarande lösenord',
  'Use 8–72 characters': 'Använd 8–72 tecken', 'The passwords don’t match': 'Lösenorden matchar inte',
  /* common buttons, ready for the other screens */
  'Save': 'Spara', 'Cancel': 'Avbryt', 'Delete': 'Radera', 'Leave': 'Lämna', 'Join': 'Gå med', 'Invite': 'Bjud in', 'Stay': 'Stanna', 'Create group': 'Skapa grupp',
  'Back': 'Tillbaka', 'Continue': 'Fortsätt', 'Finish': 'Slutför', 'Skip': 'Hoppa över', 'Accept': 'Acceptera', 'Decline': 'Avböja', 'Add friend': 'Lägg till vän',
  'Message': 'Meddelande', 'Edit': 'Redigera', 'Close': 'Stäng', 'Copy': 'Kopiera', 'Report': 'Rapportera', 'Block': 'Blockera', 'Try again': 'Försök igen'
};
const DICT = { sv: SV };

function t(key, v) {
  const vars = v && typeof v === 'object' ? v : null;
  const fallback = typeof v === 'string' ? v : key;
  const d = DICT[prefs.language];
  const s = (d && d[key]) || fallback;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}
function setLanguage(code) {
  if (!LANGS.includes(code) || code === prefs.language) return;
  prefs.language = code; root.lang = code; persist();
  document.dispatchEvent(new CustomEvent('tw:lang', { detail: { language: code } }));
}

/* ---------------- server sync ---------------- */
async function request(method, body) {
  const r = await fetch('/api/me/preferences', { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'X-TW': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `Could not save (${r.status}).`);
  return data;
}
/* After login: take the server's copy (accent, text size, language, filters) and apply it before the first screen is built. */
async function load() {
  try {
    const d = await request('GET');
    const lang = LANGS.includes(d.language) ? d.language : 'en';
    Object.assign(prefs, { accentColor: String(d.accentColor || DEFAULT_ACCENT), fontScale: Number(d.fontScale) || 1, language: lang,
      nsfwFilter: d.nsfwFilter !== false, profanityFilter: d.profanityFilter !== false, disablePfpAnimation: d.disablePfpAnimation === true, favGifs: d.favGifs || [], gamerTags: d.gamerTags || {} });
    persist(); applyAll();
  } catch { /* offline or logged out: keep the cached values */ }
  return get();
}
/* Apply a change immediately, then save it. Rejects if the server refuses it (the change stays applied on screen). */
function save(patch) {
  const lang = patch.language;
  if (lang !== undefined) delete patch.language;      // language changes go through setLanguage() so the UI re-renders
  Object.assign(prefs, patch);
  if (lang !== undefined) { prefs.language = LANGS.includes(lang) ? lang : prefs.language; }
  persist();
  if ('accentColor' in patch) applyAccent(prefs.accentColor);
  if ('fontScale' in patch) applyScale(prefs.fontScale);
  const body = { ...patch }; if (lang !== undefined) body.language = prefs.language;
  // One request at a time, in order, so a quick series of changes (e.g. holding an arrow key on the slider) can't land out of order.
  const run = queue.catch(() => {}).then(() => request('PUT', body));
  queue = run;
  return run;
}
let queue = Promise.resolve();
const get = () => ({ ...prefs, gamerTags: { ...(prefs.gamerTags || {}) }, favGifs: [...(prefs.favGifs || [])] });

/* Feature modules add their own Swedish strings with TWPrefs.addStrings('sv', { 'English text': 'Svensk text' }). */
function addStrings(lang, strings) { (DICT[lang] = DICT[lang] || {}); Object.assign(DICT[lang], strings); }
window.TWPrefs = { t, load, save, get, setLanguage, addStrings, language: () => prefs.language, applyScale, applyAccent, DEFAULT_ACCENT };
})();
