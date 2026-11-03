/* Groups feature module: roles, moderation (kick / ban / mute), rules, join requests, bans and group settings.
   Loaded after app.js; app.js's groupView calls window.TWG. Everything is built with createElement/textContent (no innerHTML). */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, icon, api, toast, T, nm, avatar, openSheet, confirmSheet, btn, busy, field, selectEl, emptyState, openProfile, personRow, stagger } = TW;

const base = (g) => `/api/groups/${encodeURIComponent(g.id)}`;
const roleLabel = { owner: 'Owner', mod: 'Mod' };
const roleBadge = (role) => roleLabel[role] ? h('span', { class: 'role-badge ' + role, text: roleLabel[role] }) : null;

/* ---------- small keyboard-friendly popup menu (custom: no native menus) ---------- */
let closeOpenMenu = null;
function showMenu(anchor, entries) {
  if (closeOpenMenu) closeOpenMenu();
  const menu = h('div', { class: 'gmenu', role: 'menu' });
  const items = [];
  for (const e of entries) {
    if (e === '-') { menu.append(h('div', { class: 'gmenu-sep', role: 'separator' })); continue; }
    const b = h('button', { type: 'button', role: 'menuitem', class: 'gmenu-item' + (e.danger ? ' danger' : '') }, e.label,
      e.badge ? h('span', { class: 'count-badge', text: String(e.badge) }) : null);
    b.addEventListener('click', () => { close(true); e.onClick(); });
    menu.append(b); items.push(b);
  }
  menu.style.transition = 'none';                 // no property transitions: the menu must be focusable the moment it opens
  menu.style.left = '-9999px'; menu.style.top = '0px';   // measure off-screen, then place
  document.body.append(menu);
  const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  const left = Math.min(Math.max(8, r.right - mw), innerWidth - mw - 8);
  let top = r.bottom + 6, up = false;
  if (top + mh > innerHeight - 8) { top = Math.max(8, r.top - mh - 6); up = true; }
  menu.style.left = left + 'px'; menu.style.top = top + 'px';
  menu.style.transformOrigin = up ? 'bottom right' : 'top right';
  if (!TWM.reduce()) menu.animate([{ opacity: 0, transform: `translateY(${up ? 6 : -6}px) scale(.94)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: TWM.SPRING });
  anchor.setAttribute('aria-expanded', 'true');
  const onKey = (e) => {
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Tab') close(false);
  };
  const onDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(false); };
  const onScroll = (e) => { if (!menu.contains(e.target)) close(false); };
  function close(refocus) {
    if (closeOpenMenu !== close) return;
    closeOpenMenu = null;
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('scroll', onScroll, true); removeEventListener('resize', closeNow);
    anchor.setAttribute('aria-expanded', 'false');
    menu.remove();
    if (refocus && anchor.isConnected) anchor.focus();
  }
  const closeNow = () => close(false);
  closeOpenMenu = close;
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('scroll', onScroll, true); addEventListener('resize', closeNow);
  items[0] && items[0].focus();
}

/* ---------- member list with role badges + moderation menu ---------- */
function memberActions(g, m, reload) {
  const me = TW.me;
  if (!g.canModerate || m.id === me.id) return [];
  const iAmOwner = g.myRole === 'owner' || me.isAdmin;
  const can = me.isAdmin || g.myRole === 'owner' || (g.myRole === 'mod' && m.role === 'member');
  if (!can) return [];
  const path = `${base(g)}/members/${m.id}`;
  const done = (msg) => { toast(msg); reload(); };
  const acts = [];
  if (iAmOwner && m.role !== 'owner') {
    acts.push(m.role === 'member'
      ? { label: 'Make moderator', onClick: () => api('POST', path + '/role', { role: 'mod' }).then(() => done(nm(m) + ' is now a moderator')).catch(e => toast(e.message, 'error')) }
      : { label: 'Remove moderator', onClick: () => api('POST', path + '/role', { role: 'member' }).then(() => done(nm(m) + ' is a regular member again')).catch(e => toast(e.message, 'error')) });
    acts.push({ label: 'Make owner…', onClick: () => confirmSheet('Transfer ownership?', `${nm(m)} becomes the owner of ${T(g.name)} and you become a moderator.`, 'Transfer ownership',
      async () => { await api('POST', path + '/role', { role: 'owner' }); done('Ownership transferred to ' + nm(m)); }) });
    acts.push('-');
  }
  if (m.mutedUntil) acts.push({ label: 'Unmute', onClick: () => api('DELETE', path + '/mute').then(() => done(nm(m) + ' can chat again')).catch(e => toast(e.message, 'error')) });
  else for (const [label, minutes] of [['Mute for 10 minutes', 10], ['Mute for 1 hour', 60], ['Mute for 1 day', 1440], ['Mute until unmuted', 0]])
    acts.push({ label, onClick: () => api('POST', path + '/mute', { minutes }).then(() => done(nm(m) + ' is muted')).catch(e => toast(e.message, 'error')) });
  acts.push('-');
  acts.push({ label: 'Kick from group…', danger: true, onClick: () => confirmSheet('Kick ' + nm(m) + '?', 'They’ll be removed from the group. If it’s open to everyone they can join again; ban them to stop that.', 'Kick',
    async () => { await api('POST', path + '/kick'); done(nm(m) + ' was kicked'); }) });
  acts.push({ label: 'Ban from group…', danger: true, onClick: () => {
    const why = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'Reason (moderators can see it)', 'aria-label': 'Ban reason' });
    confirmSheet('Ban ' + nm(m) + '?', 'They’ll be removed and can’t see, join or request this group again until a moderator unbans them.', 'Ban',
      async () => { await api('POST', path + '/ban', { reason: why.value.trim() }); done(nm(m) + ' was banned'); }, why);
  } });
  return acts;
}

function members(g, reload) {
  const wrap = h('div', { class: 'members stagger-pop', 'aria-label': 'Members' });
  for (const m of g.members || []) {
    const chip = h('button', { class: 'member', type: 'button', 'aria-label': 'View ' + nm(m) + '’s profile', onclick: () => openProfile(m.id) },
      avatar(m, 'sm'), nm(m), roleBadge(m.role), m.mutedUntil ? h('span', { class: 'mute-flag', text: 'Muted', title: 'Muted by a moderator' }) : null);
    const cell = h('span', { class: 'member-wrap' }, chip);
    const acts = memberActions(g, m, reload);
    if (acts.length) {
      const more = h('button', { class: 'member-more', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Moderate ' + nm(m), text: '⋯' });
      more.addEventListener('click', () => showMenu(more, acts));
      cell.append(more);
    }
    wrap.append(cell);
  }
  stagger(wrap);
  return wrap;
}

/* ---------- header buttons (members) and join controls (non-members) ---------- */
function headerButtons(g, reload) {
  const out = [];
  if (g.rules || g.canModerate) out.push(btn('Rules', { cls: 'small ghost', onclick: () => openRules(g, reload) }));
  if (g.canModerate) {
    const more = btn('Manage', { cls: 'small ghost', onclick: () => {
      const e = [{ label: g.rules ? 'Edit rules' : 'Write rules', onClick: () => openRules(g, reload, true) }];
      if (g.privacy === 'request' || g.pending) e.push({ label: 'Join requests', badge: g.pending || 0, onClick: () => openRequests(g, reload) });
      e.push({ label: 'Banned members', onClick: () => openBans(g, reload) });
      if (g.isOwner) { e.push('-'); e.push({ label: 'Group settings', onClick: () => openSettings(g, reload) }); }
      showMenu(more, e);
    } });
    more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
    if (g.pending) more.append(h('span', { class: 'count-badge', text: String(g.pending), 'aria-label': g.pending + ' pending requests' }));
    out.push(more);
  }
  return out;
}

function joinControls(g, reload) {
  const joined = async (msg) => { await TW.refreshMine(); toast(msg); reload(); };
  if (g.requested) {
    const cancel = btn('Cancel request', { cls: 'small ghost' });
    cancel.addEventListener('click', () => busy(cancel, async () => { await api('DELETE', base(g) + '/request'); toast('Request cancelled'); reload(); }));
    return [h('span', { class: 'chip', text: 'Request pending' }), cancel];
  }
  if (g.privacy === 'request' && !g.invited) {
    const ask = btn('Request to join', { cls: 'small' });
    ask.addEventListener('click', () => busy(ask, async () => { await api('POST', base(g) + '/request'); toast('Request sent'); reload(); }));
    return [ask];
  }
  const join = btn(g.invited ? 'Join (you’re invited)' : 'Join group', { cls: 'small' });
  join.addEventListener('click', () => busy(join, async () => { await api('POST', base(g) + '/join'); await joined('You joined ' + T(g.name)); }));
  return [join];
}

/* ---------- sheets ---------- */
function openRules(g, reload, editNow) {
  let close = () => {};
  const text = h('div', { class: 'rules-text' }, g.rules ? T(g.rules) : '');
  if (!g.rules) text.append(h('span', { class: 'muted', text: g.canModerate ? 'No rules yet. Add some so new members know what’s expected.' : 'This group hasn’t set any rules.' }));
  const parts = [text];
  if (g.canModerate) {
    const area = h('textarea', { class: 'textarea', maxlength: 1000, rows: 6, placeholder: '1. Be kind\n2. No spam\n3. Have fun', 'aria-label': 'Group rules' });
    area.value = T(g.rules || '');
    const save = btn('Save rules', { icon: 'check' });
    save.addEventListener('click', () => busy(save, async () => { await api('PUT', base(g) + '/settings', { rules: area.value.trim() }); toast('Rules saved'); close(); reload(); }));
    parts.length = 0; parts.push(field('Rules (shown to every member)', area), h('div', {}, save));
  }
  close = openSheet('Rules · ' + T(g.name), h('div', { class: 'stack' }, ...parts));
}

function openSettings(g, reload) {
  let close = () => {};
  const name = h('input', { class: 'input', type: 'text', maxlength: 40 }); name.value = T(g.name);
  const desc = h('textarea', { class: 'textarea', maxlength: 300 }); desc.value = T(g.description || '');
  const privacy = selectEl([['public', 'Public: anyone can join'], ['request', 'Request to join: moderators approve people'], ['private', 'Private: invite only, not listed anywhere']], g.privacy || 'public');
  const rules = h('textarea', { class: 'textarea', maxlength: 1000, rows: 5 }); rules.value = T(g.rules || '');
  const fn = field('Group name', name), fd = field('Description', desc), fp = field('Who can join', privacy), fr = field('Rules', rules);
  const save = h('button', { class: 'btn block', type: 'submit' }, 'Save changes');
  const form = h('form', { class: 'stack', style: 'gap:12px', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!fn.setError(name.value.trim().length >= 3 ? '' : 'Give it a name (3+ characters)')) return;
    await busy(save, async () => {
      await api('PUT', base(g) + '/settings', { name: name.value.trim(), description: desc.value.trim(), privacy: privacy.value, rules: rules.value.trim() });
      await TW.refreshMine(); toast('Group updated'); close(); reload();
    });
  } }, fn, fd, fp, fr, save);
  close = openSheet('Group settings', form);
}

function openRequests(g, reload) {
  const list = h('div', { class: 'stack', style: 'gap:8px' });
  let close = () => {};
  const draw = (rows) => {
    list.replaceChildren(...(rows.length ? rows.map(p => {
      const ok = btn('Approve', { cls: 'small' }), no = btn('Deny', { cls: 'small ghost' });
      const row = personRow(p, { action: [ok, no] });
      ok.addEventListener('click', () => busy(ok, async () => { await api('POST', `${base(g)}/requests/${p.id}/approve`); toast(nm(p) + ' joined'); row.remove(); after(); }));
      no.addEventListener('click', () => busy(no, async () => { await api('POST', `${base(g)}/requests/${p.id}/deny`); row.remove(); after(); }));
      return row;
    }) : [emptyState('No pending requests', 'When someone asks to join, they’ll show up here.')]));
  };
  const after = () => { if (!list.querySelector('.frow')) { draw([]); reload(); } };
  list.append(h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  close = openSheet('Join requests', list);
  api('GET', base(g) + '/requests').then(draw).catch(e => { toast(e.message, 'error'); close(); });
}

function openBans(g, reload) {
  const list = h('div', { class: 'stack', style: 'gap:8px' });
  let close = () => {};
  const draw = (rows) => {
    list.replaceChildren(...(rows.length ? rows.map(p => {
      const un = btn('Unban', { cls: 'small ghost' });
      const row = personRow(p, { action: un });
      if (p.reason) row.querySelector('.meta')?.append(h('span', { class: 'ban-reason', text: 'Reason: ' + T(p.reason) }));
      un.addEventListener('click', () => busy(un, async () => { await api('DELETE', `${base(g)}/bans/${p.id}`); toast(nm(p) + ' was unbanned'); row.remove(); if (!list.querySelector('.frow')) draw([]); }));
      return row;
    }) : [emptyState('No banned members', 'People you ban from this group will be listed here.')]));
  };
  list.append(h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  close = openSheet('Banned members', list);
  api('GET', base(g) + '/bans').then(draw).catch(e => { toast(e.message, 'error'); close(); });
}

window.TWG = { members, headerButtons, joinControls, openRules, openSettings, openRequests, openBans, showMenu };
})();
