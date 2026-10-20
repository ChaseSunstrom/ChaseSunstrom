// Runs the site's own drawing code in headless Chromium and writes the dot data
// (hero name, portrait, headings, project scenes) to data.json for build.mjs.
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, PATHS } from './config.mjs';

const src = path.join(PATHS.portfolio, 'src');
if (!fs.existsSync(src)) {
  console.error(`Portfolio site not found at ${PATHS.portfolio}; set PORTFOLIO_DIR to a checkout of it.`);
  process.exit(1);
}
const FONTS = path.join(PATHS.portfolio, 'public/fonts/');
const b64 = (f) => fs.readFileSync(FONTS + f).toString('base64');

// The site's scenes, data and portrait, bundled for the page.
const harness = await build({
  stdin: {
    contents: [
      `import { visuals } from ${JSON.stringify(path.join(src, 'visuals'))};`,
      `import { projects } from ${JSON.stringify(path.join(src, 'data/projects'))};`,
      `import { PORTRAIT } from ${JSON.stringify(path.join(src, 'data/portrait'))};`,
      `import { hexToRgb } from ${JSON.stringify(path.join(src, 'visuals/types'))};`,
      'window.H = { visuals, projects, PORTRAIT, hexToRgb };',
    ].join('\n'),
    resolveDir: src,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'warning',
});

const browser = await chromium.launch(PATHS.chromium ? { executablePath: PATHS.chromium } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// Nixie draws a live clock; pin it so the card is the same on every build.
await page.clock.setFixedTime(new Date('2026-10-20T13:37:42'));
await page.setContent('<html><body style="margin:0;background:#07070a"></body></html>');
await page.addScriptTag({ content: harness.outputFiles[0].text });

await page.evaluate(async (fonts) => {
  for (const [family, style, file] of fonts) {
    const face = new FontFace(family, `url(data:font/woff2;base64,${file})`, { style, weight: family === 'Newsreader' ? '200 800' : '400 800' });
    document.fonts.add(await face.load());
  }
}, [
  ['Newsreader', 'normal', b64('newsreader-normal-latin.woff2')],
  ['Newsreader', 'italic', b64('newsreader-italic-latin.woff2')],
  ['JetBrains Mono', 'normal', b64('jetbrains-mono-normal-latin.woff2')],
]);

const data = await page.evaluate((CONFIG) => {
  const { visuals, projects, PORTRAIT, hexToRgb } = window.H;

  /**
   * Samples text drawn on an offscreen canvas at a grid, like DotHero / DotText.
   * runs: [{ text, x, y (baseline), font, emph }]. Returns dots with emph flag.
   */
  const sample = ({ W, H, runs, gap, stroke = 0 }) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const o = c.getContext('2d', { willReadFrequently: true });
    const m = document.createElement('canvas');
    m.width = W;
    m.height = H;
    const mo = m.getContext('2d', { willReadFrequently: true });
    const boxes = [];
    for (const r of runs) {
      for (const ctx of r.emph ? [o, mo] : [o]) {
        ctx.font = r.font;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = stroke;
        ctx.lineJoin = 'round';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(r.text, r.x, r.y);
        if (stroke) ctx.strokeText(r.text, r.x, r.y);
      }
      o.font = r.font;
      boxes.push({ x: r.x, w: o.measureText(r.text).width });
    }
    const d = o.getImageData(0, 0, W, H).data;
    const e = mo.getImageData(0, 0, W, H).data;
    const dots = [];
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        const i = (y * W + x) * 4 + 3;
        if (d[i] < 128) continue;
        dots.push([x, y, e[i] >= 128 ? 1 : 0]);
      }
    }
    return { dots, boxes };
  };

  const measure = (font, text) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = font;
    return c.measureText(text).width;
  };

  /** The site's halftone pass, returning dots instead of painting them. */
  const scene = ({ id, T, W, H, view, gap, exposure = 1 }) => {
    const p = projects.find((q) => q.id === id);
    const SC = 0.5;
    const src = document.createElement('canvas');
    src.width = Math.ceil(W * SC);
    src.height = Math.ceil(H * SC);
    const s = src.getContext('2d');
    const draw = visuals[p.visual]();
    const dt = 1 / 60;
    const accent = hexToRgb(p.accent);
    const DW = 640;
    const DH = 420;
    for (let t = 0; t <= T; t += dt) {
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, src.width, src.height);
      // Centre the design box on (cx, cy) at zoom k, inside a W×H box.
      s.setTransform(SC * view.k, 0, 0, SC * view.k, SC * (W / 2 - view.cx * view.k), SC * (H / 2 - view.cy * view.k));
      draw({ ctx: s, w: DW, h: DH, t, dt, pointer: null, accent });
    }
    const grown = document.createElement('canvas');
    grown.width = src.width;
    grown.height = src.height;
    const g = grown.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'lighten';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(src, dx, dy);
    const cols = Math.ceil(W / gap);
    const rows = Math.ceil(H / gap);
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const mc = small.getContext('2d', { willReadFrequently: true });
    mc.imageSmoothingEnabled = true;
    mc.imageSmoothingQuality = 'high';
    mc.drawImage(grown, 0, 0, cols, rows);
    const d = mc.getImageData(0, 0, cols, rows).data;
    const R = gap * 0.5;
    const dots = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 4;
        const a = d[k + 3] / 255;
        const max = Math.max(d[k], d[k + 1], d[k + 2]);
        const v = ((max / 255) * a - 0.06) / 0.94;
        if (v <= 0) continue;
        const r = R * Math.min(0.9, Math.sqrt(v * exposure) * 1.1);
        if (r < 0.3) continue;
        const sc = 255 / Math.max(1, max);
        const q = (n) => ((n * sc) >> 4) * 17;
        dots.push([(i + 0.5) * gap, (j + 0.5) * gap, r, q(d[k]), q(d[k + 1]), q(d[k + 2])]);
      }
    }
    return dots;
  };

  const out = { portrait: PORTRAIT, projects: {}, scenes: {}, names: {}, headings: {}, name: null };

  // Hero name, as DotHero draws it: Newsreader 400, sampled at size/26.
  {
    const { size, x, top, lineH, gap, W, H } = CONFIG.hero.name;
    const font = `400 ${size}px Newsreader`;
    const runs = CONFIG.hero.name.lines.map((text, k) => ({ text, x, y: top + size * 0.78 + k * lineH, font }));
    out.name = sample({ W, H, runs, gap });
  }

  // Dotted headings, as DotText draws them: display weight 300, emphasis in italic.
  for (const [key, h] of Object.entries(CONFIG.headings)) {
    let x = h.x;
    const runs = [];
    for (const part of h.parts) {
      const font = `${part.emph ? 'italic ' : ''}300 ${h.size}px Newsreader`;
      runs.push({ text: part.text, x, y: h.y, font, emph: !!part.emph });
      x += measure(font, part.text);
    }
    out.headings[key] = { ...sample({ W: h.W, H: h.H, runs, gap: Math.max(2, Math.round(h.size / h.gapDiv)), stroke: Math.max(1, h.size * 0.03) }), width: x - h.x };
  }

  for (const c of CONFIG.cards) {
    const p = projects.find((q) => q.id === c.id);
    out.projects[c.key || c.id] = { name: p.name, tagline: p.tagline, accent: p.accent, made: p.made, cluster: p.cluster, stars: p.stars, repo: p.repo, stack: p.stack, exposure: p.exposure };
    out.scenes[c.key || c.id] = scene({ id: c.id, T: c.t, W: CONFIG.card.W, H: CONFIG.card.sceneH, view: c.view, gap: CONFIG.card.gap, exposure: c.exposure ?? p.exposure ?? 1 });
    const n = CONFIG.card.name;
    const font = `400 ${n.size}px Newsreader`;
    out.names[c.key || c.id] = sample({ W: CONFIG.card.W, H: n.size * 2, runs: [{ text: p.name, x: n.x, y: n.size * 1.25, font }], gap: n.gap, stroke: Math.max(1, n.size * 0.03) });
  }
  return out;
}, CONFIG);

fs.writeFileSync(PATHS.data, JSON.stringify(data));
console.log('portrait', data.portrait.w, data.portrait.h, 'name dots', data.name.dots.length);
for (const [k, v] of Object.entries(data.scenes)) console.log('scene', k, v.length, 'name dots', data.names[k].dots.length);
for (const [k, v] of Object.entries(data.headings)) console.log('heading', k, v.dots.length, Math.round(v.width));
await browser.close();
