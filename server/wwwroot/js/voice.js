/* Group voice chat. Peer-to-peer WebRTC audio (everyone connects to everyone, up to 6 people); the server only introduces people and relays the setup messages
   over the live connection (js/rt.js). Needs a secure page for the microphone (https, localhost, or the desktop app). */
(() => {
'use strict';
const TW = window.TW;
if (!TW || !window.TWRT) return;
const { h, icon, api, toast, T, nm, avatar } = TW;
const t = TW.t;

TWPrefs.addStrings('sv', {
  'Voice': 'Röst', 'Join voice': 'Gå med i röstchatt', 'Leave voice': 'Lämna röstchatt', 'In voice: {n}': 'I röstchatt: {n}', 'Voice chat': 'Röstchatt', 'Mute': 'Stäng av mikrofon', 'Unmute': 'Slå på mikrofon',
  'Leave': 'Lämna', 'Connecting…': 'Ansluter…', 'Voice chat needs a secure connection (https) or the desktop app.': 'Röstchatt kräver en säker anslutning (https) eller skrivbordsappen.',
  'Couldn’t use the microphone. Check that it is allowed.': 'Kunde inte använda mikrofonen. Kontrollera att den är tillåten.', 'You': 'Du', 'Muted': 'Avstängd',
  'Live connection is down. Voice chat needs it.': 'Den levande anslutningen är nere. Röstchatt behöver den.', '{name} joined the voice chat': '{name} gick med i röstchatten', '{name} left the voice chat': '{name} lämnade röstchatten',
  'Deafen': 'Stäng av ljud', 'Undeafen': 'Slå på ljud', 'Audio settings': 'Ljudinställningar', 'Microphone (Input)': 'Mikrofon (Ingång)',
  'Headphones / Speakers (Output)': 'Hörlurar / Högtalare (Utgång)', 'Input level test:': 'Testa mikrofonnivå:', 'Default microphone': 'Standardmikrofon',
  'Default speaker / headphones': 'Standardhörlurar / högtalare', 'Select where you want to hear incoming voice audio.': 'Välj var du vill höra inkommande röster.',
  'Done': 'Klar', 'Audio & Voice Settings': 'Ljud- & röstinställningar',
  'Camera': 'Kamera', 'Turn on camera': 'Slå på kamera', 'Turn off camera': 'Stäng av kamera',
  'Could not access camera.': 'Kunde inte komma åt kameran.'
});

let ice = null, room = null;                      // room: { gid, name, stream, peers: Map(uid -> peer), muted, deaf, bar }
const present = new Map();                         // gid -> [uid]   who is in each group's voice chat (from the server)
const btns = new Set();                            // "Voice" buttons on screen

async function iceServers() {
  if (ice) return ice;
  try { ice = (await api('GET', '/api/voice/ice')).iceServers; } catch { ice = [{ urls: ['stun:stun.l.google.com:19302'] }]; }
  return ice;
}

/* ---------- Audio device preferences & settings ---------- */
function getSavedMicId() { return localStorage.getItem('tw_audio_mic') || ''; }
function getSavedSpeakerId() { return localStorage.getItem('tw_audio_speaker') || ''; }

function applySpeakerToPeers(speakerId) {
  if (!room) return;
  for (const p of room.peers.values()) {
    if (p.audio && typeof p.audio.setSinkId === 'function') {
      p.audio.setSinkId(speakerId || '').catch(() => {});
    }
  }
}

async function restartLocalStream() {
  if (!room) return;
  const micId = getSavedMicId();
  const aConfig = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (micId) aConfig.deviceId = { exact: micId };
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ audio: aConfig, video: false });
    if (room.stopMeter) room.stopMeter();
    room.stream.getTracks().forEach(t => t.stop());
    room.stream = newStream;
    const newTrack = newStream.getAudioTracks()[0];
    newTrack.enabled = !room.muted;
    for (const p of room.peers.values()) {
      const senders = p.pc.getSenders();
      const aSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (aSender) aSender.replaceTrack(newTrack).catch(() => {});
    }
    room.stopMeter = meter(newStream, (on) => { if (room) { room.speaking = on && !room.muted; drawBar(); } });
  } catch (e) { console.warn('Could not switch mic in-call', e); }
}

async function openAudioSettings() {
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {}
  const mics = devices.filter(d => d.kind === 'audioinput');
  const speakers = devices.filter(d => d.kind === 'audiooutput');

  let curMic = getSavedMicId();
  let curSpk = getSavedSpeakerId();

  const micSelect = h('select', { class: 'input' },
    h('option', { value: '' }, t('Default microphone')),
    ...mics.map(m => h('option', { value: m.deviceId, selected: m.deviceId === curMic }, m.label || t('Microphone ({id})', { id: m.deviceId.slice(0, 5) })))
  );

  const spkSelect = h('select', { class: 'input' },
    h('option', { value: '' }, t('Default speaker / headphones')),
    ...speakers.map(s => h('option', { value: s.deviceId, selected: s.deviceId === curSpk }, s.label || t('Headphones ({id})', { id: s.deviceId.slice(0, 5) })))
  );

  const meterFill = h('div', { style: 'height:100%;width:0%;background:var(--color-primary,#4f5ee6);border-radius:4px;transition:width 0.08s ease;' });
  const meterBar = h('div', { style: 'height:8px;background:var(--color-line-2,#26262c);border-radius:4px;overflow:hidden;margin-top:6px;' }, meterFill);

  let testStream = null, testMeterStop = null;
  async function startTest(deviceId) {
    if (testMeterStop) { testMeterStop(); testMeterStop = null; }
    if (testStream) { testStream.getTracks().forEach(t => t.stop()); testStream = null; }
    try {
      const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false };
      testStream = await navigator.mediaDevices.getUserMedia(constraints);
      testMeterStop = meter(testStream, (active, pct) => {
        meterFill.style.width = Math.min(100, Math.max(0, pct || (active ? 60 : 0))) + '%';
      });
    } catch {
      meterFill.style.width = '0%';
    }
  }

  micSelect.addEventListener('change', () => {
    localStorage.setItem('tw_audio_mic', micSelect.value);
    startTest(micSelect.value);
    restartLocalStream();
  });

  spkSelect.addEventListener('change', () => {
    localStorage.setItem('tw_audio_speaker', spkSelect.value);
    applySpeakerToPeers(spkSelect.value);
  });

  startTest(curMic);

  let close = () => {};
  const content = h('div', { class: 'stack', style: 'gap:16px;' },
    h('div', { class: 'field' },
      h('label', { class: 'label', text: t('Microphone (Input)') }),
      micSelect,
      h('div', { style: 'margin-top:4px;' },
        h('span', { class: 'muted small', text: t('Input level test:') }),
        meterBar
      )
    ),
    h('div', { class: 'field' },
      h('label', { class: 'label', text: t('Headphones / Speakers (Output)') }),
      spkSelect,
      h('span', { class: 'muted small', text: t('Select where you want to hear incoming voice audio.') })
    ),
    h('div', { style: 'display:flex;justify-content:flex-end;margin-top:12px;' },
      h('button', { class: 'btn', type: 'button', onclick: () => close() }, t('Done'))
    )
  );

  close = TW.openSheet(t('Audio & Voice Settings'), content);
  const origClose = close;
  close = () => {
    if (testMeterStop) testMeterStop();
    if (testStream) testStream.getTracks().forEach(t => t.stop());
    origClose();
  };
}

/* User interaction unlock for browser audio autoplay policy */
function unlockAutoplay() {
  if (actx && actx.state === 'suspended') {
    actx.resume().catch(() => {});
  }
  if (room) {
    for (const p of room.peers.values()) {
      if (p.audio && p.audio.paused) {
        p.audio.play().catch(() => {});
      }
    }
  }
}
window.addEventListener('click', unlockAutoplay, { passive: true });
window.addEventListener('touchstart', unlockAutoplay, { passive: true });
window.addEventListener('keydown', unlockAutoplay, { passive: true });

const present = new Map();         // gid -> [user ids]
const presentUsers = new Map();    // gid -> [user objects]
const btns = new Set();            // buttons on screen (to paint them when presence changes)

/* ---------- UI ---------- */
function paintOne(wrap) {
  const gid = Number(wrap.dataset.gid);
  const b = wrap.querySelector ? (wrap.querySelector('.vc-btn') || wrap) : wrap;
  const stack = wrap.querySelector ? wrap.querySelector('.vc-avatar-stack') : null;
  const who = present.get(gid) || [];
  const users = presentUsers.get(gid) || [];
  const n = who.length;
  const inRoom = room && room.gid === gid;
  b.classList.toggle('vc-live', n > 0);
  b.replaceChildren(icon('mic', 16), inRoom ? t('Leave voice') : (n ? t('In voice: {n}', { n }) : t('Join voice')));
  b.setAttribute('aria-pressed', String(!!inRoom));

  if (stack) {
    if (n === 0) {
      stack.replaceChildren();
      stack.style.display = 'none';
    } else {
      stack.style.display = 'inline-flex';
      const items = [];
      const showUsers = users.length ? users.slice(0, 4) : who.slice(0, 4).map(id => ({ id }));
      for (const u of showUsers) {
        const av = avatar(u, 'xs');
        av.title = nm(u);
        items.push(av);
      }
      if (n > 4) {
        items.push(h('span', { class: 'vc-stack-more', text: '+' + (n - 4) }));
      }
      stack.replaceChildren(...items);
    }
  }
}
function paintButtons() {
  for (const b of [...btns]) {
    if (b.isConnected) b.dataset.mounted = '1'; else if (b.dataset.mounted) { btns.delete(b); continue; }   // forget buttons whose page is gone
    paintOne(b);
  }
}
function button(g) {
  const wrap = h('div', { class: 'vc-btn-wrap', 'data-gid': g.id });
  const b = h('button', { class: 'btn small vc-btn', type: 'button', 'data-gid': g.id });
  b.addEventListener('click', () => { if (room && room.gid === g.id) leave(); else join(g.id, T(g.name)); });
  const stack = h('div', { class: 'vc-avatar-stack' });
  wrap.append(b, stack);
  btns.add(wrap);
  paintOne(wrap);
  api('GET', `/api/groups/${g.id}/voice`).then(r => {
    present.set(g.id, (r.people || []).map(p => p.id));
    presentUsers.set(g.id, r.people || []);
    paintButtons();
  }).catch(() => {});
  return wrap;
}

function openCinema(sourceVideo, title) {
  const modal = h('div', { class: 'vc-cinema-modal' });
  const vid = h('video', { autoplay: true, playsinline: true, controls: true });
  vid.srcObject = sourceVideo.srcObject;
  vid.play().catch(() => {});
  const closeBtn = h('button', { class: 'icon-btn vc-cinema-close', type: 'button', 'aria-label': t('Close cinema'), onclick: () => modal.remove() }, icon('x', 20));
  const bar = h('div', { class: 'vc-cinema-bar' }, h('b', { text: title }), closeBtn);
  modal.append(bar, vid);
  document.body.append(modal);
}

function updateVideoPanel() {
  if (!room) return;
  const hasLocalVideo = (room.cam || room.screen) && room.videoTrack && room.videoTrack.readyState === 'live';
  const remoteVideos = [...room.peers.values()].filter(p => p.videoTrack && p.videoTrack.readyState === 'live');
  const total = (hasLocalVideo ? 1 : 0) + remoteVideos.length;

  if (total === 0) {
    if (room.videoGrid) { room.videoGrid.remove(); room.videoGrid = null; room.videoTiles = null; }
    return;
  }

  if (!room.videoGrid) {
    room.videoGrid = h('div', { class: 'vc-video-grid' });
    room.videoTiles = new Map();
    document.body.append(room.videoGrid);
  }

  const activeKeys = new Set();
  const currentTiles = room.videoTiles || (room.videoTiles = new Map());

  if (hasLocalVideo) {
    activeKeys.add('local');
    let entry = currentTiles.get('local');
    if (!entry) {
      const v = h('video', { autoplay: true, playsinline: true, muted: true });
      v.srcObject = new MediaStream([room.videoTrack]);
      const isScreen = !!room.screen;
      const cinemaBtn = h('button', { class: 'vc-cinema-btn', type: 'button', title: t('Cinema mode'), onclick: (e) => { e.stopPropagation(); openCinema(v, t('Your stream')); } }, icon('expand', 14));
      const badge = isScreen ? h('span', { class: 'vc-video-badge screen', text: t('Screen') }) : null;
      const tile = h('div', { class: 'vc-video-tile' }, v, badge, cinemaBtn,
        h('span', { class: 'vc-video-label' }, avatar(TW.me, 'sm'), h('b', { text: t('You') }))
      );
      v.play().catch(() => {});
      entry = { tile, video: v, stream: v.srcObject };
      currentTiles.set('local', entry);
      room.videoGrid.append(tile);
    } else {
      if (entry.video.srcObject !== room.stream) {
        entry.video.srcObject = new MediaStream([room.videoTrack]);
        entry.video.play().catch(() => {});
      }
    }
  }

  for (const p of remoteVideos) {
    const key = String(p.uid);
    activeKeys.add(key);
    let entry = currentTiles.get(key);
    const stream = p.videoStream || new MediaStream([p.videoTrack]);
    if (!entry) {
      const v = h('video', { autoplay: true, playsinline: true });
      v.srcObject = stream;
      const u = p.person || { id: p.uid, username: p.name, displayName: p.name };
      const isScreen = !!p.isScreen;
      const cinemaBtn = h('button', { class: 'vc-cinema-btn', type: 'button', title: t('Cinema mode'), onclick: (e) => { e.stopPropagation(); openCinema(v, nm(u)); } }, icon('expand', 14));
      const badge = isScreen ? h('span', { class: 'vc-video-badge screen', text: t('Screen') }) : null;
      const tile = h('div', { class: 'vc-video-tile' }, v, badge, cinemaBtn,
        h('span', { class: 'vc-video-label' }, avatar(u, 'sm'), h('b', { text: nm(u) }))
      );
      v.play().catch(() => {});
      entry = { tile, video: v };
      currentTiles.set(key, entry);
      room.videoGrid.append(tile);
    } else {
      if (entry.video.srcObject !== stream) {
        entry.video.srcObject = stream;
        entry.video.play().catch(() => {});
      }
    }
  }

  for (const [key, entry] of currentTiles.entries()) {
    if (!activeKeys.has(key)) {
      entry.tile.remove();
      currentTiles.delete(key);
    }
  }
}

async function toggleScreenShare() {
  if (!room) return;
  if (!room.screen) {
    try {
      const sStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: true
      });
      const track = sStream.getVideoTracks()[0];
      if (!track) return;
      if (room.cam) await toggleCamera();
      room.screen = true;
      room.videoTrack = track;
      track.onended = () => { if (room && room.screen) toggleScreenShare(); };
      try { room.stream.addTrack(track); } catch {}

      for (const p of room.peers.values()) {
        try {
          const senders = p.pc.getSenders();
          let vs = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.kind === 'video');
          if (vs) {
            await vs.replaceTrack(track);
          } else {
            p.pc.addTrack(track, room.stream);
          }
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          TWRT.send({ t: 'vc.signal', gid: room.gid, to: p.uid, data: { sdp: p.pc.localDescription } });
        } catch (e) { console.warn('screen share offer failed', e); }
      }
      TWRT.send({ t: 'vc.state', gid: room.gid, screen: true });
      drawBar();
      updateVideoPanel();
    } catch {
      toast(t('Could not share screen.'), 'error');
    }
  } else {
    room.screen = false;
    if (room.videoTrack) {
      room.videoTrack.stop();
      try { room.stream.removeTrack(room.videoTrack); } catch {}
      for (const p of room.peers.values()) {
        try {
          const senders = p.pc.getSenders();
          const vs = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.kind === 'video');
          if (vs) await vs.replaceTrack(null);
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          TWRT.send({ t: 'vc.signal', gid: room.gid, to: p.uid, data: { sdp: p.pc.localDescription } });
        } catch {}
      }
      room.videoTrack = null;
    }
    TWRT.send({ t: 'vc.state', gid: room.gid, screen: false });
    drawBar();
    updateVideoPanel();
  }
}

async function toggleCamera() {
  if (!room) return;
  if (!room.cam) {
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
      });
      const track = vStream.getVideoTracks()[0];
      if (!track) return;
      room.cam = true;
      room.videoTrack = track;
      track.onended = () => { if (room && room.cam) toggleCamera(); };
      try { room.stream.addTrack(track); } catch {}

      for (const p of room.peers.values()) {
        try {
          const senders = p.pc.getSenders();
          let vs = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.kind === 'video');
          if (vs) {
            await vs.replaceTrack(track);
          } else {
            p.pc.addTrack(track, room.stream);
          }
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          TWRT.send({ t: 'vc.signal', gid: room.gid, to: p.uid, data: { sdp: p.pc.localDescription } });
        } catch (e) { console.warn('camera offer failed', e); }
      }
      drawBar();
      updateVideoPanel();
    } catch {
      toast(t('Could not access camera.'), 'error');
    }
  } else {
    room.cam = false;
    if (room.videoTrack) {
      room.videoTrack.stop();
      try { room.stream.removeTrack(room.videoTrack); } catch {}
      for (const p of room.peers.values()) {
        try {
          const senders = p.pc.getSenders();
          const vs = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.kind === 'video');
          if (vs) await vs.replaceTrack(null);
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          TWRT.send({ t: 'vc.signal', gid: room.gid, to: p.uid, data: { sdp: p.pc.localDescription } });
        } catch {}
      }
      room.videoTrack = null;
    }
    drawBar();
    updateVideoPanel();
  }
}

function drawBar() {
  if (!room) return;
  const peers = [...room.peers.values()];
  const me = TW.me;
  const people = [{ uid: me.id, u: me, muted: room.muted, self: true }, ...peers.map(p => ({ uid: p.uid, u: p.person || { id: p.uid, username: p.name, displayName: p.name }, muted: p.muted, speaking: p.speaking, state: p.state }))];
  const face = (x) => {
    const el = h('div', { class: 'vc-face' + (x.muted ? ' muted' : '') + (x.self ? (room.speaking ? ' speaking' : '') : (x.speaking ? ' speaking' : '')), title: nm(x.u) + (x.muted ? ' · ' + t('Muted') : '') }, avatar(x.u, 'sm'));
    if (x.muted) el.append(h('span', { class: 'vc-mute' }, icon('mic', 10)));
    if (!x.self && x.state && x.state !== 'connected') el.classList.add('connecting');
    return el;
  };

  if (!room.bar) {
    room.bar = h('div', { class: 'vc-bar', role: 'region', 'aria-label': t('Voice chat') });
    room.nameLink = h('a', { class: 'vc-name', href: '#/group/' + TW.enc(room.gid) },
      h('b', { text: room.name }),
      h('span', { class: 'muted small', text: room.joined ? t('Voice chat') : t('Connecting…') })
    );
    room.facesContainer = h('div', { class: 'vc-faces' });

    room.muteBtn = h('button', {
      class: 'icon-btn vc-ctl' + (room.muted ? ' off' : ''),
      type: 'button',
      'aria-label': room.muted ? t('Unmute') : t('Mute'),
      title: room.muted ? t('Unmute') : t('Mute'),
      onclick: () => setMuted(!room.muted)
    }, icon('mic', 18));

    room.deafBtn = h('button', {
      class: 'icon-btn vc-ctl' + (room.deaf ? ' off' : ''),
      type: 'button',
      'aria-label': room.deaf ? t('Undeafen') : t('Deafen'),
      title: room.deaf ? t('Undeafen') : t('Deafen'),
      onclick: () => setDeaf(!room.deaf)
    }, icon('speaker', 18));

    room.camBtn = h('button', {
      class: 'icon-btn vc-ctl' + (!room.cam ? ' off' : ''),
      type: 'button',
      'aria-label': room.cam ? t('Turn off camera') : t('Turn on camera'),
      title: room.cam ? t('Turn off camera') : t('Turn on camera'),
      onclick: toggleCamera
    }, icon('camera', 18));

    room.screenBtn = h('button', {
      class: 'icon-btn vc-ctl' + (!room.screen ? ' off' : ''),
      type: 'button',
      'aria-label': room.screen ? t('Stop sharing screen') : t('Share screen'),
      title: room.screen ? t('Stop sharing screen') : t('Share screen'),
      onclick: toggleScreenShare
    }, icon('monitor', 18));

    room.settingsBtn = h('button', {
      class: 'icon-btn vc-ctl',
      type: 'button',
      'aria-label': t('Audio settings'),
      title: t('Audio settings'),
      onclick: openAudioSettings
    }, icon('gear', 18));

    room.leaveBtn = h('button', {
      class: 'btn small danger',
      type: 'button',
      onclick: leave
    }, t('Leave'));

    const actions = h('div', { class: 'vc-actions' }, room.muteBtn, room.deafBtn, room.camBtn, room.screenBtn, room.settingsBtn, room.leaveBtn);
    room.bar.append(room.nameLink, room.facesContainer, actions);
    document.body.append(room.bar);
  }

  const subText = room.nameLink.querySelector('span');
  if (subText) subText.textContent = room.joined ? t('Voice chat') : t('Connecting…');

  room.muteBtn.classList.toggle('off', !!room.muted);
  room.muteBtn.setAttribute('aria-label', room.muted ? t('Unmute') : t('Mute'));
  room.muteBtn.title = room.muted ? t('Unmute') : t('Mute');

  room.deafBtn.classList.toggle('off', !!room.deaf);
  room.deafBtn.setAttribute('aria-label', room.deaf ? t('Undeafen') : t('Deafen'));
  room.deafBtn.title = room.deaf ? t('Undeafen') : t('Deafen');

  room.camBtn.classList.toggle('off', !room.cam);
  room.camBtn.setAttribute('aria-label', room.cam ? t('Turn off camera') : t('Turn on camera'));
  room.camBtn.title = room.cam ? t('Turn off camera') : t('Turn on camera');

  room.screenBtn.classList.toggle('off', !room.screen);
  room.screenBtn.setAttribute('aria-label', room.screen ? t('Stop sharing screen') : t('Share screen'));
  room.screenBtn.title = room.screen ? t('Stop sharing screen') : t('Share screen');

  room.facesContainer.replaceChildren(...people.map(face));
}

/* ---------- audio level (shows who is talking) ---------- */
let actx = null;
function meter(stream, onLevel) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount); let on = false, alive = true;
    const loop = () => {
      if (!alive) return;
      an.getByteTimeDomainData(buf); let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      const now = peak > 11;
      const pct = Math.min(100, Math.round((peak / 128) * 100 * 2.5));
      if (now !== on) { on = now; onLevel(now, pct); }
      setTimeout(loop, 120);
    };
    loop();
    return () => { alive = false; try { src.disconnect(); } catch { /* ignore */ } };
  } catch { return () => {}; }
}

/* ---------- peers ---------- */
async function makePeer(uid, name, initiator) {
  if (!room || room.peers.has(uid)) return room && room.peers.get(uid);
  const pc = new RTCPeerConnection({ iceServers: await iceServers() });
  try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}
  const peer = { uid, name, pc, audio: null, videoTrack: null, videoStream: null, muted: false, speaking: false, state: 'new', stopMeter: null, pending: [] };
  room.peers.set(uid, peer);
  api('GET', '/api/users/' + uid).then(p => { peer.person = p; peer.name = nm(p); drawBar(); }).catch(() => {});

  room.stream.getTracks().forEach(tr => pc.addTrack(tr, room.stream));
  if (room.cam && room.videoTrack) {
    try { pc.addTrack(room.videoTrack, room.stream); } catch {}
  }

  pc.onicecandidate = (e) => { if (e.candidate) TWRT.send({ t: 'vc.signal', gid: room.gid, to: uid, data: { ice: e.candidate } }); };
  pc.onconnectionstatechange = () => {
    peer.state = pc.connectionState;
    drawBar();
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      try { pc.restartIce(); } catch { /* ignore */ }
    }
  };
  pc.ontrack = (e) => {
    if (e.track.kind === 'video') {
      peer.videoTrack = e.track;
      peer.videoStream = e.streams[0] || new MediaStream([e.track]);
      e.track.onended = () => { peer.videoTrack = null; updateVideoPanel(); };
      updateVideoPanel();
      return;
    }
    if (!peer.audio) {
      peer.audio = h('audio', { autoplay: true, playsinline: true });
      peer.audio.style.display = 'none';
      document.body.append(peer.audio);
    }
    peer.audio.srcObject = e.streams[0];
    peer.audio.muted = !!room.deaf;
    const spk = getSavedSpeakerId();
    if (spk && typeof peer.audio.setSinkId === 'function') {
      peer.audio.setSinkId(spk).catch(() => {});
    }
    peer.audio.play().catch(() => {});
    if (!peer.stopMeter) peer.stopMeter = meter(e.streams[0], (on) => { peer.speaking = on; drawBar(); });
  };
  if (initiator) {
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    TWRT.send({ t: 'vc.signal', gid: room.gid, to: uid, data: { sdp: pc.localDescription } });
  }
  drawBar();
  return peer;
}
function dropPeer(uid) {
  const p = room && room.peers.get(uid); if (!p) return;
  try { p.pc.close(); } catch { /* ignore */ }
  if (p.stopMeter) p.stopMeter();
  if (p.audio) p.audio.remove();
  room.peers.delete(uid);
  drawBar();
  updateVideoPanel();
}

async function onSignal(m) {
  if (!room || m.gid !== room.gid) return;
  const uid = m.from, d = m.data || {};
  let peer = room.peers.get(uid) || await makePeer(uid, 'Someone', false);   // the other side called us first
  if (!peer) return;
  const pc = peer.pc;
  try {
    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp);
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (d.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        TWRT.send({ t: 'vc.signal', gid: room.gid, to: uid, data: { sdp: pc.localDescription } });
      }
      updateVideoPanel();
    } else if (d.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(d.ice).catch(() => {}); else peer.pending.push(d.ice);
    }
  } catch (e) { console.warn('voice signal', e); }
}

/* ---------- join / leave ---------- */
async function join(gid, name) {
  if (room) { if (room.gid === gid) return; await leave(); }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) { toast(t('Voice chat needs a secure connection (https) or the desktop app.'), 'error'); return; }
  if (!TWRT.connected()) { toast(t('Live connection is down. Voice chat needs it.'), 'error'); return; }

  const micId = getSavedMicId();
  const aConfig = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (micId) aConfig.deviceId = { exact: micId };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: aConfig, video: false });
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch {
      toast(t('Couldn’t use the microphone. Check that it is allowed.'), 'error');
      return;
    }
  }
  room = {
    gid, name, stream, peers: new Map(),
    muted: false, deaf: false, cam: false, screen: false,
    joined: false, speaking: false,
    bar: null, stopMeter: null,
    videoTrack: null, videoGrid: null
  };
  room.stopMeter = meter(stream, (on) => { if (room) { room.speaking = on && !room.muted; drawBar(); } });
  drawBar(); paintButtons();
  TWRT.send({ t: 'vc.join', gid });
}
async function leave() {
  if (!room) return;
  const r = room; room = null;
  TWRT.send({ t: 'vc.leave', gid: r.gid });
  for (const p of r.peers.values()) { try { p.pc.close(); } catch { /* ignore */ } if (p.stopMeter) p.stopMeter(); if (p.audio) p.audio.remove(); }
  if (r.stopMeter) r.stopMeter();
  if (r.videoTrack) { try { r.videoTrack.stop(); } catch {} }
  r.stream.getTracks().forEach(x => { try { x.stop(); } catch {} });
  if (r.bar) r.bar.remove();
  if (r.videoGrid) r.videoGrid.remove();
  paintButtons();
}
function setMuted(on) {
  if (!room) return; room.muted = on;
  room.stream.getAudioTracks().forEach(x => { x.enabled = !on; });
  TWRT.send({ t: 'vc.state', gid: room.gid, muted: on }); drawBar();
}
function setDeaf(on) {
  if (!room) return; room.deaf = on;
  for (const p of room.peers.values()) if (p.audio) p.audio.muted = on;
  drawBar();
}

/* ---------- messages from the server ---------- */
TWRT.on('vc.joined', async (m) => {
  if (!room || m.gid !== room.gid) return;
  room.joined = true; drawBar();
  for (const p of m.peers || []) await makePeer(p.uid, p.name, true);   // the newcomer calls everyone already there
  setMuted(room.muted);
});
TWRT.on('vc.peer', (m) => {
  if (room && m.gid === room.gid) {
    toast(t('{name} joined the voice chat', { name: m.name }));
    // Fallback if newcomer's offer doesn't arrive within 4 seconds: initiate call to resolve connection
    setTimeout(async () => {
      if (room && room.gid === m.gid && !room.peers.has(m.uid)) {
        await makePeer(m.uid, m.name, true);
      }
    }, 4000);
  }
});
TWRT.on('vc.left', (m) => { if (room && m.gid === room.gid) { const p = room.peers.get(m.uid); if (p) toast(t('{name} left the voice chat', { name: p.name })); dropPeer(m.uid); } });
TWRT.on('vc.signal', onSignal);
TWRT.on('vc.state', (m) => {
  if (room && m.gid === room.gid) {
    const p = room.peers.get(m.uid);
    if (p) {
      if ('muted' in m) p.muted = !!m.muted;
      if ('screen' in m) { p.isScreen = !!m.screen; updateVideoPanel(); }
      drawBar();
    }
  }
});
TWRT.on('vc.update', (m) => {
  present.set(m.gid, m.who || []);
  if (m.people) presentUsers.set(m.gid, m.people);
  paintButtons();
});
TWRT.on('vc.error', (m) => { toast(m.error || 'Voice chat error.', 'error'); if (room && room.gid === m.gid && !room.joined) leave(); });
TWRT.on('rt.down', () => { if (room) { toast(t('Live connection is down. Voice chat needs it.'), 'error'); leave(); } });
addEventListener('beforeunload', () => { if (room) TWRT.send({ t: 'vc.leave', gid: room.gid }); });

function toggleMute() {
  if (!room) return;
  setMuted(!room.muted);
  toast(room.muted ? t('Microphone muted') : t('Microphone unmuted'));
}
function toggleDeafen() {
  if (!room) return;
  setDeaf(!room.deaf);
  toast(room.deaf ? t('Audio deafened') : t('Audio undeafened'));
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    toggleMute();
  } else if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    toggleDeafen();
  }
});

window.TWVoice = {
  button, join, leave,
  active: () => (room ? room.gid : null),
  openSettings: openAudioSettings,
  toggleMute, toggleDeafen,
  toggleCamera, toggleScreenShare
};
})();
