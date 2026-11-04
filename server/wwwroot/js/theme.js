/* Themes: colour presets (dark, dim, light, ...), a custom background colour, corner roundness, density and font.
   Loaded first (not deferred) so the saved look is applied before anything is drawn. Saved on this device. Exposes window.TWTheme. */
(() => {
'use strict';
const KEY = 'tw_theme';
const root = document.documentElement;

const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, w) => a.map((v, i) => v * (1 - w) + b[i] * w);
const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

/* bg, surface (sidebar, bars), raised (cards), strong (hover/pressed), border, text, text-2.  Everything else is derived from these. */
const PRESETS = {
  dark:     { label: 'Dark',     light: false, c: null },
  dim:      { label: 'Dim',      light: false, c: ['#15171c', '#1a1d23', '#20232b', '#292d37', '#323744', '#eceef4', '#a2a8b8'] },
  midnight: { label: 'Midnight', light: false, c: ['#070b16', '#0b1120', '#101830', '#18223f', '#222f52', '#e8edff', '#9aa8d0'] },
  forest:   { label: 'Forest',   light: false, c: ['#0a110e', '#0e1713', '#13201a', '#1b2d24', '#25382e', '#eaf5ee', '#9db5a8'] },
  plum:     { label: 'Plum',     light: false, c: ['#120b12', '#18101a', '#1f1523', '#2b1d30', '#3a2a40', '#f7eaf8', '#b9a1bd'] },
  light:    { label: 'Light',    light: true,  c: ['#f3f4f8', '#ffffff', '#ffffff', '#eceef3', '#dcdee6', '#15171c', '#5a5f6e'] },
  sand:     { label: 'Sand',     light: true,  c: ['#f5efe3', '#fffaf0', '#fffdf7', '#efe6d3', '#e0d5bd', '#2a2418', '#6e6450'] }
};
const FONTS = {
  system:   { label: 'System',   stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  humanist: { label: 'Humanist', stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif' },
  rounded:  { label: 'Rounded',  stack: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif' },
  serif:    { label: 'Serif',    stack: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif' },
  mono:     { label: 'Mono',     stack: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace' }
};
const RADII = { square: 0, sharp: .5, default: 1, round: 1.6 };
const DENSITY = { compact: .82, default: 1, roomy: 1.18 };
const DEFAULT = { preset: 'dark', custom: '#101820', radius: 'default', density: 'default', font: 'system' };

let st = { ...DEFAULT };
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable */ } };

const COLOR_VARS = ['--color-bg', '--color-surface', '--color-raised', '--color-strong', '--color-border', '--color-text', '--color-text-2', '--color-line-2', '--color-line-3',
  '--color-hover', '--color-hover-2', '--color-text-3', '--color-pop', '--color-scroll', '--color-focus', '--color-ok-text', '--color-ok-bg', '--color-ok-line', '--color-bad-bg',
  '--color-bad-line', '--color-danger-text', '--color-knob', '--shadow-1', '--shadow-2', '--color-off'];
const SPACE = { '--space-1': 5, '--space-2': 8, '--space-3': 10, '--space-4': 12, '--space-5': 16, '--space-6': 20, '--space-7': 24, '--space-8': 28 };
const RAD = { '--radius-xs': 3.6, '--radius-sm': 5.6, '--radius-md': 9.6, '--radius-lg': 24 };

/** The palette for the current choice: [bg, surface, raised, strong, border, text, text-2] as rgb arrays, or null for the built-in dark theme. */
function palette() {
  if (st.preset === 'custom') {
    const base = hex2rgb(/^#[0-9a-f]{6}$/i.test(st.custom) ? st.custom : DEFAULT.custom), light = lum(base) > .4, to = light ? BLACK : WHITE;
    return { light, c: [base, mix(base, to, light ? .0 : .035), mix(base, to, light ? .0 : .07), mix(base, to, light ? .06 : .12), mix(base, to, light ? .12 : .2),
      light ? [21, 23, 28] : [250, 250, 250], light ? mix([21, 23, 28], base, .35) : mix([250, 250, 250], base, .35)].map(x => x) };
  }
  const p = PRESETS[st.preset] || PRESETS.dark;
  return p.c ? { light: p.light, c: p.c.map(hex2rgb) } : null;
}
let isLight = false, surface = [9, 9, 11];

function apply() {
  const s = root.style;
  COLOR_VARS.forEach(p => s.removeProperty(p));
  const pal = palette();
  isLight = !!(pal && pal.light);
  surface = pal ? pal.c[1] : [9, 9, 11];
  if (pal) {
    const [bg, sf, rs, sg, bd, tx, t2] = pal.c, light = pal.light;
    const set = (p, c) => s.setProperty(p, typeof c === 'string' ? c : rgb2hex(c));
    set('--color-bg', bg); set('--color-surface', sf); set('--color-raised', rs); set('--color-strong', sg); set('--color-border', bd); set('--color-text', tx); set('--color-text-2', t2);
    set('--color-line-2', mix(bd, tx, .14)); set('--color-line-3', mix(bd, tx, .26)); set('--color-hover', mix(sg, tx, .06)); set('--color-hover-2', mix(rs, tx, .05));
    set('--color-text-3', mix(t2, bg, .3)); set('--color-pop', light ? '#ffffff' : mix(sf, tx, .06)); set('--color-scroll', mix(bd, tx, .14)); set('--color-focus', tx); set('--color-off', mix(t2, bg, .4));
    set('--color-knob', light ? '#ffffff' : '#d4d4dc');
    if (light) {
      set('--color-ok-text', '#1f7a3d'); set('--color-ok-bg', '#e3f4ea'); set('--color-ok-line', '#b6dcc4'); set('--color-bad-bg', '#fde8ea'); set('--color-bad-line', '#f1b8bd'); set('--color-danger-text', '#b4232f');
      set('--shadow-1', '0 8px 30px rgba(30, 30, 60, .14)'); set('--shadow-2', '0 16px 40px -18px rgba(30, 30, 60, .28), 0 3px 10px -5px rgba(30, 30, 60, .16)');
    }
  }
  root.style.colorScheme = isLight ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = pal ? rgb2hex(pal.c[0]) : '#000000';
  const cs = document.querySelector('meta[name="color-scheme"]'); if (cs) cs.content = isLight ? 'light' : 'dark';
  root.dataset.theme = isLight ? 'light' : 'dark';

  const r = RADII[st.radius] ?? 1, d = DENSITY[st.density] ?? 1;
  Object.entries(RAD).forEach(([p, v]) => { if (r === 1) s.removeProperty(p); else s.setProperty(p, (v * r).toFixed(1) + 'px'); });
  Object.entries(SPACE).forEach(([p, v]) => { if (d === 1) s.removeProperty(p); else s.setProperty(p, Math.round(v * d * 10) / 10 + 'px'); });
  const f = FONTS[st.font];
  if (!f || st.font === 'system') s.removeProperty('--font'); else s.setProperty('--font', f.stack);
  // accent colours depend on the surface they sit on
  if (window.TWPrefs && TWPrefs.applyAccent) TWPrefs.applyAccent(TWPrefs.get().accentColor);
}

function set(patch) { Object.assign(st, patch); save(); apply(); document.dispatchEvent(new Event('tw:theme')); }
function reset() { st = { ...DEFAULT }; save(); apply(); document.dispatchEvent(new Event('tw:theme')); }

apply();
window.TWTheme = { PRESETS, FONTS, RADII, DENSITY, get: () => ({ ...st }), set, reset, isLight: () => isLight, surface: () => surface.slice(), apply,
  swatch: (key) => { const p = PRESETS[key]; return p && p.c ? p.c.slice(0, 3) : ['#000000', '#09090b', '#111114']; } };
})();
