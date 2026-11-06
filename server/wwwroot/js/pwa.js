/* Installable app + push notifications. Both are browser features that only exist on https (or localhost); on plain http this module just says so. */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, api, toast, switchEl } = TW;
const t = TW.t;

TWPrefs.addStrings('sv', {
  'App and notifications': 'Appen och notiser', 'Install Third Wheel': 'Installera Third Wheel', 'Install': 'Installera',
  'Add it to your home screen or desktop so it opens like a normal app.': 'Lägg till den på hemskärmen eller skrivbordet så öppnas den som en vanlig app.',
  'Already installed, or your browser offers it in its menu (Add to Home screen).': 'Redan installerad, eller så finns det i webbläsarens meny (Lägg till på hemskärmen).',
  'Notifications': 'Notiser', 'Get notified about messages, mentions, friend requests and LFG even when the app is closed.': 'Få notiser om meddelanden, omnämnanden, vänförfrågningar och spelsökningar även när appen är stängd.',
  'Notifications need a secure (https) connection. Ask the server owner to turn on https.': 'Notiser kräver en säker anslutning (https). Be serverns ägare att slå på https.',
  'This browser can’t show notifications.': 'Den här webbläsaren kan inte visa notiser.',
  'Notifications are blocked. Allow them in your browser’s site settings.': 'Notiser är blockerade. Tillåt dem i webbläsarens webbplatsinställningar.',
  'Notifications on for this device': 'Notiser på för den här enheten', 'Notifications off': 'Notiser av', 'Couldn’t turn on notifications.': 'Kunde inte slå på notiser.',
  'Installed': 'Installerad',
  'Get the Third Wheel app': 'Skaffa Third Wheel-appen', 'Full screen, faster, and notifications when friends message you.': 'Helskärm, snabbare, och notiser när vänner skriver till dig.',
  'Not now': 'Inte nu', 'Don’t ask again': 'Fråga inte igen', 'Show me how': 'Visa hur', 'Add to Home Screen': 'Lägg till på hemskärmen',
  'Tap the Share button in Safari’s toolbar.': 'Tryck på Dela-knappen i Safaris verktygsfält.', 'Scroll down and tap “Add to Home Screen”.': 'Scrolla ner och tryck på “Lägg till på hemskärmen”.', 'Tap “Add”. The app now lives on your home screen.': 'Tryck på “Lägg till”. Appen finns nu på din hemskärm.',
  'Open the browser menu (the three dots).': 'Öppna webbläsarens meny (de tre prickarna).', 'Tap “Install app” or “Add to Home screen”.': 'Tryck på “Installera app” eller “Lägg till på startskärmen”.', 'Got it': 'Uppfattat'
});

/* ---- service worker (not inside the desktop app, which is already an app) ---- */
let reg = null, deferred = null;
if ('serviceWorker' in navigator && window.isSecureContext && !window.__TW_DESKTOP) {
  navigator.serviceWorker.register('/sw.js').then(r => { reg = r; }).catch(() => {});
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('tw:installable')); });
window.addEventListener('appinstalled', () => { deferred = null; toast(t('Installed')); });

const b64 = (s) => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };

async function currentSub() {
  try { const r = reg || await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch { return null; }
}
async function enablePush() {
  if (Notification.permission === 'denied') throw new Error(t('Notifications are blocked. Allow them in your browser’s site settings.'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('Notifications are blocked. Allow them in your browser’s site settings.'));
  const r = reg || await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key');
  const sub = (await r.pushManager.getSubscription()) || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await api('POST', '/api/push/subscribe', sub.toJSON());
}
async function disablePush() {
  const sub = await currentSub(); if (!sub) return;
  await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

function card() {
  const rows = [];
  const standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  if (!window.__TW_DESKTOP && !standalone) {
    const install = h('button', { class: 'btn', type: 'button', hidden: !deferred }, t('Install'));
    const note = h('p', { class: 'muted small', text: deferred ? t('Add it to your home screen or desktop so it opens like a normal app.') : t('Already installed, or your browser offers it in its menu (Add to Home screen).') });
    install.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; install.hidden = true; });
    document.addEventListener('tw:installable', () => { install.hidden = false; note.textContent = t('Add it to your home screen or desktop so it opens like a normal app.'); });
    rows.push(h('div', { class: 'stack', style: 'gap:8px' }, h('b', { text: t('Install Third Wheel') }), note, install));
  }
  const pushBox = h('div', { class: 'stack', style: 'gap:8px' }, h('b', { text: t('Notifications' ) }));
  if (window.__TW_DESKTOP) { pushBox.hidden = true; }
  else if (!window.isSecureContext) pushBox.append(h('p', { class: 'muted small', text: t('Notifications need a secure (https) connection. Ask the server owner to turn on https.') }));
  else if (!('PushManager' in window) || !('Notification' in window)) pushBox.append(h('p', { class: 'muted small', text: t('This browser can’t show notifications.') }));
  else {
    pushBox.append(h('p', { class: 'muted small', text: t('Get notified about messages, mentions, friend requests and LFG even when the app is closed.') }));
    const slot = h('div');
    pushBox.append(slot);
    currentSub().then(sub => {
      const sw = switchEl(!!sub && Notification.permission === 'granted', async (on) => {
        try { if (on) { await enablePush(); toast(t('Notifications on for this device')); } else { await disablePush(); toast(t('Notifications off')); } }
        catch (e) { toast(e.message || t('Couldn’t turn on notifications.'), 'error'); sw.setAttribute('aria-checked', 'false'); }
      }, t('Notifications'));
      slot.append(sw);
    });
  }
  rows.push(pushBox);
  return h('div', { class: 'card', style: 'padding:24px;display:flex;flex-direction:column;gap:18px' }, h('h3', { text: t('App and notifications') }), ...rows);
}

document.addEventListener('tw:settings-tab', (e) => {
  if (window.__TW_DESKTOP) return;
  if (e.detail.tab === 'account' && !e.detail.root.querySelector('.pwa-card')) { const c = card(); c.classList.add('pwa-card'); e.detail.root.append(c); }
});
/* ---- "Install the app" pop-up for phones using the website ----
   Shown once you're signed in, only on touch phones that aren't already running the installed app. Android/Chrome gets a real Install button;
   iPhone and other browsers get the short "Add to Home Screen" steps. "Not now" hides it for 14 days; "Don't ask again" hides it for good. */
const DISMISS_KEY = 'tw_install_dismissed';   // timestamp, or 'never'
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isPhone = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) && Math.min(screen.width, innerWidth) < 900;
function dismissedRecently() {
  try { const v = localStorage.getItem(DISMISS_KEY); if (v === 'never') return true; return !!v && Date.now() - Number(v) < 14 * 864e5; } catch { return false; }
}
let installPop = null;
function showInstallPop() {
  if (installPop || window.__TW_DESKTOP || isStandalone() || !isPhone() || dismissedRecently()) return;
  const close = (how) => {
    try { localStorage.setItem(DISMISS_KEY, how === 'never' ? 'never' : String(Date.now())); } catch { /* ignore */ }
    if (installPop) { installPop.classList.add('out'); const el = installPop; setTimeout(() => el.remove(), 250); installPop = null; }
  };
  const steps = h('ol', { class: 'install-steps', hidden: true },
    ...(isIOS()
      ? [t('Tap the Share button in Safari’s toolbar.'), t('Scroll down and tap “Add to Home Screen”.'), t('Tap “Add”. The app now lives on your home screen.')]
      : [t('Open the browser menu (the three dots).'), t('Tap “Install app” or “Add to Home screen”.')]).map(x => h('li', { text: x })));
  const primary = h('button', { class: 'btn primary', type: 'button' }, deferred ? t('Install') : t('Show me how'));
  primary.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => ({})); deferred = null; if (r && r.outcome === 'accepted') close('later'); else primary.textContent = t('Show me how'); return; }
    steps.hidden = !steps.hidden; primary.textContent = steps.hidden ? t('Show me how') : t('Got it'); if (steps.hidden) close('later');
  });
  installPop = h('div', { class: 'install-pop', role: 'dialog', 'aria-label': t('Get the Third Wheel app') },
    h('div', { class: 'install-top' }, h('img', { src: '/icon-192.png', alt: '', width: 44, height: 44 }),
      h('div', { class: 'install-text' }, h('b', { text: t('Get the Third Wheel app') }), h('span', { class: 'muted small', text: t('Full screen, faster, and notifications when friends message you.') }))),
    steps,
    h('div', { class: 'install-actions' }, primary, h('button', { class: 'btn ghost', type: 'button', onclick: () => close('later') }, t('Not now')),
      h('button', { class: 'linklike small', type: 'button', onclick: () => close('never') }, t('Don’t ask again'))));
  document.body.append(installPop);
}
// wait until the person is signed in and looking at the app, then give them a moment before asking
(function waitThenAsk() {
  if (window.__TW_DESKTOP || isStandalone() || !isPhone() || dismissedRecently()) return;
  let seen = 0;
  const timer = setInterval(() => {
    if (installPop) { clearInterval(timer); return; }
    if (TW.me && document.querySelector('.shell') && !document.querySelector('.overlay')) { seen += 1; if (seen >= 4) { clearInterval(timer); showInstallPop(); } } else seen = 0;
  }, 2000);
})();
window.addEventListener('appinstalled', () => { try { localStorage.setItem(DISMISS_KEY, 'never'); } catch { /* ignore */ } if (installPop) { installPop.remove(); installPop = null; } });

window.TWPwa = { card, showInstallPop };
})();
