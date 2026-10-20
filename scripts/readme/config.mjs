// Settings shared by extract.mjs (dot sampling in Chromium) and build.mjs (SVG output).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const firstExisting = (...paths) => paths.find((p) => p && fs.existsSync(p));

export const PATHS = {
  /** A checkout of the portfolio site (github.com/ChaseSunstrom/portfolio). */
  portfolio: process.env.PORTFOLIO_DIR || path.resolve(here, '../../../portfolio'),
  /** Full JetBrains Mono (the site ships a Latin subset without the arrows). */
  mono: firstExisting(process.env.JETBRAINS_MONO, '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf'),
  /** Inter stands in for the site's system sans in body copy. */
  sans: firstExisting(process.env.INTER, '/usr/share/fonts/opentype/inter/Inter-Regular.otf'),
  /** Optional: a Chromium binary; otherwise Playwright's own download is used. */
  chromium: firstExisting(process.env.CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'),
  data: path.join(here, 'data.json'),
  assets: path.resolve(here, '../../assets'),
};

/** Copy that is not in the site's data files. */
export const CONTENT = {
  // From the site's Hero.tsx.
  roles: ['software engineer', 'security consultant', 'compiler writer', 'firmware hacker', 'AI architect'],
  bio: 'I work close to the metal — C, C++, Rust and .NET — on compilers and build tools, bare-metal firmware, and the architecture of AI systems. Then I try to break it.',
  // Live numbers from GitHub; the site's snapshot lags behind.
  stars: { cforge: 192 },
  publicProjects: 19,
};

export const CONFIG = {
  hero: {
    W: 1200,
    name: { lines: ['Chase', 'Sunstrom'], size: 100, x: 64, top: 44, lineH: 100 * 0.92, gap: 4, W: 760, H: 280 },
    portrait: { h: 470, right: 70, top: 32 },
  },
  headings: {
    projects: {
      W: 1200,
      H: 100,
      x: 64,
      y: 82,
      size: 48,
      gapDiv: 18,
      parts: [{ text: 'Things I’ve built, ' }, { text: 'from the metal up', emph: true }, { text: '.' }],
    },
  },
  card: {
    W: 400,
    H: 276,
    sceneH: 136,
    gap: 5,
    name: { size: 42, x: 26, gap: 3 },
  },
  // view: zoom k and the design-box point (cx, cy) that lands in the middle of the scene strip.
  // drop: boxes (card coordinates) whose dots are left out, for stray labels.
  cards: [
    { id: 'volt', t: 1.5, exposure: 0.75, view: { k: 0.72, cx: 330, cy: 194 } },
    { id: 'cforge', t: 6, view: { k: 0.64, cx: 318, cy: 219 } },
    { id: 'raytracer', t: 3, view: { k: 0.62, cx: 320, cy: 200 } },
    { id: 'nixie', t: 3, view: { k: 0.58, cx: 320, cy: 205 } },
    { id: 'foreman', t: 6, view: { k: 0.75, cx: 430, cy: 120 } },
    { id: 'jarvis', t: 3, view: { k: 0.35, cx: 320, cy: 199 }, drop: [[280, 0, 400, 16]] },
  ],
};
