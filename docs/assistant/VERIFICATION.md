# Verification record

Tested in this Linux workspace on 2026-10-13. The application database used for browser checks was isolated under `/tmp`; existing hunter data was not used for mutations.

The automated regression suite covers shared services, typed action batches, ownership, record freshness, quest deadlines, server dungeon clocks, required evidence, stat budgets, confirmation expiry and cancellation, request deduplication, ordered failure handling, Awakening validation, omitted settings fields, bilingual commands, drafts, follow-ups, local storage ownership, context bounds, worker failures, long speech and queued hands-free utterance separation, provider streaming and cancellation. Cloud adapters and WebLLM have mocked contract tests; these do not demonstrate live cloud credentials or real WebGPU inference.

`pnpm typecheck`, `pnpm test` (405 passing tests), `pnpm check:assistant:architecture` `make boundaries` and `pnpm build` passed. The production build uses webpack because the installed Next/Turbopack Google-font loader fails on the existing Cormorant font URLs. The unrelated invalid `HUNTER_ID` route export in `/api/narrate` was also removed so Next's route type checks pass.

`pnpm test:assistant:browser` starts its own production server and temporary SQLite database. It verified persistent panel availability across Awakening and System routes; visible name and dungeon drafts; unsaved drafts; edits before assistant submission; final Awakening confirmation; server timer rejection; flee cancellation; partial settings form save; microphone model readiness errors; local history persistence and deletion; Enter/Escape controls; and no page errors or horizontal overflow at 1440, 390 and 320 pixels. All seven registered theme palettes were exercised. Screenshots from the initial desktop and mobile checks are `/tmp/sage-desktop.png` and `/tmp/sage-mobile.png`.

Actual browser speech inference used the pinned Cactus runtime and real model weights, plus the actual Piper ONNX models. Local fixture servers/intercepts served previously downloaded upstream weights to make runs deterministic and keep large assets out of the repository. These were engine tests, not mocked transcription or synthesis. A separate live browser fetch verified the upstream model configuration. Downloads with HTTP 503/502 failures were also tested through the settings UI, including speech-model retry. Denied microphone permission showed an actionable error and retained text interaction.

Measured on desktop Chromium (initial full Chrome build at `/home/aurelio/.cache/ms-playwright/chromium-1234`, later production tests using the project Playwright Chromium build):

| Measurement | Observed |
| --- | --- |
| Needle, compact catalogue first routing call | 10.65 seconds including catalogue setup |
| Needle, subsequent dungeon extraction | 1.78 seconds |
| Needle, subsequent Spanish stat extraction | 1.30 seconds |
| Needle, subsequent ledger routing | 0.77 seconds |
| Piper LJ Speech English warm synthesis | 2.80 seconds for a 1.09-second phrase |
| Piper Ald Spanish warm synthesis | 3.28 seconds for a 1.30-second phrase |
| Whistle English streaming + finalization | 0.35 seconds |
| Whistle Spanish streaming + finalization | 0.58 seconds |
| Live local Ollama qwen3.5:4b first streamed response event | 2.43 seconds including the HTTP request |
| Live local Ollama full short Spanish answer | 2.83 seconds |
| Desktop full voice command, capture start to Piper playback (cold) | 8.42 seconds |
| Desktop full voice command, capture start to Piper playback (warm) | 5.39 seconds |

The component measurements are individual samples. The desktop full voice test used a synthetic Piper phrase through Chromium’s actual fake microphone file input, then AudioWorklet → Whistle → command routing → navigation → Piper playback. The cold and warm capture-to-playback times include the approximately 1.1-second input phrase and silence finalization. This tests the full desktop software path, not physical acoustic latency. English synthesized `Open settings.` transcribed as `Open settings.`. Spanish `Abre ajustes.` initially transcribed as `Abre ages.`; app vocabulary hints improved it to `¡Abret ajustes!`, still imperfect. A later Chromium run with hints transcribed both phrases correctly (`open settings.` and `abre ajustes.`). This is why uncertain Needle calls are clarified and full titles/text remain available. The compact schemas produced structured calls for both languages, but the confidence head often returned low scores, which the application deliberately declines to execute outside its conservative grammar.

Network capture during cached synthesis/transcription observed only the two explicitly requested Cactus weight downloads. Inference itself made no unexpected external requests. Piper phonemizer and ONNX runtimes were served from the app; voice models used OPFS. The Cactus browser runtime is independent of the Python telemetry wrapper and no telemetry endpoint was contacted.

An actual AudioWorklet session with Chromium's fake microphone device observed a live MediaStream track, then an ended track after stopping. A tap-to-talk interruption during playback also stopped shared audio; later roundtrips under simultaneous build/test load measured 6.51–6.66 seconds warm, showing that these are samples rather than a latency guarantee. Shared-audio ownership and response cancellation were exercised in regression tests. Actual Piper output was decoded into nonempty AudioBuffers in both languages; no physical speaker/headphone fidelity test was available. Additional local harnesses are `/tmp/sage-speech-verify.mjs`, `/tmp/sage-full-needle.mjs`, `/tmp/sage-microphone-test.mjs`, `/tmp/sage-failures.mjs`, `/tmp/sage-ollama.mjs` and `/tmp/sage-voice-roundtrip.mjs`. The full voice roundtrip passed after the synthetic microphone file was converted to Chromium’s supported input format; the earlier unsupported fixture produced a microphone start error and is not counted as a pass.

Remaining device verification: physical Android Chrome and iPhone Safari/PWA, hands-free acoustic echo and barge-in, background/resume behavior, and complete warm voice-response latency on those devices. No physical phones are attached to this environment. A WebKit launch was attempted, but the Linux host lacks `libicu74`, `libxml2` and `libflite1`; that run did not start and is not counted as a Safari pass. Live Claude/OpenAI requests and a real WebGPU model download were not exercised. Server credential handling, explicit provider selection, and cancellation contracts passed automated tests.
