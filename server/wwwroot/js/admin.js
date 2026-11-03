/* Account + admin tools: users change their password; admins edit a user's profile/settings/password and rename groups.
   Loaded after app.js and uses its helpers through window.TW. */
(() => {
'use strict';
const TW = window.TW;
const { h, api, toast, btn, busy, field, selectEl, suggestInput, openSheet, confirmSheet, T, nm, avatar, enc } = TW;
const gname = (g) => (typeof g === 'string' ? g : (g && g.name) || '');

/* ---- Settings: change my password ---- */
window.TWAccount = {
  card() {
    const cur = h('input', { class: 'input', type: 'password', maxlength: 128, autocomplete: 'current-password', placeholder: 'Your current password' });
    const next = h('input', { class: 'input', type: 'password', maxlength: 72, autocomplete: 'new-password', placeholder: 'At least 8 characters' });
    const again = h('input', { class: 'input', type: 'password', maxlength: 72, autocomplete: 'new-password', placeholder: 'Type it again' });
    const fc = field('Current password', cur), fn = field('New password', next, '8–72 characters.'), fa = field('Repeat new password', again);
    const save = h('button', { class: 'btn', type: 'submit' }, 'Change password');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const ok = [fc.setError(cur.value ? '' : 'Enter your current password'),
        fn.setError(next.value.length >= 8 && next.value.length <= 72 ? '' : 'Use 8–72 characters'),
        fa.setError(again.value === next.value ? '' : 'The passwords don’t match')].every(Boolean);
      if (!ok) return;
      save.disabled = true; const idle = TWM.busyBtn(save);
      try {
        await api('POST', '/api/me/password', { current: cur.value, password: next.value });
        cur.value = next.value = again.value = '';
        toast('Password changed. Other devices were signed out.');
      } catch (ex) { if (/current/i.test(ex.message)) fc.setError(ex.message); else toast(ex.message, 'error'); }
      finally { save.disabled = false; idle(); }
    } }, fc, h('div', { class: 'row' }, fn, fa), h('div', {}, save));
    return h('div', { class: 'card', style: 'padding:24px' }, h('h3', { text: 'Password', style: 'margin-bottom:12px' }), form);
  }
};

/* ---- Admin: edit a user ---- */
const STATUS = [['online', 'Online'], ['idle', 'Idle'], ['dnd', 'Do not disturb'], ['offline', 'Offline']];
async function editUser(u, onDone) {
  let d;
  try { d = await api('GET', '/api/admin/users/' + enc(u.id)); } catch (e) { toast(e.message, 'error'); return; }
  let close = () => {};
  const finish = () => { close(); if (onDone) onDone(); };

  const dn = h('input', { class: 'input', type: 'text', maxlength: 32, value: T(d.displayName || ''), placeholder: T(d.username), autocomplete: 'off' });
  const un = h('input', { class: 'input', type: 'text', maxlength: 20, value: T(d.username), autocapitalize: 'none', spellcheck: 'false', autocomplete: 'off' });
  const region = selectEl(TW.S.meta.regions, d.region || '', 'Choose a region');
  const age = h('input', { class: 'input', type: 'number', min: 13, max: 99, inputmode: 'numeric', value: d.age || '' });
  const status = selectEl(STATUS, d.status || 'online');
  const playing = h('input', { class: 'input', type: 'text', maxlength: 40, value: T(d.playing || ''), placeholder: 'Nothing', autocomplete: 'off' });
  suggestInput(playing, () => TW.S.meta.games.map(g => [gname(g), gname(g)]));
  const fdn = field('Display name', dn), fun = field('Username', un), fr = field('Region', region), fa = field('Age', age), fs = field('Status', status), fp = field('Playing', playing);

  const gp = (TW.gamePicker || gamePicker)({ multi: true, value: d.favoriteGames || [] });

  const save = btn('Save changes', { icon: 'check' });
  save.addEventListener('click', () => {
    const a = parseInt(age.value, 10);
    const ok = [fun.setError(/^[A-Za-z0-9_]{3,20}$/.test(un.value.trim()) ? '' : 'Use 3–20 letters, numbers or underscores'),
      fr.setError(region.value ? '' : 'Choose a region'), fa.setError(a >= 13 && a <= 99 ? '' : 'Enter an age from 13 to 99')].every(Boolean);
    if (!ok) return;
    busy(save, async () => {
      try {
        await api('PUT', '/api/admin/users/' + enc(d.id), { username: un.value.trim(), displayName: dn.value.trim(), region: region.value, age: a, status: status.value, playing: playing.value.trim(), favoriteGames: gp.value });
        toast('Saved changes to ' + un.value.trim()); finish();
      } catch (ex) { if (/username/i.test(ex.message)) fun.setError(ex.message); else throw ex; }
    });
  });

  const reset = btn('Remove picture & profile text', { cls: 'ghost' });
  reset.addEventListener('click', () => confirmSheet('Reset ' + nm(d) + '’s profile?',
    'Removes their profile picture, display name and “playing” line. The account, friends and groups stay. Use Delete in the list to remove the whole account.',
    'Reset profile', async () => { await api('POST', `/api/admin/users/${enc(d.id)}/reset-profile`); toast('Profile reset'); finish(); }));

  const pw = h('input', { class: 'input', type: 'password', maxlength: 72, autocomplete: 'new-password', placeholder: 'New password (8–72 characters)' });
  const fpw = field('Set a new password', pw, 'They’re signed out everywhere and must log in with this.');
  const setPw = btn('Set password', { cls: 'danger' });
  setPw.addEventListener('click', () => {
    if (!fpw.setError(pw.value.length >= 8 && pw.value.length <= 72 ? '' : 'Use 8–72 characters')) return;
    busy(setPw, async () => { await api('POST', `/api/admin/users/${enc(d.id)}/password`, { password: pw.value }); pw.value = ''; toast('Password changed for ' + T(d.username)); });
  });

  close = openSheet('Edit ' + nm(d), h('div', { class: 'stack', style: 'gap:16px' },
    h('div', { class: 'profile-top' }, avatar(d, 'lg'), h('div', { class: 'profile-names' }, h('b', { text: nm(d) }), h('p', { class: 'muted small', text: '@' + T(d.username) + ' · id ' + d.id }))),
    h('div', { class: 'row' }, fdn, fun), h('div', { class: 'row' }, fr, fa), h('div', { class: 'row' }, fs, fp),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Favorite games' }), gp),
    save,
    h('div', { class: 'danger-zone' }, h('div', { class: 'section-title', text: 'Moderation' }), reset, fpw, h('div', {}, setPw))));
}

/* ---- Admin: rename a group ---- */
function renameGroup(g, onDone) {
  let close = () => {};
  const name = h('input', { class: 'input', type: 'text', maxlength: 40, value: T(g.name), autocomplete: 'off' });
  const f = field('Group name', name, '3–40 characters.');
  const save = btn('Rename group', { icon: 'check' });
  const go = () => {
    if (!f.setError(name.value.trim().length >= 3 ? '' : 'Give it a name (3+ characters)')) return;
    busy(save, async () => {
      try { await api('PUT', `/api/admin/groups/${enc(g.id)}`, { name: name.value.trim() }); toast('Group renamed'); close(); if (onDone) onDone(); TW.refreshMine(); }
      catch (ex) { f.setError(ex.message); }
    });
  };
  save.addEventListener('click', go);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  close = openSheet('Rename group', h('div', { class: 'stack' }, f, save));
}

window.TWAdmin = { editUser, renameGroup };
})();
