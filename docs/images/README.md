# README media

`banner.png` was generated with the built-in imagegen tool on 2026-10-13.
It is brand artwork. The remaining images are actual browser screenshots of
the production app, captured with Playwright and disposable demo data.

To refresh screenshots, install the project dependencies and Playwright's
Chromium browser, then run:

```bash
pnpm build
node scripts/screenshots.mjs
```

The capture script creates a separate SQLite database under the OS temporary
directory, completes Awakening, seeds ten days of progression with the existing
development history helper, and starts a focus session. It does not modify the
regular app database. It checks for page errors and horizontal overflow.
Desktop captures use a 1440 × 1040 viewport; mobile captures use 390 × 844.
Full-page captures may be taller. Reduced motion keeps capture frames stable.

Banner generation prompt:

```text
Use case: ads-marketing
Asset type: GitHub README banner for the existing app unranked.
Primary request: Wide polished brand banner, landscape about 3:1. Match a serious LitRPG personal growth app whose interface has a midnight navy ground, cyan holographic accents, thin technical rules, and a faceted hunter crystal with orbital lines. Abstract digital atmosphere, elegant restrained sci-fi, ample negative space. One large cyan translucent faceted octahedral crystal with delicate orbit lines and a few particles on the right, subtly lit from within, on nearly black deep blue. On the left render the exact lowercase title "unranked" in very large clean white sans-serif with generous spacing. Below render exactly "A real-life System." in smaller pale blue sans-serif. Small restrained eyebrow exactly "DAILY QUESTS / FOCUS / GROWTH". Typography is highly legible, precise and spacious. Flat rectangular full bleed banner, no rounded card border. No characters, no fake interface screenshots, no other words, no watermark. The crystal should be an abstract visual brand motif, not a fantasy landscape.
```
