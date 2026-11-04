/* Touch gestures: pull down at the top of a page to refresh it. (Swipe-to-reply lives in chat.js.) Only on touch screens. */
(() => {
'use strict';
const TW = window.TW;
if (!TW || !window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
const { h, icon } = TW;

TWPrefs.addStrings('sv', { 'Pull to refresh': 'Dra för att uppdatera', 'Release to refresh': 'Släpp för att uppdatera' });

const THRESHOLD = 72;
let ind = null, startY = 0, startX = 0, pulling = false, dist = 0, scroller = null, busy = false;

function indicator() {
  if (ind) return ind;
  ind = h('div', { class: 'ptr', 'aria-hidden': 'true' }, icon('chev', 20), h('span', { class: 'ptr-t' }));
  document.body.append(ind); return ind;
}
function paint(d) {
  const el = indicator(), p = Math.min(1, d / THRESHOLD);
  el.style.opacity = String(Math.min(1, p * 1.2)); el.style.transform = `translate(-50%, ${Math.min(d, 110) * .6}px)`;
  el.classList.toggle('ready', d >= THRESHOLD);
  el.querySelector('.ptr-t').textContent = d >= THRESHOLD ? TW.t('Release to refresh') : TW.t('Pull to refresh');
}
function hide(spin) {
  if (!ind) return;
  ind.classList.toggle('spin', !!spin);
  ind.style.transition = 'opacity .25s, transform .25s'; ind.style.opacity = '0'; ind.style.transform = 'translate(-50%, 0)';
  setTimeout(() => { if (ind) ind.style.transition = ''; }, 300);
}

document.addEventListener('touchstart', (e) => {
  pulling = false; dist = 0; scroller = null;
  if (busy || e.touches.length > 1 || document.querySelector('.overlay, .lightbox, .dd-pop, .gmenu')) return;
  const view = document.getElementById('view');
  if (!view || !view.contains(e.target) || view.querySelector('.chat-page')) return;   // chats scroll on their own
  // refresh only when everything under the finger is already scrolled to the top
  let el = e.target;
  while (el && el !== view.parentElement) { if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible' && el.scrollTop > 0) return; el = el.parentElement; }
  scroller = view; startY = e.touches[0].clientY; startX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!scroller) return;
  const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
  if (!pulling) { if (dy > 14 && dy > Math.abs(dx) * 1.5 && scroller.scrollTop <= 0) pulling = true; else if (dy < -6) { scroller = null; return; } else return; }
  dist = dy * .55; paint(dist);
}, { passive: true });

document.addEventListener('touchend', () => {
  if (!pulling) { scroller = null; return; }
  const go = dist >= THRESHOLD; pulling = false; scroller = null;
  if (!go) { hide(false); return; }
  busy = true; paint(THRESHOLD); hide(true);
  Promise.resolve(TW.route && TW.route()).catch(() => {}).finally(() => setTimeout(() => { busy = false; if (ind) ind.classList.remove('spin'); }, 600));
});
document.addEventListener('touchcancel', () => { pulling = false; scroller = null; hide(false); });
})();
