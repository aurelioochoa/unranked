# Gates: Great Sage assistant

Scope: Persistent bilingual local voice and text assistant with shared validated actions, visible form drafts, configurable conversation providers, speech workers, local history and verification.

- [x] G1: Shared services enforce ownership, timing, evidence, budgets, Awakening, partial settings, confirmations and deduplication.
  CHECK: pnpm exec vitest run src/assistant/actions.test.ts
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=3d4e1e6a0c72874627565d415506acb2ec89132f339ed767f0936625f75a51bf; output-bytes=180

- [x] G2: Bilingual routing, drafts, follow-ups, ordered commands and cancellation pass regression tests.
  CHECK: pnpm exec vitest run src/assistant
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=c1d6b145202a508276996585db0a3327d3232a192df26f893cd1875cad29c766; output-bytes=191

- [x] G3: Application passes TypeScript and all existing regression tests.
  CHECK: pnpm typecheck && pnpm test
  EXPECT: Test Files
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=b58cc9449539102b3fb4905f566e41a561279d06fdaa0953156f91ca076f5cd4; output-bytes=479

- [x] G4: Production build completes with the browser workers and API routes.
  CHECK: pnpm build
  EXPECT: Route (app)
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=01f9da0fe72a0da6d4db59366bc5b1a5889662d068e2115e0044c31f47bedd0b; output-bytes=1048

- [x] G5: Persistent panel, drafts, text, keyboard and theme behavior work in desktop and mobile Chromium.
  CHECK: pnpm test:assistant:browser
  EXPECT: ASSISTANT BROWSER PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=99a3d4ca1e1a258de6b5fcf465558070c67fe5c3e994a8358580929f071cb35f; output-bytes=66

- [x] G6: Actual Needle and Whistle inference, Piper audio, interruption, denied permissions, download errors and local network behavior are verified.
  EVIDENCE: Actual Cactus/Piper inference, HTTP download failure and retry, microphone denial, AudioWorklet track shutdown, shared audio and provider cancellation tests passed. Desktop capture-to-playback roundtrips and tap interruption also passed. Measured outputs and harness paths are recorded in docs/assistant/VERIFICATION.md; Chromium engine runs had only explicit weight-download network requests. Physical acoustic interruption remains part of G7.

- [ ] G7: Android Chrome and iPhone Safari/PWA warm voice latency and microphone lifecycle are measured on real devices.
  EVIDENCE: pending

ABANDON: G7 Physical Android and iPhone devices are not attached. WebKit could not launch because this Linux host lacks libicu74, libxml2 and libflite1. Device microphone-to-speaker latency and acoustic/background lifecycle require those devices; see VERIFICATION.md.

- [x] G8: Assistant client/server and local audio boundaries satisfy the architecture checks.
  CHECK: pnpm check:assistant:architecture && make boundaries
  EXPECT: ASSISTANT ARCHITECTURE PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/home/aurelio/Repos/unranked; path=6fc69862187a/32 entries; EXPECT=matched; output-sha256=bc77b662353ea6cca00912b017f06eac13d5c9c2d2f09f5a5488dc13eee57d78; output-bytes=252
