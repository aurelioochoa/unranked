# Great Sage

Great Sage is available from the floating button on every page, including Awakening. Text works immediately. Listening starts only after a tap, and microphone samples stay inside the browser. Text history and preferences live in this installation's SQLite database. Clear history removes conversation text; action receipts remain for safe retries. No microphone recording is saved.

Open Sage → Settings. The default conversation provider is local Ollama `qwen3.5:4b`, with thinking disabled. Run `ollama pull qwen3.5:4b` if it is absent. The endpoint is reached by the app server. WebLLM is a browser alternative requiring WebGPU and an explicit model download. Claude and OpenAI are optional paid API integrations and are never selected automatically. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on the server; `AI_API_KEY` remains a fallback. The keys never appear in browser responses. Each provider retains its own model and endpoint settings. A connection test sends a short prompt to the selected provider.

Download Needle and Whistle explicitly (approximately 51 MB), then download the selected Piper voices. Browser caches hold speech models; Piper uses the origin private file system. Downloads require an internet connection. Inference uses local workers and local WASM runtimes. Unsupported speech hardware leaves text usable. HTTPS or localhost is required for microphone access. Hands-free listening ends when the panel closes, the page becomes hidden, or End conversation is pressed. User speech interrupts generation and playback. Executed mutations remain in their receipt log.

The speech engines are independent of the conversation provider. Needle performs structured extraction for commands outside the conservative bilingual grammar; uncertain, suppressed, malformed, or ambiguous calls ask for clarification. The conversational model explains state and handles general conversation, but cannot execute mutations or claim success on its own. Whistle streaming partials appear as transcripts; only finalized utterances reach the command executor. Speech recognition can mishear names or short phrases; use full titles or text when clarification is needed.

Examples:

- `open settings` / `abre ajustes`
- `complete quest Read a chapter` / `completar misión Read a chapter` (use an existing full quest title)
- `fill dungeon Write report for 25 minutes mind` / `prepara mazmorra Write report por 25 minutos mente`
- Edit the visible fields, then say `start` / `iniciar`.
- `fill set my name to Aurelio`, then `save` / `guardar`.
- `allocate 2 points to strength` / `asignar 2 puntos a fuerza`
- `clear dungeon`, `flee dungeon`, `rebuild ledger`
- `accept awakening` prepares final acceptance from the current form; review the displayed answers before confirming.

Fleeing, point allocation and final Awakening require confirmation. Only exact affirmative responses such as `confirm`, `yes`, or `sí` confirm a pending request. `cancel` or `cancelar` cancels it. Confirmations expire after two minutes. Ordered mutation batches stop at their first failure. If a response is lost, Check / retry last action uses the same request ID to recover its receipt without repeating completed actions.

All buttons and assistant mutations use `src/server/appServices.ts`. Ownership, Awakening prerequisites, dungeon clocks, evidence requirements and allocation budgets are enforced there and in the domain repositories. New mutation routes enforce same-origin requests, schema validation and a 64 KB body limit. This remains the app's existing single-hunter deployment; it does not introduce multi-user authentication.

`pnpm dev` and `pnpm build` prepare local Piper/ONNX assets from installed packages. The production script uses Next's supported webpack option because the installed Turbopack version fails on the existing Cormorant Google font URL generation. Cactus's browser WASM runtime is vendored in `public/assistant`, version 3.1.0, with Apache-2.0 license. It has no Python telemetry wrapper; its worker sets `NEEDLE_TELEMETRY=0` and `DO_NOT_TRACK=1`. The model cards are [Needle 3](https://huggingface.co/Cactus-Compute/needle3) and [Whistle](https://huggingface.co/Cactus-Compute/whistle). The C API header is included beside the runtime.

Piper's browser adapter uses [piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web) 1.0.5, local ONNX 1.30.0 and Piper phonemizer WASM 1.0.0. It validates downloads before caching them rather than relying on the upstream unchecked HTTP path. The curated voices are LJ Speech high (public domain), Ald medium (Unlicense), Alba medium (CC BY 4.0, attribution shown in the picker), and Davefx medium (CC0). Model card links and attribution are in `src/voice/piperVoices.ts`. Ryan and other noncommercial-only assets are excluded. English defaults to LJ Speech and Spanish to Ald. Voice speed changes playback rate, which also affects pitch.

Verification commands: `pnpm typecheck`, `pnpm test`, `node scripts/check-assistant-architecture.mjs`, `pnpm build`. See [verification record](VERIFICATION.md) for actual browser/inference measurements and remaining device checks. Optional provider pricing: [Claude](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI](https://developers.openai.com/api/docs/pricing). OpenAI streaming is based on [official OpenAI documentation](https://developers.openai.com/api/docs/guides/streaming-responses) through the installed AI SDK adapter.
