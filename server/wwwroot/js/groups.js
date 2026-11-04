/* Groups feature module: roles, moderation (kick / ban / mute), rules, join requests, bans and group settings.
   Loaded after app.js; app.js's groupView calls window.TWG. Everything is built with createElement/textContent (no innerHTML). */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, icon, api, enc, toast, T, nm, avatar, openSheet, confirmSheet, btn, busy, field, selectEl, emptyState, openProfile, personRow, stagger } = TW;

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

/* Clicking a member opens their mini-profile; moderation lives in that sheet's ⋯ menu (see profileMenu). */
function members(g, reload) {
  const wrap = h('div', { class: 'members stagger-pop', 'aria-label': 'Members' });
  for (const m of g.members || []) {
    wrap.append(h('button', { class: 'member', type: 'button', 'aria-label': 'View ' + nm(m) + '’s profile', onclick: () => openProfile(m.id, { group: g, member: m, reload }) },
      avatar(m, 'sm'), nm(m), roleBadge(m.role), m.mutedUntil ? h('span', { class: 'mute-flag', text: 'Muted', title: 'Muted by a moderator' }) : null));
  }
  stagger(wrap);
  return wrap;
}

/* ---------- the ⋯ menu in the mini-profile: group moderation (when opened from a group), block, report ---------- */
const REPORT_REASONS = [['Spam', 'Spam'], ['Harassment or hate', 'Harassment or hate'], ['Inappropriate content', 'Inappropriate or NSFW content'],
  ['Cheating', 'Cheating'], ['Impersonation', 'Impersonation'], ['Other', 'Something else']];

function openReport(p, g) {
  let close = () => {};
  const reason = selectEl(REPORT_REASONS, '', 'Choose a reason');
  const note = h('textarea', { class: 'textarea', maxlength: 500, rows: 4, placeholder: 'Anything that helps the admins understand (optional)', 'aria-label': 'Details' });
  const fr = field('Reason', reason), fn = field('Details', note);
  const send = btn('Send report', { cls: 'danger' });
  send.addEventListener('click', () => {
    if (!fr.setError(reason.value ? '' : 'Choose a reason')) return;
    busy(send, async () => {
      await api('POST', '/api/reports', { reportedUserId: p.id, groupId: g ? g.id : null, reason: reason.value, details: note.value.trim() });
      toast('Report sent. Thank you.'); close();
    });
  });
  close = openSheet('Report ' + nm(p), h('div', { class: 'stack' },
    h('p', { class: 'muted', text: 'Admins review every report. The person isn’t told who reported them.' }), fr, fn, send));
}

async function profileMenu(anchor, p, opts, closeProfile) {
  opts = opts || {};
  const g = opts.group, m = opts.member, entries = [];
  if (g && m && g.isMember) {
    const mods = memberActions(g, m, () => { closeProfile(); if (opts.reload) opts.reload(); });
    if (mods.length) { entries.push(...mods, '-'); }
  }
  let blocked = false;
  try { blocked = (await api('GET', '/api/me/blocks')).some(b => b.id === p.id); } catch { /* menu still works without the state */ }
  if (blocked) {
    entries.push({ label: 'Unblock ' + nm(p), onClick: () => api('DELETE', '/api/me/blocks/' + p.id).then(() => { toast(nm(p) + ' is unblocked'); closeProfile(); }).catch(e => toast(e.message, 'error')) });
  } else {
    entries.push({ label: 'Block ' + nm(p) + '…', danger: true, onClick: () => confirmSheet('Block ' + nm(p) + '?',
      'You’ll be removed as friends and they won’t be able to message you. You can unblock them later from their profile.', 'Block',
      async () => { await api('POST', '/api/me/blocks/' + p.id); toast(nm(p) + ' is blocked'); closeProfile(); TW.loadSocial().catch(() => {}); }) });
  }
  entries.push({ label: 'Report ' + nm(p) + '…', danger: true, onClick: () => openReport(p, g) });
  showMenu(anchor, entries);
}

/* ---------- invite code + link, limits ---------- */
const fmtSlow = (s) => s >= 60 && s % 60 === 0 ? (s / 60) + 'm' : s + 's';
const isFull = (g) => (g.maxMembers || 0) > 0 && (g.memberCount || 0) >= g.maxMembers;

/** Chips for the group header: member cap and slowmode. */
function extraChips(g) {
  const out = [];
  if ((g.maxMembers || 0) > 0) out.push(h('span', { class: 'chip' + (isFull(g) ? ' bad' : ''), text: isFull(g) ? `Full · max ${g.maxMembers}` : `Max ${g.maxMembers}` }));
  if ((g.slowmode || 0) > 0) out.push(h('span', { class: 'chip', text: 'Slowmode ' + fmtSlow(g.slowmode) }));
  return out;
}

function inviteLink(code) { return `${location.origin}/#/join/${code}`; }
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
  ta.value = text; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
function copyInvite(g) {
  const link = inviteLink(g.joinCode);
  copyText(link).then((ok) => {
    if (ok) { toast('Invite link copied'); return; }
    // last resort: show the link so it can be copied by hand
    const box = h('input', { class: 'input', type: 'text', readonly: true, value: link, 'aria-label': 'Invite link' });
    openSheet('Invite link', h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Copy this link and send it to your friends.' }), box));
    box.focus(); box.select();
  });
}
/** Join code pill + "Copy invite link" (members only). */
function inviteRow(g) {
  if (!g.isMember || !g.joinCode) return null;
  return h('div', { class: 'invite-row' },
    h('span', { class: 'muted small', text: 'Join code' }),
    h('code', { class: 'join-code', text: g.joinCode, 'aria-label': 'Join code ' + g.joinCode.split('').join(' ') }),
    btn('Copy invite link', { cls: 'small ghost', onclick: () => copyInvite(g) }));
}

const SLOW_OPTIONS = [[0, 'Off'], [5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes']];
/** Max-members input + slowmode dropdown, shared by the create sheet and the settings sheet. */
function limitFields(cur) {
  cur = cur || {};
  const opts = SLOW_OPTIONS.map(([v, l]) => [String(v), l]);
  if (cur.slowmode > 0 && !SLOW_OPTIONS.some(([v]) => v === cur.slowmode)) opts.push([String(cur.slowmode), cur.slowmode + ' seconds']);
  const max = h('input', { class: 'input', type: 'number', min: 0, max: 500, inputmode: 'numeric', placeholder: 'No limit', 'aria-label': 'Maximum members', value: cur.maxMembers > 0 ? cur.maxMembers : '' });
  max.addEventListener('change', () => { const v = parseInt(max.value, 10); max.value = Number.isFinite(v) && v > 0 ? Math.min(500, v) : ''; });
  const slow = selectEl(opts, String(cur.slowmode || 0));
  return {
    el: h('div', { class: 'row limit-row' }, field('Max members', max, 'Empty = no limit (up to 500).'), field('Slowmode', slow, 'Wait between messages. Moderators are exempt.')),
    values() { const n = parseInt(max.value, 10); return { maxMembers: Number.isFinite(n) && n > 0 ? Math.min(500, n) : 0, slowmode: parseInt(slow.value, 10) || 0 }; }
  };
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
  if (isFull(g) && !TW.me.isAdmin) {
    const full = btn('Group full', { cls: 'small' });
    full.disabled = true; full.setAttribute('aria-disabled', 'true'); full.title = `This group is at its limit of ${g.maxMembers} members.`;
    return [h('span', { class: 'chip bad', text: `Max ${g.maxMembers}` }), full];
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

function groupTile(g, sz = '') {
  const cls = 'gtile' + (sz ? ' ' + sz : '');
  if (g.icon) {
    return h('span', { class: cls, 'aria-hidden': 'true' },
      h('img', { src: g.icon, alt: '', style: 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;' }));
  }
  const tile = h('span', { class: cls, 'aria-hidden': 'true', text: (T(g.name)[0] || '?').toUpperCase() });
  tile.style.background = TW.safeColor(g.color);
  tile.style.color = TW.ink(g.color);
  return tile;
}

function openSettings(g, reload) {
  let close = () => {};

  /* group icon */
  const iconPrev = h('div', { class: 'group-icon-prev', style: 'width:64px;height:64px;border-radius:16px;overflow:hidden;flex:none;display:grid;place-items:center;background:var(--color-raised);border:1px solid var(--color-border);' });
  const drawIconPrev = () => {
    if (g.icon) {
      iconPrev.replaceChildren(h('img', { src: g.icon, alt: '', style: 'width:100%;height:100%;object-fit:cover;display:block;' }));
    } else {
      iconPrev.replaceChildren(h('span', { class: 'gtile big', style: 'background:' + TW.safeColor(g.color) + ';color:' + TW.ink(g.color) + ';width:100%;height:100%;display:grid;place-items:center;font-size:24px;font-weight:700;', text: (T(g.name)[0] || '?').toUpperCase() }));
    }
  };
  drawIconPrev();
  const iconFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', class: 'sr-only', tabindex: '-1', 'aria-label': 'Choose a group picture' });
  const upIconBtn = btn('Upload icon', { cls: 'small', icon: 'plus', onclick: () => iconFile.click() });
  const rmIconBtn = btn('Remove', { cls: 'small ghost', onclick: () => busy(rmIconBtn, async () => {
    await api('DELETE', '/api/groups/' + enc(g.id) + '/icon');
    g.icon = null;
    drawIconPrev();
    rmIconBtn.hidden = true;
    await TW.refreshMine();
    toast('Group icon removed');
    reload();
  }) });
  rmIconBtn.hidden = !g.icon;
  iconFile.addEventListener('change', () => {
    const f = iconFile.files && iconFile.files[0]; iconFile.value = ''; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('Image must be 5 MB or smaller.', 'error'); return;
    }
    busy(upIconBtn, async () => {
      const cropped = await TW.cropImage(f, { aspect: 1, shape: 'rect', title: 'Crop group picture', outWidth: 512, outHeight: 512 });
      if (!cropped) return;
      const resp = await fetch('/api/groups/' + enc(g.id) + '/icon', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-TW': '1', 'Content-Type': cropped.type || 'application/octet-stream' },
        body: cropped
      });
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); throw new Error(j.error || 'Upload failed'); }
      const res = await resp.json();
      g.icon = res.icon;
      drawIconPrev();
      rmIconBtn.hidden = false;
      await TW.refreshMine();
      toast('Group icon updated');
      reload();
    });
  });
  const iconSection = h('div', { class: 'field', style: 'display:flex;align-items:center;gap:16px;' },
    iconPrev,
    h('div', { class: 'stack', style: 'gap:6px;' },
      h('span', { class: 'label', style: 'margin:0;', text: 'Group picture' }),
      h('div', { class: 'row', style: 'gap:8px;flex:none;flex-wrap:wrap;' }, upIconBtn, rmIconBtn),
      iconFile
    )
  );

  const name = h('input', { class: 'input', type: 'text', maxlength: 40 }); name.value = T(g.name);
  const desc = h('textarea', { class: 'textarea', maxlength: 300 }); desc.value = T(g.description || '');
  const privacy = selectEl([['public', 'Public: anyone can join'], ['request', 'Request to join: moderators approve people'], ['private', 'Private: invite only, not listed anywhere']], g.privacy || 'public');
  const rules = h('textarea', { class: 'textarea', maxlength: 1000, rows: 5 }); rules.value = T(g.rules || '');
  const fn = field('Group name', name), fd = field('Description', desc), fp = field('Who can join', privacy), fr = field('Rules', rules);
  const lim = limitFields(g);
  const save = h('button', { class: 'btn block', type: 'submit' }, 'Save changes');
  const form = h('form', { class: 'stack', style: 'gap:12px', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!fn.setError(name.value.trim().length >= 3 ? '' : 'Give it a name (3+ characters)')) return;
    await busy(save, async () => {
      await api('PUT', base(g) + '/settings', { name: name.value.trim(), description: desc.value.trim(), privacy: privacy.value, rules: rules.value.trim(), ...lim.values() });
      await TW.refreshMine(); toast('Group updated'); close(); reload();
    });
  } }, iconSection, fn, fd, fp, lim.el, fr, save);
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

/* ---------- #/join/<code>: preview a group from an invite link and join it ---------- */
const JOIN_RE = /^[A-Za-z0-9]{6}$/;
const AUDIENCE = (g) => g.ageMax <= 17 ? 'Ages 13–17' : g.ageMin >= 18 ? 'Ages 18+' : `Ages ${g.ageMin}–${g.ageMax}`;

function joinProblem(e) {
  const m = (e && e.message) || '';
  if (/banned/i.test(m)) return ['You can’t join this group', 'You’ve been banned from it by a moderator.'];
  if (/\bage\b/i.test(m)) return ['This group isn’t available for your age', 'Groups are split into under-18 and 18+ communities so everyone plays with people their age.'];
  if (/full|maximum/i.test(m) || (e && e.status === 409)) return ['This group is full', m || 'It has reached its member limit. Ask a moderator to make room.'];
  if (e && e.status === 404) return ['That invite link doesn’t match a group', 'Check the link or ask for a new one. The group may have been deleted.'];
  if (e && e.status === 403) return ['This group isn’t available to you', 'It may be private, or meant for a different age group. Groups are split into under-18 and 18+ communities.'];
  return ['That didn’t load', m || 'Please try again.'];
}

async function joinView(code, tok) {
  const page = (...kids) => h('div', { class: 'page join-page' }, ...kids);
  const clean = String(code || '').trim();
  if (!JOIN_RE.test(clean)) { TW.show(page(emptyState('That invite link doesn’t look right', 'Invite codes are 6 letters and numbers. Check the link you were sent.', btn('Go to the feed', { onclick: () => TW.go('#/feed') })))); return; }
  const upper = clean.toUpperCase();
  let g;
  try { g = await api('GET', '/api/groups/by-code/' + encodeURIComponent(upper)); }
  catch (e) { if (!TW.stale(tok)) { const [t, m] = joinProblem(e); TW.show(page(emptyState(t, m, btn('Go to the feed', { onclick: () => TW.go('#/feed') })))); } return; }
  if (TW.stale(tok)) return;

  const full = isFull(g) && !TW.me.isAdmin;
  const err = h('div', { class: 'form-error', role: 'alert' });
  const join = btn(g.isMember ? 'Open group' : full ? 'Group full' : 'Join group', { cls: g.isMember ? 'ghost' : '' });
  if (full && !g.isMember) { join.disabled = true; join.setAttribute('aria-disabled', 'true'); }
  join.addEventListener('click', () => {
    if (g.isMember) { TW.go('#/group/' + encodeURIComponent(g.id)); return; }
    busy(join, async () => {
      err.textContent = '';
      try {
        const r = await api('POST', '/api/groups/by-code/' + encodeURIComponent(upper) + '/join');
        await TW.refreshMine();
        toast('You joined ' + T(g.name));
        TW.go('#/group/' + encodeURIComponent(r.id || g.id));
      } catch (e) { err.textContent = joinProblem(e).join(' '); }
    });
  });
  const chips = [h('span', { class: 'chip accent', style: 'display:inline-flex;align-items:center;gap:4px;' }, (TW.gameThumb ? TW.gameThumb(g.game) : null), h('span', { text: T(g.game) })), h('span', { class: 'chip', text: g.mode === 'competitive' ? 'Competitive' : 'Casual' }),
    g.region ? h('span', { class: 'chip', text: T(g.region) }) : null, h('span', { class: 'chip', text: AUDIENCE(g) }),
    h('span', { class: 'chip', text: `${g.memberCount || 0} member${g.memberCount === 1 ? '' : 's'}` }),
    g.privacy === 'private' ? h('span', { class: 'chip', text: 'Private' }) : g.privacy === 'request' ? h('span', { class: 'chip', text: 'Usually needs approval' }) : null,
    ...extraChips(g)];
  const note = g.isMember ? 'You’re already a member of this group.'
    : full ? `This group has reached its limit of ${g.maxMembers} members.`
    : g.privacy === 'request' ? 'This group normally approves new members, but this invite link lets you in right away.'
    : 'You’re invited. Join to see the chat and the other members.';
  const card = h('div', { class: 'card join-card' },
    h('div', { class: 'join-head' }, groupTile(g, 'big'),
      h('div', { class: 'join-title' }, h('h1', { text: T(g.name) }), h('p', { class: 'muted small', text: 'Invite code ' + upper }))),
    h('div', { class: 'chips' }, chips),
    g.description ? h('p', { class: 'join-desc', text: T(g.description) }) : null,
    g.rules ? h('div', { class: 'section' }, h('div', { class: 'section-title', text: 'Group rules' }), h('p', { class: 'rules-text', text: T(g.rules) })) : null,
    h('p', { class: 'muted', text: note }), err,
    h('div', { class: 'row', style: 'gap:8px;flex:none' }, join, btn('Not now', { cls: 'ghost', onclick: () => TW.go('#/feed') })));
  TW.show(page(card));
}

window.TWG = { groupTile, members, headerButtons, joinControls, openRules, openSettings, openRequests, openBans, showMenu, profileMenu, openReport, inviteRow, extraChips, limitFields, joinView, copyInvite, isFull };
})();
