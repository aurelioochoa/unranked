# Gates: immersive app upgrade

OWNS: src/ui/HunterCore.tsx, src/ui/Experience.tsx, src/ui/QuestSubmit.tsx, src/ui/experience.css, src/ui/QuestCard.tsx, src/app/(system)/page.tsx, src/app/(system)/layout.tsx, src/app/globals.css, GATES.md

Scope: Improve the existing RPG dashboard with interactive 3D, optional sound effects, daily priorities and accessible responsive interactions.

- [x] G1: Changed application code passes TypeScript and existing regression tests.
  CHECK: node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run
  EXPECT: Test Files.*passed
  EVIDENCE: Direct execution of CHECK via exec_command, bash, cwd=/home/aurelio/Repos/unranked, exit=0, EXPECT=matched: 18 test files and 333 tests passed, 2026-09-10 04:55:47. Gate runner's nested supervisor captured no output; this evidence comes from the direct command, not that runner. Final output chunk saved at /tmp/unranked-test-output.log; SHA-256=86516b09dd847534aa4b7b25d5825bb6ee90284ce900f41e8122902c58fa5357.

- [x] G2: Dashboard presents real hunter and quest data with a theme-aware interactive 3D core on desktop and mobile.
  EVIDENCE: Chromium checked 1440px desktop and 390px/320px mobile, all seven theme palettes, no horizontal overflow and zero page errors. Visually reviewed /tmp/unranked-desktop.png, /tmp/unranked-mobile-390.png and /tmp/unranked-parchment.png. Real isolated SQLite hunter and quest data rendered; confirmed server quest clear. Browser harness: /tmp/unranked-browser-full.mjs, exit=0, BROWSER PASS.

- [x] G3: Sound is opt-in and persists; quest completion has pending, failure and confirmed-success feedback; reduced motion and keyboard controls remain usable.
  EVIDENCE: Chromium assertions passed for default silence, opt-in oscillator scheduling, reload persistence, mute, pending disabled button, injected HTTP 500 with inline error and no success cue, retry with persisted completion and success chord, frozen canvas under pause and reduced motion, resumed canvas animation. Supplemental keyboard check passed Enter/Space activation and visible focus. Scripts /tmp/unranked-browser-full.mjs and /tmp/unranked-browser.mjs exited 0.
