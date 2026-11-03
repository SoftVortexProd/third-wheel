/* Chat module: the full-featured chat pane (replies, reactions, edit/delete, typing, attachments, lightbox)
   plus the RCKT pieces (Settings card, admin button, profile badge). Loaded after app.js; uses window.TW.
   app.js's makeChat() delegates here when it is given cfg.conv = { kind: 'g' | 'd', id }. */
(() => {
'use strict';
const TW = window.TW;
if (!TW) return;
const { h, api, toast, T, nm, avatar, openSheet, confirmSheet, btn } = TW;
const MB = 1024 * 1024;
const EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];
const FILE_URL = /^\/api\/files\/\d+$/;
const reduce = () => window.TWM && TWM.reduce();

/* ---------- tiny icon set (paths from the same stroke style as app.js) ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const PATHS = {
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  reply: 'M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  edit: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  file: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  x: 'M18 6L6 18M6 6l12 12',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z'
};
function ico(name, size = 18) {
  const s = document.createElementNS(SVGNS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', PATHS[name]); s.append(p);
  return s;
}
const fmtSize = (n) => n >= MB ? (n / MB).toFixed(n >= 10 * MB ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function refreshMe() {
  try { const m = await api('GET', '/api/me'); TW.me.rckt = m.rckt; TW.me.rcktUntil = m.rcktUntil; return m; } catch { return TW.me; }
}
const rcktBadge = () => h('span', { class: 'rckt-badge', title: 'RCKT subscriber', text: 'RCKT' });
const iconBtn = (name, label, onclick, cls = '') => h('button', { class: 'act-btn ' + cls, type: 'button', 'aria-label': label, title: label, onclick }, ico(name, 16));

/* ---------- image lightbox ---------- */
function lightbox(file) {
  const prev = document.activeElement;
  const close = h('button', { class: 'icon-btn lb-close', type: 'button', 'aria-label': 'Close picture' }, ico('x', 22));
  const img = h('img', { src: file.url, alt: T(file.name) });
  const ov = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': T(file.name) }, close, img,
    h('div', { class: 'lb-bar' }, h('span', { text: T(file.name) }), h('a', { class: 'btn small ghost', href: file.url, download: T(file.name) }, ico('download', 14), 'Download')));
  let closing = false;
  const done = () => {
    if (closing) return; closing = true; document.removeEventListener('keydown', key, true);
    const fin = () => { ov.remove(); prev && prev.focus && prev.focus(); };
    if (reduce()) fin(); else { ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(fin, fin); setTimeout(fin, 400); }
  };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } };
  close.addEventListener('click', done);
  ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
  document.addEventListener('keydown', key, true);
  document.body.append(ov);
  if (!reduce()) { ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); img.animate([{ transform: 'scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: TWM.SPRING }); }
  close.focus();
}

/* ---------- emoji picker for reactions ---------- */
let openPicker = null;
function pickEmoji(anchor, onPick) {
  if (openPicker) openPicker();
  const pop = h('div', { class: 'react-pop', role: 'menu', 'aria-label': 'Add a reaction' },
    EMOJI.map(e => h('button', { class: 'emo', type: 'button', role: 'menuitem', 'aria-label': 'React with ' + e, onclick: () => { close(); onPick(e); } }, e)));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, ph = pop.offsetHeight;
  const above = r.top > ph + 12;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  pop.style.top = (above ? r.top - ph - 8 : r.bottom + 8) + 'px';
  if (!reduce()) pop.animate([{ opacity: 0, transform: `translateY(${above ? 8 : -8}px) scale(.9)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: TWM.SPRING });
  const outside = (e) => { if (!pop.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); } };
  function close() { pop.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); if (openPicker === close) openPicker = null; }
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true);
  openPicker = close;
  pop.querySelector('.emo').focus();
}

/* ======================================================================== */
/*  The chat pane                                                           */
/* ======================================================================== */
function make(cfg) {
  const k = cfg.conv.kind, cid = cfg.conv.id;
  const base = (k === 'g' ? '/api/groups/' : '/api/dms/') + encodeURIComponent(cid);
  const listUrl = k === 'g' ? base + '/messages' : base;
  const msgUrl = (id) => `${base}/messages/${id}`;

  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': cfg.label, tabindex: '0' });
  const typingEl = h('div', { class: 'typing', 'aria-live': 'polite' });
  const replyBar = h('div', { class: 'reply-bar', hidden: true });
  const chip = h('div', { class: 'upload-chip', hidden: true });
  const input = h('input', { class: 'input', type: 'text', maxlength: 1000, placeholder: cfg.placeholder, 'aria-label': 'Message', autocomplete: 'off' });
  const send = h('button', { class: 'btn', type: 'submit', 'aria-label': 'Send message' }, ico('send', 18));
  const fileInput = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-label': 'Choose a file to share' });
  const attach = h('button', { class: 'icon-btn attach', type: 'button', 'aria-label': 'Attach a file', title: 'Attach a file' }, ico('clip', 20));
  const form = h('form', { class: 'composer' }, attach, input, send);
  const wrap = h('div', { class: 'composer-wrap' }, typingEl, replyBar, chip, form, fileInput);

  const els = new Map(), data = new Map();
  let lastId = 0, since = '', initial = true, replying = null, pending = null, editingId = null, lastTyping = 0;

  /* ----- rendering ----- */
  const canDelete = (m) => m.userId === TW.me.id || TW.me.isAdmin || (typeof cfg.canModerate === 'function' && cfg.canModerate());

  function render(m) {
    const own = m.userId === TW.me.id;
    const when = new Date(m.createdAt);
    const el = h('div', { class: 'msg' + (own ? ' own' : '') + (m.deleted ? ' deleted' : ''), 'data-mid': m.id });
    const head = h('div', { class: 'head' }, h('b', { text: nm(m) }), m.rckt ? rcktBadge() : null,
      h('time', { text: isNaN(when) ? '' : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), datetime: isNaN(when) ? null : when.toISOString() }),
      m.editedAt ? h('span', { class: 'edited', text: '(edited)', title: 'Edited ' + new Date(m.editedAt).toLocaleString() }) : null);
    const body = h('div', { class: 'body' }, head);
    if (m.replyTo) {
      const r = m.replyTo;
      body.append(h('button', { class: 'quote', type: 'button', 'aria-label': 'Jump to the message from ' + T(r.name), onclick: () => jumpTo(r.id) },
        h('b', { text: T(r.name) }), h('span', { text: r.deleted ? 'Message deleted' : (T(r.text) || 'Attachment') })));
    }
    if (m.deleted) body.append(h('p', { class: 'gone', text: 'Message deleted' }));
    else {
      if (m.text) body.append(h('p', { class: 'txt', text: T(m.text) }));
      const f = m.file;
      if (f && FILE_URL.test(f.url)) {
        if (f.kind === 'image' || f.kind === 'gif') {
          body.append(h('button', { class: 'att-img', type: 'button', 'aria-label': 'Open picture ' + T(f.name), onclick: () => lightbox(f) },
            h('img', { src: f.url, alt: T(f.name), loading: 'lazy', decoding: 'async' })));
        } else {
          body.append(h('a', { class: 'att-file', href: f.url, download: T(f.name), rel: 'noopener', 'aria-label': `Download ${T(f.name)} (${fmtSize(f.size)})` },
            ico('file', 22), h('span', { class: 'fmeta' }, h('b', { text: T(f.name) }), h('span', { text: fmtSize(f.size) })), ico('download', 18)));
        }
      }
      if (m.reactions && m.reactions.length) {
        body.append(h('div', { class: 'reacts' }, m.reactions.map(r => h('button', {
          class: 'react' + (r.mine ? ' mine' : ''), type: 'button', 'aria-pressed': String(r.mine), title: r.users.map(T).join(', '),
          'aria-label': `${r.emoji} ${r.count}: ${r.users.map(T).join(', ')}. ${r.mine ? 'Remove your reaction' : 'React too'}`, onclick: () => react(m, r.emoji)
        }, h('span', { class: 'e', text: r.emoji }), h('span', { class: 'n', text: String(r.count) })))));
      }
    }
    el.append(avatar(m, 'md'), body);
    if (!m.deleted) {
      const acts = h('div', { class: 'actions', role: 'toolbar', 'aria-label': 'Message actions' });
      const reactBtn = iconBtn('smile', 'Add a reaction', () => pickEmoji(reactBtn, (e) => react(m, e)));
      acts.append(reactBtn, iconBtn('reply', 'Reply', () => setReply(m)));
      if (own) acts.append(iconBtn('edit', 'Edit message', () => startEdit(m)));
      if (canDelete(m)) acts.append(iconBtn('trash', 'Delete message', () => askDelete(m), 'danger'));
      el.append(acts);
    }
    el.addEventListener('click', (e) => {   // touch: tap a message to show its actions
      if (e.target.closest('button, a, input')) return;
      log.querySelectorAll('.msg.tap').forEach(x => { if (x !== el) x.classList.remove('tap'); });
      el.classList.toggle('tap');
    });
    return el;
  }

  /** Add new messages / refresh changed ones. Returns the new elements. */
  function upsert(list, force, fromRect) {
    const made = [];
    const near = force || log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    for (const m of list) {
      if (m.id > lastId) lastId = m.id;
      if (m.updatedAt && m.updatedAt > since) since = m.updatedAt;
      const old = els.get(m.id);
      if (old && editingId === m.id) { data.set(m.id, m); continue; }   // don't yank the text out from under someone who is editing it
      data.set(m.id, m);
      const el = render(m);
      if (old) { el.style.animation = 'none'; old.replaceWith(el); }
      else {
        const gone = log.querySelector('[data-empty]'); if (gone) gone.remove();
        if (initial) el.style.animationDelay = (300 + Math.min(made.length, 12) * 40) + 'ms';
        log.append(el); made.push(el);
      }
      els.set(m.id, el);
    }
    if (made.length && near) log.scrollTo({ top: log.scrollHeight, behavior: fromRect || initial ? 'instant' : 'smooth' });
    if (fromRect && made.length) TWM.flyFrom(made[made.length - 1], fromRect);
    return made;
  }

  function jumpTo(id) {
    const t = els.get(id);
    if (!t) { toast('That message is further up than what is loaded.'); return; }
    t.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1500);
  }

  /* ----- actions ----- */
  async function react(m, emoji) {
    try { upsert([await api('POST', msgUrl(m.id) + '/react', { emoji })]); } catch (e) { toast(e.message, 'error'); }
  }
  function askDelete(m) {
    confirmSheet('Delete this message?', m.userId === TW.me.id ? 'It will be removed for everyone in this chat.' : 'You are removing someone else’s message as a moderator.', 'Delete',
      async () => { upsert([await api('DELETE', msgUrl(m.id))]); });
  }
  function startEdit(m) {
    const el = els.get(m.id); if (!el) return;
    const p = el.querySelector('.txt');
    const field = h('input', { class: 'input edit-input', type: 'text', maxlength: 1000, value: T(m.text), 'aria-label': 'Edit message' });
    const hint = h('span', { class: 'edit-hint muted small', text: 'Enter to save · Esc to cancel' });
    const holder = h('div', { class: 'edit-box' }, field, hint);
    if (p) p.replaceWith(holder); else el.querySelector('.body').append(holder);
    editingId = m.id; field.focus(); field.setSelectionRange(field.value.length, field.value.length);
    const stop = () => { editingId = null; const cur = data.get(m.id); const fresh = render(cur); fresh.style.animation = 'none'; els.get(m.id).replaceWith(fresh); els.set(m.id, fresh); };
    field.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const text = field.value.trim();
        if (!text) { toast('A message can’t be empty. Delete it instead.', 'error'); return; }
        if (text === T(m.text)) { stop(); return; }
        field.disabled = true;
        try { const r = await api('PATCH', msgUrl(m.id), { text }); editingId = null; upsert([r]); }
        catch (ex) { field.disabled = false; field.focus(); toast(ex.message, 'error'); }
      }
    });
  }

  function setReply(m) {
    replying = { id: m.id, name: nm(m), text: T(m.text) || 'Attachment' };
    replyBar.replaceChildren(ico('reply', 16), h('span', { class: 't' }, 'Replying to ', h('b', { text: replying.name }), ': ', replying.text.length > 80 ? replying.text.slice(0, 80) + '…' : replying.text),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel reply', onclick: clearReply }, ico('x', 16)));
    replyBar.hidden = false; input.focus();
  }
  function clearReply() { replying = null; replyBar.hidden = true; }

  /* ----- attachments ----- */
  function paintChip() {
    if (!pending) { chip.hidden = true; return; }
    chip.hidden = false;
    const pct = Math.round(pending.pct * 100);
    chip.replaceChildren(ico('file', 18), h('span', { class: 'cname' }, h('b', { text: pending.name }), h('span', { class: 'muted small', text: pending.done ? `${fmtSize(pending.size)} · ready to send` : `${fmtSize(pending.size)} · uploading ${pct}%` })),
      h('span', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Upload progress' }, h('i', { style: `width:${pct}%` })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove attachment', onclick: () => clearPending(true) }, ico('x', 16)));
  }
  function clearPending(abort) {
    if (pending && abort && !pending.done && pending.xhr) { try { pending.xhr.abort(); } catch { /* ignore */ } }
    pending = null; paintChip();
  }
  async function startUpload(file) {
    if (pending && !pending.done) { toast('Wait for the current upload to finish.', 'error'); return; }
    // RCKT may have been granted since login: check fresh before refusing a GIF or a big file.
    if (!TW.me.rckt && file && (file.type === 'image/gif' || file.size > 20 * MB)) await refreshMe();
    const rckt = !!TW.me.rckt, limit = (rckt ? 250 : 20) * MB;
    if (!file || file.size === 0) { toast('That file is empty.', 'error'); return; }
    if (file.size > limit) { toast(rckt ? 'Files can be up to 250 MB.' : 'Files can be up to 20 MB. RCKT raises it to 250 MB.', 'error'); return; }
    if (file.type === 'image/gif' && !rckt) { toast('GIFs need RCKT. Ask an admin for RCKT.', 'error'); return; }
    const p = pending = { name: file.name || 'pasted-image.png', size: file.size, pct: 0, done: false, id: null, xhr: new XMLHttpRequest() };
    paintChip();
    const x = p.xhr;
    x.open('POST', `/api/uploads?kind=${k}&id=${encodeURIComponent(cid)}`);
    x.setRequestHeader('X-TW', '1'); x.setRequestHeader('X-Filename', encodeURIComponent(p.name)); x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable && pending === p) { p.pct = e.loaded / e.total; paintChip(); } };
    x.onload = () => {
      if (pending !== p) return;
      let r = null; try { r = JSON.parse(x.responseText); } catch { /* not json */ }
      if (x.status >= 200 && x.status < 300 && r && r.id) { p.id = r.id; p.done = true; p.pct = 1; paintChip(); input.focus(); }
      else { toast((r && r.error) || 'Upload failed.', 'error'); clearPending(false); }
    };
    x.onerror = () => { if (pending === p) { toast('Upload failed. Check your connection.', 'error'); clearPending(false); } };
    x.send(file);
  }
  attach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ''; if (f) startUpload(f); });
  input.addEventListener('paste', (e) => { const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); startUpload(f); } });
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  for (const zone of [log, wrap]) {
    zone.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); log.classList.add('dragging'); } });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) log.classList.remove('dragging'); });
    zone.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); log.classList.remove('dragging'); startUpload(e.dataTransfer.files[0]); });
  }

  /* ----- sending + typing ----- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (pending && !pending.done) { toast('Wait for the upload to finish.', 'error'); return; }
    if (!text && !(pending && pending.done)) return;
    send.disabled = true;
    const rect = input.getBoundingClientRect();
    try {
      const m = await api('POST', listUrl, { text, replyTo: replying ? replying.id : undefined, fileId: pending && pending.done ? pending.id : undefined });
      input.value = ''; clearReply(); pending = null; paintChip(); lastTyping = 0;
      send.classList.add('sent'); setTimeout(() => send.classList.remove('sent'), 600);
      upsert([m], true, rect);
    } catch (ex) { toast(ex.message, 'error'); } finally { send.disabled = false; input.focus(); }
  });
  input.addEventListener('input', () => {
    const now = Date.now();
    if (input.value && now - lastTyping > 3000) { lastTyping = now; api('POST', base + '/typing').catch(() => {}); }
  });

  function paintTyping(names) {
    const n = (names || []).map(T);
    typingEl.textContent = !n.length ? '' : n.length === 1 ? `${n[0]} is typing…` : n.length === 2 ? `${n[0]} and ${n[1]} are typing…` : 'Several people are typing…';
  }

  /* ----- polling: new + changed messages and typing in one request ----- */
  async function poll() {
    try {
      const r = await api('GET', `${base}/sync` + TW.qs({ after: lastId || 0, since }));
      if (TW.stale(cfg.tok)) return;
      if (r.changed && r.changed.length) upsert(r.changed);
      if (r.messages && r.messages.length) upsert(r.messages);
      if (r.serverTime && r.serverTime > since) since = r.serverTime;
      paintTyping(r.typing);
    } catch { /* retry on the next tick */ }
  }

  return {
    log, composer: wrap, form, input, poll,
    fill(first, emptyTitle, emptyText) {
      if (!first.length) log.append(h('div', { class: 'empty', 'data-empty': '' }, h('b', { text: emptyTitle }), h('p', { text: emptyText })));
      upsert(first, true);
    },
    done() { setTimeout(() => { initial = false; }, 0); }
  };
}

/* ======================================================================== */
/*  RCKT: Settings card, admin button, profile badge                        */
/* ======================================================================== */
const untilText = (u) => u === 'forever' ? 'Active, no expiry' : 'Active until ' + new Date(u).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/* The Settings page announces each tab as it is built (`tw:settings-tab`); the RCKT card lives in "Account & security". */
document.addEventListener('tw:settings-tab', (e) => { if (e.detail.tab === 'account') settingsCard(e.detail.root); });
function settingsCard(root) {
  if (root.querySelector('.rckt-card')) return;
  const status = h('p', { class: 'muted' });
  const paint = (me) => {
    status.textContent = me.rckt ? untilText(me.rcktUntil || 'forever') : 'Not active. Ask an admin to give you RCKT.';
    card.classList.toggle('on', !!me.rckt);
  };
  const card = h('div', { class: 'card rckt-card' }, h('div', { class: 'rckt-top' }, rcktBadge(), h('h3', { text: 'RCKT' })), status,
    h('ul', { class: 'perks' }, h('li', { text: 'Send GIFs in chats' }), h('li', { text: 'Upload files up to 250 MB (20 MB without RCKT)' })));
  paint(TW.me);
  root.prepend(card);
  refreshMe().then(paint);
}

function rcktSheet(uid) {
  const line = h('p', { class: 'muted', text: 'Loading…' });
  let close = () => {};
  const grant = async (body, what) => {
    try { const r = await api('POST', `/api/admin/users/${uid}/rckt`, body); toast(what + ' for ' + r.username); close(); } catch (e) { toast(e.message, 'error'); }
  };
  const body = h('div', { class: 'stack' }, line, h('div', { class: 'rckt-opts' },
    btn('30 days', { onclick: (e) => busyRun(e, () => grant({ days: 30 }, 'RCKT granted (30 days)')) }),
    btn('1 year', { onclick: (e) => busyRun(e, () => grant({ days: 365 }, 'RCKT granted (1 year)')) }),
    btn('Forever', { onclick: (e) => busyRun(e, () => grant({ forever: true }, 'RCKT granted forever')) }),
    btn('Revoke', { cls: 'danger', onclick: (e) => busyRun(e, () => grant({ revoke: true }, 'RCKT revoked')) })),
    h('p', { class: 'muted small', text: 'Granting extends an active plan. RCKT lets a user send GIFs and upload files up to 250 MB.' }));
  close = openSheet('RCKT subscription', body);
  api('GET', `/api/admin/users/${uid}/rckt`).then(r => { line.textContent = `${r.username}: ` + (r.active ? untilText(r.until) : 'no active RCKT'); }).catch(e => { line.textContent = e.message; });
}
const busyRun = (e, fn) => TW.busy(e.currentTarget, fn);

function adminButtons() {
  for (const row of document.querySelectorAll('#view .arow[data-key^="u"]')) {
    if (row.dataset.rckt) continue;
    const act = row.querySelector('.act'); if (!act) continue;
    row.dataset.rckt = '1';
    const uid = row.dataset.key.slice(1);
    act.prepend(h('button', { class: 'btn small ghost rckt-btn', type: 'button', onclick: () => rcktSheet(uid) }, 'RCKT'));
  }
}

const lookups = new Map();
function profileBadge() {
  const names = document.querySelector('.sheet .profile .profile-names');
  if (!names || names.dataset.rckt) return;
  names.dataset.rckt = '1';
  const handle = [...names.querySelectorAll('p')].map(p => p.textContent).find(t => t.startsWith('@'));
  if (!handle) return;
  const name = handle.slice(1);
  const add = () => { const h2 = names.querySelector('h2'); if (h2 && !names.querySelector('.rckt-badge')) h2.after(rcktBadge()); };
  if (lookups.has(name)) { if (lookups.get(name)) add(); return; }
  api('GET', '/api/rckt/lookup?username=' + encodeURIComponent(name)).then(r => { lookups.set(name, !!r.rckt); if (r.rckt) add(); }).catch(() => {});
}

let queued = false;
new MutationObserver(() => {
  if (queued) return; queued = true;
  setTimeout(() => { queued = false; adminButtons(); profileBadge(); }, 30);   // a timer, not rAF: rAF stops in hidden windows
}).observe(document.body, { childList: true, subtree: true });

window.TWChat = { make };
})();
