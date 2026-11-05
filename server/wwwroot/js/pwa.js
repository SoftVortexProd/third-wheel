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
  'Installed': 'Installerad'
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
window.TWPwa = { card };
})();
