# Profile README art

The SVGs in `../../assets` are drawn from [chasesunstrom.dev](https://www.chasesunstrom.dev)'s own code, so the
README matches the site: the dotted name and portrait, the `whoami` typewriter, and each project's canvas scene
put through the site's halftone pass.

- `extract.mjs` bundles the site's scenes, project data and portrait, runs them in headless Chromium, and saves
  the dots to `data.json`.
- `build.mjs` turns those dots into SVGs. Text is written out as glyph outlines (Newsreader and JetBrains Mono,
  with Inter for body copy) so nothing depends on fonts loading inside GitHub's image sandbox.
- `config.mjs` holds the layout, which projects get cards and how each scene is framed, plus the few lines of
  copy that are not in the site's data (roles, bio, star counts).

## Rebuild

```bash
cd scripts/readme
npm install
PORTFOLIO_DIR=/path/to/portfolio npm run build
```

It needs a checkout of the portfolio repo (defaults to `../portfolio` next to this repo), the full
JetBrains Mono and Inter fonts (`JETBRAINS_MONO` / `INTER` to point at them; Debian/Ubuntu:
`apt install fonts-jetbrains-mono fonts-inter`), and a Chromium (`CHROMIUM=/path/to/chrome`, or
`npx playwright install chromium`).
