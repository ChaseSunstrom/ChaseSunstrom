// Builds the README's SVGs from data.json (dots sampled by extract.mjs) and the
// site's fonts. Text is written out as glyph outlines so nothing depends on
// fonts loading inside GitHub's image sandbox.
import * as fontkit from 'fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, CONTENT, PATHS } from './config.mjs';

const OUT = PATHS.assets;
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(PATHS.data, 'utf8'));

// ---------------------------------------------------------------- palette
const C = {
  bg: '#07070a',
  surface: '#0c0c11',
  ink: '#f0eee8',
  muted: '#a6a49e',
  faint: '#706f6c',
  ember: '#ff8a3d',
  ion: '#5ee6ff',
};
const EMBER = [255, 138, 61];
const GOLD = [255, 210, 122];
const ION = [94, 230, 255];
const lerp = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const ramp = (k) => hex(k < 0.5 ? lerp(EMBER, GOLD, k * 2) : lerp(GOLD, ION, (k - 0.5) * 2));
const BUCKETS = 24;
const n1 = (v) => +v.toFixed(1);
const n2 = (v) => +v.toFixed(2);

// ---------------------------------------------------------------- fonts
const FONTDIR = path.join(PATHS.portfolio, 'public/fonts/');
for (const [name, file, env] of [['JetBrains Mono', PATHS.mono, 'JETBRAINS_MONO'], ['Inter', PATHS.sans, 'INTER']]) {
  if (!file) {
    console.error(`${name} not found; set ${env} to its .ttf/.otf file.`);
    process.exit(1);
  }
}
const base = {
  serif: fontkit.openSync(FONTDIR + 'newsreader-normal-latin.woff2'),
  serifItalic: fontkit.openSync(FONTDIR + 'newsreader-italic-latin.woff2'),
  mono: fontkit.openSync(PATHS.mono),
  sans: fontkit.openSync(PATHS.sans),
  // For glyphs the mono lacks, like ★.
  fallback: fontkit.openSync(PATHS.sans),
};
/** A font at its default instance (fontkit cannot lay out instances of variable WOFF2 fonts). */
const face = (family) => ({ font: base[family], key: family.replace(/[^a-z]/gi, '') });

/** One SVG document's worth of glyph definitions, shared by every text run in it. */
class Doc {
  constructor() {
    this.defs = new Map();
  }

  glyph(fkey, glyph) {
    const id = `${fkey}${glyph.id}`;
    if (!this.defs.has(id)) {
      const d = glyph.path.toSVG().replace(/-?\d*\.?\d+(e-?\d+)?/g, (n) => String(Math.round(+n)));
      this.defs.set(id, d ? `<path id="${id}" d="${d}"/>` : '');
    }
    return this.defs.get(id) ? id : null;
  }

  /** Splits text into runs by which font has the glyphs. */
  segments(family, str) {
    const main = face(family);
    const fb = face('fallback');
    const segs = [];
    for (const ch of str) {
      const f = base[family].hasGlyphForCodePoint(ch.codePointAt(0)) || ch === ' ' ? main : fb;
      const last = segs[segs.length - 1];
      if (last && last.f === f) last.text += ch;
      else segs.push({ f, text: ch });
    }
    return segs;
  }

  width(family, size, str) {
    return this.segments(family, str).reduce((w, s) => w + s.f.font.layout(s.text).advanceWidth * (size / s.f.font.unitsPerEm), 0);
  }

  /** Text as glyph outlines. `ls` is extra letter spacing in px. */
  text(family, size, str, x, y, fill, { ls = 0, attrs = '' } = {}) {
    let pen = 0;
    const out = [];
    for (const seg of this.segments(family, str)) {
      const { font } = seg.f;
      const s = size / font.unitsPerEm;
      const run = font.layout(seg.text);
      const uses = [];
      let u = 0;
      run.glyphs.forEach((g, i) => {
        const p = run.positions[i];
        const id = this.glyph(seg.f.key, g);
        if (id) uses.push(`<use xlink:href="#${id}" x="${Math.round(u + p.xOffset)}"${p.yOffset ? ` y="${Math.round(p.yOffset)}"` : ''}/>`);
        u += p.xAdvance + ls / s;
      });
      if (uses.length) out.push(`<g transform="translate(${n1(x + pen)} ${n1(y)}) scale(${+s.toFixed(5)} ${-s.toFixed(5)})">${uses.join('')}</g>`);
      pen += u * s;
    }
    return { svg: `<g fill="${fill}"${attrs}>${out.join('')}</g>`, width: pen };
  }

  wrap(family, size, str, maxW) {
    const lines = [];
    let line = '';
    for (const word of str.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.width(family, size, next) > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Like wrap, but evens out the lines so a short last word doesn't sit alone. */
  balance(family, size, str, maxW) {
    const lines = this.wrap(family, size, str, maxW);
    if (lines.length !== 2) return lines;
    const words = str.split(' ');
    let best = lines;
    let score = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const wa = this.width(family, size, a);
      const wb = this.width(family, size, b);
      if (wa > maxW || wb > maxW) continue;
      const s = Math.abs(wa - wb);
      if (s < score) {
        score = s;
        best = [a, b];
      }
    }
    return best;
  }

  defsSvg() {
    return [...this.defs.values()].join('');
  }
}

const svg = (W, H, label, body, { defs = '', style = '' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">` +
  `<title>${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>` +
  (style ? `<style>${style}</style>` : '') +
  `<defs>${defs}</defs>${body}</svg>\n`;

const write = (name, content) => {
  fs.writeFileSync(path.join(OUT, name), content);
  console.log(name.padEnd(30), `${(content.length / 1024).toFixed(1)} KB`);
};

const REDUCED = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}';
const UP = '@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}';

/** A dotted rule, like the site's `border-dotted border-white/25`. */
const dotted = (x1, y, x2, color = '#fff', opacity = 0.25) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0 5"/>`;

// ---------------------------------------------------------------- hero
const { roles: ROLES, bio: BIO, stars: STARS, publicProjects: PUBLIC_PROJECTS } = CONTENT;

function hero() {
  const d = new Doc();
  const { W } = CONFIG.hero;
  const X = CONFIG.hero.name.x;
  const parts = [];

  // Copy column, flowing down from under the name.
  const nameBottom = CONFIG.hero.name.top + CONFIG.hero.name.size * 0.78 + CONFIG.hero.name.lineH;
  const portraitW = (CONFIG.hero.portrait.h * data.portrait.w) / data.portrait.h;
  const colW = W - CONFIG.hero.portrait.right - portraitW - X - 44;
  let y = nameBottom + 58;

  // $ whoami → role▌
  const MONO = 21;
  const adv = d.width('mono', MONO, 'M');
  const who = [];
  let x = X;
  const put = (str, fill) => {
    const t = d.text('mono', MONO, str, x, y, fill);
    who.push(t.svg);
    x += t.width;
  };
  put('$ ', C.faint);
  put('whoami ', C.muted);
  put('→ ', C.faint);
  const roleX = x;

  // Typewriter: role 0 is on screen, then each role is deleted and the next typed, forever.
  const TYPE = 0.064;
  const DEL = 0.034;
  const HOLD = 2.4;
  const events = ROLES.map(() => []);
  const cursor = [];
  let t = 0;
  ROLES.forEach((role, i) => {
    const j = (i + 1) % ROLES.length;
    for (let c = role.length - 1; c >= 0; c--) {
      t += DEL;
      events[i].push([t, c]);
      cursor.push([t, c]);
    }
    for (let c = 1; c <= ROLES[j].length; c++) {
      t += TYPE;
      events[j].push([t, c]);
      cursor.push([t, c]);
    }
    t += HOLD;
  });
  const period = t;
  const smil = (attr, initial, evs, map) => {
    const values = [map(initial)];
    const times = [0];
    for (const [et, c] of evs) {
      values.push(map(c));
      times.push(+(et / period).toFixed(5));
    }
    return `<animate attributeName="${attr}" calcMode="discrete" begin="4.2s" dur="${period.toFixed(3)}s" repeatCount="indefinite" values="${values.join(';')}" keyTimes="${times.join(';')}"/>`;
  };
  const clipY = y - MONO;
  const clipH = MONO * 1.5;
  ROLES.forEach((role, i) => {
    const init = i === 0 ? role.length : 0;
    parts.push(
      `<clipPath id="tw${i}"><rect x="${n1(roleX)}" y="${n1(clipY)}" height="${clipH}" width="${n1(init * adv)}">${smil('width', init, events[i], (c) => n1(c * adv))}</rect></clipPath>`,
    );
    who.push(`<g clip-path="url(#tw${i})">${d.text('mono', MONO, role, roleX, y, C.ember).svg}</g>`);
  });
  const curH = MONO * 1.05;
  who.push(
    `<rect class="blink" x="${n1(roleX + ROLES[0].length * adv + 2)}" y="${n1(y - MONO * 0.82)}" width="${n1(MONO * 0.55)}" height="${n1(curH)}" fill="${C.ember}">${smil('x', ROLES[0].length, cursor, (c) => n1(roleX + c * adv + 2))}</rect>`,
  );
  const whoami = `<g class="l1">${who.join('')}</g>`;

  // Bio, in the site's body sans.
  const BIO_SIZE = 21;
  const BIO_LH = 31;
  y += 44;
  const bio = d
    .wrap('sans', BIO_SIZE, BIO, colW)
    .map((line, k) => d.text('sans', BIO_SIZE, line, X, y + k * BIO_LH, C.muted).svg)
    .join('');
  const bioLines = d.wrap('sans', BIO_SIZE, BIO, colW).length;
  y += (bioLines - 1) * BIO_LH + 34;

  // Facts, as the hero's <dl>: dotted rule, then two columns of label / value.
  const facts = [
    ['based in', 'Urbandale, Iowa'],
    ['currently', 'Source Allies'],
    ['on github', `cforge ★ ${STARS.cforge}`],
    ['open to', 'consulting & contracts'],
  ];
  const DT = 14;
  const DD = 15.5;
  const widths = facts.map(([k, v]) => Math.max(d.width('mono', DT, k), d.width('mono', DD, v)));
  const spare = (colW - widths.reduce((a, b) => a + b, 0)) / (facts.length - 1);
  let dl = dotted(X, y, X + colW);
  let fx = X;
  facts.forEach(([k, v], i) => {
    dl += d.text('mono', DT, k, fx, y + 28, C.faint, { attrs: ' fill-opacity=".75"' }).svg;
    dl += d.text('mono', DD, v, fx, y + 50, C.muted).svg;
    fx += widths[i] + spare;
  });
  const H = Math.round(y + 50 + 40);

  // Name in dots: one group per colour bucket, which is also its column band, so
  // the groups print in left to right like DotHero.
  const nd = data.name.dots;
  const minX = Math.min(...nd.map((p) => p[0]));
  const maxX = Math.max(...nd.map((p) => p[0]));
  const nameGroups = Array.from({ length: BUCKETS }, () => []);
  const r = CONFIG.hero.name.gap * 0.42;
  for (const [px, py] of nd) {
    const b = Math.round(((px - minX) / (maxX - minX)) * (BUCKETS - 1));
    nameGroups[b].push(`<circle cx="${px}" cy="${py}" r="${n2(r)}"/>`);
  }
  const name = nameGroups
    .map((g, b) => `<g class="pn" style="animation-delay:${(0.1 + (b / (BUCKETS - 1)) * 0.9).toFixed(2)}s" fill="${ramp(b / (BUCKETS - 1))}">${g.join('')}</g>`)
    .join('');

  // Portrait, from the site's dot map, scanned in top to bottom.
  const P = data.portrait;
  const ph = Math.min(CONFIG.hero.portrait.h, H - 2 * CONFIG.hero.portrait.top);
  const sp = ph / P.h;
  const pw = P.w * sp;
  const px = W - CONFIG.hero.portrait.right - pw;
  const py = (H - ph) / 2;
  const pGroups = Array.from({ length: BUCKETS }, () => []);
  for (let j = 0; j < P.h; j++) {
    for (let i = 0; i < P.w; i++) {
      const v = parseInt(P.data[j * P.w + i], 36) / 35;
      if (v < 0.07) continue;
      const rr = 0.5 * Math.sqrt(v);
      if (rr * sp < 0.35) continue;
      pGroups[Math.round((i / (P.w - 1)) * (BUCKETS - 1))].push(`<circle cx="${i}" cy="${j}" r="${n2(rr)}"/>`);
    }
  }
  const portrait =
    `<clipPath id="scan"><rect x="-1" y="-1" width="${P.w + 2}" height="${P.h + 2}"><animate attributeName="height" values="0;0;${P.h + 2}" keyTimes="0;0.24;1" dur="1.45s" fill="freeze"/></rect></clipPath>` +
    `<g transform="translate(${n2(px + sp / 2)} ${n2(py + sp / 2)}) scale(${n2(sp)})"><g clip-path="url(#scan)">` +
    pGroups.map((g, b) => `<g fill="${ramp(b / (BUCKETS - 1))}">${g.join('')}</g>`).join('') +
    `</g></g>` +
    // The scan line that prints it.
    `<rect class="scanline" x="${n1(px - 10)}" y="${n1(py)}" width="${n1(pw + 20)}" height="2" fill="url(#scanGrad)" opacity="0"><animate attributeName="y" values="${n1(py)};${n1(py)};${n1(py + ph)}" keyTimes="0;0.24;1" dur="1.45s" fill="freeze"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.24;0.9;1" dur="1.6s" fill="freeze"/></rect>`;

  const defs =
    `<radialGradient id="ge" cx="0.18" cy="0.35" r="0.45"><stop offset="0" stop-color="${C.ember}" stop-opacity=".11"/><stop offset="1" stop-color="${C.ember}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="gi" cx="0.78" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.ion}" stop-opacity=".08"/><stop offset="1" stop-color="${C.ion}" stop-opacity="0"/></radialGradient>` +
    `<pattern id="lat" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#fff" fill-opacity=".07"/></pattern>` +
    `<radialGradient id="latFade" cx="0.5" cy="0.5" r="0.62"><stop offset="0.3" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
    `<mask id="latMask"><rect width="${W}" height="${H}" fill="url(#latFade)"/></mask>` +
    `<linearGradient id="scanGrad"><stop offset="0" stop-color="${C.ember}" stop-opacity="0"/><stop offset=".5" stop-color="${C.ember}"/><stop offset="1" stop-color="${C.ion}" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="card"><rect width="${W}" height="${H}" rx="18"/></clipPath>` +
    parts.join('') +
    d.defsSvg();

  const style =
    UP +
    '@keyframes print{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}' +
    '@keyframes pulse{50%{opacity:.5}}' +
    '.pn{animation:print .5s cubic-bezier(.2,.7,.2,1) both}' +
    '.l1,.l2,.l3{animation:up .9s cubic-bezier(.2,.7,.2,1) both}.l1{animation-delay:1.5s}.l2{animation-delay:1.65s}.l3{animation-delay:1.8s}' +
    '.blink{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}' +
    REDUCED;

  const body =
    `<g clip-path="url(#card)">` +
    `<rect width="${W}" height="${H}" fill="${C.bg}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#ge)"/><rect width="${W}" height="${H}" fill="url(#gi)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#lat)" mask="url(#latMask)"/>` +
    portrait +
    name +
    whoami +
    `<g class="l2">${bio}</g>` +
    `<g class="l3">${dl}</g>` +
    `</g>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="#fff" stroke-opacity=".08"/>`;

  write(
    'hero.svg',
    svg(W, H, `Chase Sunstrom — software engineer and security consultant. ${BIO} Based in Urbandale, Iowa; currently consulting at Source Allies; open to consulting and contract work.`, body, { defs, style }),
  );
}

// ---------------------------------------------------------------- section heading
function heading(key, index, label, note, theme) {
  const d = new Doc();
  const h = CONFIG.headings[key];
  const hd = data.headings[key];
  const dark = theme === 'dark';
  const ink = dark ? C.ink : '#1f2328';
  const faint = dark ? C.faint : '#59636e';
  // On a light page the lamp colours are darkened so they hold their contrast.
  const rampFor = (k) => (dark ? ramp(k) : hex(lerp(k < 0.5 ? [201, 82, 10] : [176, 120, 18], k < 0.5 ? [176, 120, 18] : [8, 132, 158], k < 0.5 ? k * 2 : (k - 0.5) * 2)));
  const r = n2(Math.max(2, Math.round(h.size / h.gapDiv)) * 0.44);
  const plain = [];
  const emph = Array.from({ length: 16 }, () => []);
  for (const [x, y, e] of hd.dots) {
    const c = `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    if (e) emph[Math.round((x / h.W) * 15)].push(c);
    else plain.push(c);
  }
  let kx = h.x;
  const kick = [];
  const k1 = d.text('mono', 15, index, kx, 28, faint, { attrs: ' fill-opacity=".6"' });
  kick.push(k1.svg);
  kx += k1.width + 18;
  const k2 = d.text('mono', 15, '~/', kx, 28, dark ? C.ember : '#c9520a');
  kick.push(k2.svg);
  kx += k2.width;
  kick.push(d.text('mono', 15, label, kx, 28, faint).svg);
  if (note) {
    const nw = d.width('mono', 15, note);
    kick.push(d.text('mono', 15, note, h.W - h.x - nw, 28, faint).svg);
  }
  const body =
    kick.join('') +
    `<g fill="${ink}">${plain.join('')}</g>` +
    emph.map((g, b) => (g.length ? `<g fill="${rampFor(b / 15)}">${g.join('')}</g>` : '')).join('');
  const title = h.parts.map((p) => p.text).join('');
  write(`heading-${key}${dark ? '' : '-light'}.svg`, svg(h.W, h.H, title, body, { defs: d.defsSvg() }));
}

// ---------------------------------------------------------------- project cards
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CLUSTER = { toolchains: 'toolchains', agents: 'agents', metal: 'bare metal', infra: 'infrastructure', pixels: 'pixels', apps: 'apps & tools' };

function card(c, index) {
  const d = new Doc();
  const K = c.key || c.id;
  const p = data.projects[K];
  const { W, H, sceneH } = CONFIG.card;
  const accent = p.accent;
  const X = 26;

  // Scene, as halftone dots grouped by colour.
  const groups = new Map();
  for (const [x, y, r, R, G, B] of data.scenes[K]) {
    if ((c.drop || []).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
    const key = hex([R, G, B]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n2(r)}"/>`);
  }
  const scene = [...groups].map(([fill, dots]) => `<g fill="${fill}">${dots.join('')}</g>`).join('');

  // Kicker: index, rule, start date and cluster; stars on the right.
  const ky = sceneH + 26;
  let kx = X;
  const k = [];
  const t1 = d.text('mono', 14, String(index).padStart(2, '0'), kx, ky, accent);
  k.push(t1.svg);
  kx += t1.width + 12;
  k.push(`<line x1="${n1(kx)}" y1="${ky - 5}" x2="${n1(kx + 26)}" y2="${ky - 5}" stroke="#fff" stroke-opacity=".2"/>`);
  kx += 38;
  const [yy, mm] = p.made.split('-');
  k.push(d.text('mono', 14, `${MONTHS[+mm - 1]} ${yy} · ${CLUSTER[p.cluster]}`, kx, ky, C.faint).svg);
  const stars = STARS[c.id];
  if (stars) {
    const s = `★ ${stars}`;
    k.push(d.text('mono', 14, s, W - X - d.width('mono', 14, s), ky, C.muted).svg);
  }

  // Name in dots, in ink (DotText's plain words).
  const nb = ky + 45;
  const n = CONFIG.card.name;
  const off = nb - n.size * 1.25;
  const nr = n2(n.gap * 0.44);
  const name = `<g fill="${C.ink}">${data.names[K].dots.map(([x, y]) => `<circle cx="${x}" cy="${n1(y + off)}" r="${nr}"/>`).join('')}</g>`;

  // Tagline in the serif italic, in the project's accent.
  const TS = 18.5;
  const lines = d.balance('serifItalic', TS, p.tagline, W - 2 * X);
  const tag = lines.map((line, i) => d.text('serifItalic', TS, line, X, nb + 30 + i * 22, accent).svg).join('');

  const defs =
    `<clipPath id="c"><rect width="${W}" height="${H}" rx="14"/></clipPath>` +
    `<radialGradient id="g" cx="0.62" cy="0.28" r="0.62"><stop offset="0" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="m"><rect width="${W}" height="${sceneH}" fill="url(#f)"/></mask>` +
    d.defsSvg();

  const body =
    `<g clip-path="url(#c)">` +
    `<rect width="${W}" height="${H}" fill="${C.surface}"/><rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<g mask="url(#m)">${scene}</g>` +
    k.join('') +
    name +
    tag +
    `</g>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="none" stroke="#fff" stroke-opacity=".08"/>`;
  write(`card-${K}.svg`, svg(W, H, `${p.name} — ${p.tagline}`, body, { defs }));
}

// ---------------------------------------------------------------- buttons
function button(name, label, kind, theme) {
  const d = new Doc();
  const S = 15;
  const PX = 18;
  const H = 44;
  const arrow = label.slice(-1);
  const text = label.slice(0, -2);
  const tw = d.width('mono', S, text);
  const aw = d.width('mono', S, arrow);
  const W = Math.ceil(PX + tw + 12 + aw + PX);
  const dark = theme === 'dark';
  const ink = dark ? C.ink : C.bg;
  const paper = dark ? C.bg : '#ffffff';
  const primary = kind === 'primary';
  const fill = primary ? ink : paper;
  const fg = primary ? paper : ink;
  const stroke = primary ? ink : dark ? 'rgba(255,255,255,.22)' : 'rgba(7,7,10,.25)';
  const by = H / 2 + S * 0.36;
  const body =
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="2" fill="${fill}" stroke="${stroke}"/>` +
    d.text('mono', S, text, PX, by, fg, { ls: 0.3 }).svg +
    d.text('mono', S, arrow, PX + tw + 12, by, fg).svg;
  write(`btn-${name}${dark ? '' : '-light'}.svg`, svg(W, H, text, body, { defs: d.defsSvg() }));
}

hero();
for (const theme of ['dark', 'light']) {
  heading('projects', '01', 'projects', `${CONFIG.cards.length} of ${PUBLIC_PROJECTS} · each drawn in dots`, theme);
  button('site', 'chasesunstrom.dev ↗', 'primary', theme);
  button('resume', 'Résumé, PDF ↗', 'ghost', theme);
  button('linkedin', 'LinkedIn ↗', 'ghost', theme);
  button('email', 'Email →', 'ghost', theme);
}
CONFIG.cards.forEach((c, i) => card(c, i + 1));
