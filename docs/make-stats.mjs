// Counts lines of code per language in the git-tracked source files and writes docs/languages.svg (a bar chart) plus prints a Markdown table.
// Run from the repo root:  node docs/make-stats.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const LANGS = { '.cs': ['C#', '#9b4f96'], '.js': ['JavaScript', '#f1c40f'], '.css': ['CSS', '#563d7c'], '.html': ['HTML', '#e34c26'], '.py': ['Python', '#3572a5'], '.ps1': ['PowerShell', '#012456'], '.sql': ['SQL', '#e38c00'] };
const SKIP = /(^|\/)(dist|bin|obj|node_modules|\.venv|docs\/screenshots)\//;
const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).filter(f => !SKIP.test(f));
const tot = {};
for (const f of files) {
  const ext = (f.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase(); const L = LANGS[ext]; if (!L) continue;
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const lines = s.split('\n').filter(l => l.trim()).length;   // non-empty lines
  tot[L[0]] = tot[L[0]] || { lines: 0, files: 0, color: L[1] }; tot[L[0]].lines += lines; tot[L[0]].files++;
}
const rows = Object.entries(tot).sort((a, b) => b[1].lines - a[1].lines);
const sum = rows.reduce((a, [, v]) => a + v.lines, 0);
const pct = (n) => (n * 100 / sum);

// SVG: one stacked bar on top, a row per language below
const W = 760, rowH = 34, H = 120 + rows.length * rowH;
let x = 20, svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">
<rect width="${W}" height="${H}" rx="14" fill="#0f1115"/>
<text x="20" y="34" fill="#fafafa" font-size="18" font-weight="700">Third Wheel: language breakdown</text>
<text x="20" y="54" fill="#a3a3ad" font-size="12">${sum.toLocaleString('en')} non-empty lines in ${rows.reduce((a, [, v]) => a + v.files, 0)} source files</text>
<clipPath id="bar"><rect x="20" y="68" width="${W - 40}" height="16" rx="8"/></clipPath><g clip-path="url(#bar)">`;
for (const [, v] of rows) { const w = (W - 40) * v.lines / sum; svg += `<rect x="${x.toFixed(1)}" y="68" width="${w.toFixed(1)}" height="16" fill="${v.color}"/>`; x += w; }
svg += '</g>';
rows.forEach(([name, v], i) => {
  const y = 112 + i * rowH, w = Math.max(2, 330 * v.lines / rows[0][1].lines);
  svg += `<circle cx="28" cy="${y - 4}" r="6" fill="${v.color}"/><text x="44" y="${y}" fill="#fafafa" font-size="14">${name}</text>
<rect x="190" y="${y - 12}" width="${w.toFixed(1)}" height="12" rx="6" fill="${v.color}" opacity=".9"/>
<text x="${W - 20}" y="${y}" fill="#a3a3ad" font-size="13" text-anchor="end">${pct(v.lines).toFixed(1)}%  ·  ${v.lines.toLocaleString('en')} lines</text>`;
});
svg += '</svg>\n';
fs.writeFileSync('docs/languages.svg', svg);
console.log('| Language | Share | Lines | Files |\n|---|---:|---:|---:|');
for (const [n, v] of rows) console.log(`| ${n} | ${pct(v.lines).toFixed(1)}% | ${v.lines.toLocaleString('en')} | ${v.files} |`);
