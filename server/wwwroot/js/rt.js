/* Live connection. One WebSocket to /ws tells the app when something changed (new message, friend request, status, LFG post...), and the app then fetches
   the new data through the normal API, so nothing about permissions changes. While the socket is connected the old 3-second polling slows to a safety net.
   Also carries voice-chat signalling (js/voice.js). Exposes window.TWRT. */
(() => {
'use strict';
const handlers = new Map();   // type -> Set(fn)
let ws = null, up = false, tries = 0, timer = 0, stopped = true, pingT = 0;

const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
function emit(msg) { const s = handlers.get(msg.t); if (s) for (const fn of [...s]) { try { fn(msg); } catch (e) { console.error(e); } } }

function connect() {
  if (ws || stopped || !window.WebSocket) return;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let sock;
  try { sock = new WebSocket(url); } catch { schedule(); return; }
  ws = sock;
  sock.onopen = () => { up = true; tries = 0; clearInterval(pingT); pingT = setInterval(() => send({ t: 'ping' }), 25000); emit({ t: 'rt.up' }); };
  sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && m.t) emit(m); };
  sock.onclose = () => { const was = up; up = false; ws = null; clearInterval(pingT); if (was) emit({ t: 'rt.down' }); schedule(); };
  sock.onerror = () => { try { sock.close(); } catch { /* already closed */ } };
}
function schedule() {
  if (stopped) return;
  clearTimeout(timer);
  const wait = Math.min(30000, 1000 * Math.pow(2, Math.min(tries++, 5))) * (0.7 + Math.random() * 0.6);
  timer = setTimeout(connect, wait);
}
function send(obj) { if (ws && up && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; }
function start() { if (!stopped) return; stopped = false; connect(); }
function stop() { stopped = true; clearTimeout(timer); clearInterval(pingT); if (ws) { try { ws.close(); } catch { /* ignore */ } } ws = null; up = false; }

/* Drop-in for setInterval: runs fn every `ms` while the socket is down, and only every `slowMs` (default 20 s) while it is up. Returns a normal interval id. */
function every(fn, ms, slowMs = 20000) {
  let last = Date.now();
  return setInterval(() => { const now = Date.now(); if (now - last >= (up ? slowMs : ms) - 250) { last = now; fn(); } }, 500);
}
/* Run fn right away when a message of this type arrives (coalesced: at most once per 150 ms). Returns an off() function. */
function pokes(type, fn, match) {
  let wait = 0;
  return on(type, (m) => { if (match && !match(m)) return; if (wait) return; wait = setTimeout(() => { wait = 0; fn(m); }, 150); });
}

window.TWRT = { on, pokes, every, send, start, stop, connected: () => up };
// connect once the app has a signed-in user (app.js calls TWRT.start()); reconnect immediately when the tab comes back
document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped && !ws) { tries = 0; connect(); } });
addEventListener('online', () => { if (!stopped && !ws) { tries = 0; connect(); } });
})();
