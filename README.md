# Hook: Your AI Phishing Shield

Table of contents

- [Project overview](#project-overview)
- [Detailed Description](#detailed-description)
- [How it works — high level architecture](#how-it-works-high-level-architecture)
- [Key directories (what's where)](#key-directories-whats-where)
- [Releases & large artifacts](#releases-and-large-artifacts)
- [Monorepo integration and how pieces fit together](#monorepo-integration-and-how-pieces-fit-together)
- [Scripts you will use (developer shortcuts)](#scripts-you-will-use-developer-shortcuts)
- [Other READMEs and documentation](#other-readmes-and-documentation)
- [Offline-first design — end-to-end breakdown](#offline-first-design-end-to-end-breakdown)
- [Key features and highlights](#key-features-and-highlights)
- [Run the backend (server) locally](#run-the-backend-server-locally)
- [Run the mobile app (Expo) locally](#run-the-mobile-app-expo-locally)
- [Contributing, testing and release notes](#contributing-testing-and-release-notes)

## Project overview

Hook is an end-to-end monorepo that implements an AI-powered phishing detection system targeting mobile and near-device deployments where connectivity is intermittent. The project includes:

- a mobile front-end (Expo/React Native)
- a TypeScript/Node backend (Fastify) with a lightweight API and queueing logic
- model inference tooling (Python wrapper and a packaged TFLite model)
- a dataset repository for multilingual phishing SMS & messages (real + synthetic)
- utilities, docs and CI-friendly build scripts

## Detailed Description

Problem we are solving

Mobile money and SMS-based communications are critical in many African markets, but users on low-end phones and unreliable networks are increasingly targeted by multilingual, culturally-specialized phishing attacks. Existing defenses typically require modern devices, steady connectivity, or language-specific models, leaving many users unprotected.

Our solution

Hook detects phishing attempts in SMS and short message channels on-device or near-device using a hybrid model + heuristic approach and a hybrid offline-first architecture. The runtime combines:

- an on-device TFLite model (packaged variants) plus lightweight heuristic rules for immediate local verdicts. The packaged TFLite artifacts and tokenizer are documented under `phishing_detector_package/` (see "Releases & large artifacts")
- a durable local queue for message processing and temporary storage while offline
- optional background synchronization and server-side enrichment when connectivity returns
- multilingual support across Swahili, Yoruba, Amharic, Arabic, French, Hausa and others (the training language list is available in `phishing_detector_package/model-metadata.json`)

Technologies used

- Mobile: React Native (Expo) for the user interface and local storage, optimized assets and a robust splash/UX
- Model & inference: TensorFlow Lite for compact on-device inference, a Python inference wrapper for CI/dev and packaging, and language-rule heuristics for improved recall/precision
- Backend: Fastify (TypeScript), Prisma (SQLite for local dev), BullMQ/ioredis for queueing (optional), and endpoint routes for submission, metrics, and config
- Data & tooling: multilingual datasets (CSV/JSON), notebook training artifacts, and scripts to convert and package models

Business case

The product targets mobile money ecosystems and financial services providers. Revenue channels include:

- Telecom integration (network-level filtering and notification)
- B2B SaaS for banks and mobile-money providers
- Consumer freemium and premium offerings
- Government or enterprise contracts for national-level phishing protection

The product is designed for low friction integration and deployment (APK distribution or network-level deployment), and built for resource-constrained devices.

## How it works — high level architecture

- Mobile device receives messages (SMS/WhatsApp). Each message is run through a small local TFLite model plus lightweight heuristic rules.
- If the message is flagged, the app shows an inline warning and optionally queues the message for server upload when the device is online (deferred sync).
- The local queue is durable (persisted to local storage) so messages survive restarts and network outages.
- When connectivity is (re-)established, the client uploads queued items to the backend `outbox` endpoint which persists them and enqueues server-side processing if Redis is configured.
- The backend keeps optional audit logs, metrics and supports token-based auth. The backend also exposes endpoints for config, model update checks and metrics.

Model packaging: training and conversion notebooks produce the final `phishing_detector_package` (TFLite + tokenizer + model-metadata). The packaged artifacts are large and are published to Releases rather than checked into the repository; see `phishing_detector_package/README.md` for a short sample evaluation and exact artifact sizes.

## Key directories (what's where)

Below are important folders with short explanations. Refer to these when navigating the repo.

- `app/` — Frontend router pages and UI screens (Expo + React Native using `expo-router`)
- `assets/` — App images, icons and splash images (we use `assets/ai-phishing-shield-logo.png` for splash)
- `components/` — Reusable UI components shared across screens
- `server/` — The backend service (TypeScript/Fastify). Contains `src/`, `prisma/`, and build config. See `server/README.md` (if present) for server-specific docs
- `dataset/` — Raw datasets, CSVs and dataset-level README files used for training and evaluation
- `data/processed/` — Processed datasets ready for training (train/validation/test splits and master dataset). See `data/processed/dataset_statistics.json` for stats
- `phishing_dataset/` — Per-language curated phishing datasets; used as curated training sources
- `model-inference/` — Inference tooling and packaging used for native inference, parity tests and CI smoke runs
- `phishing_detector_package/` — Packaged TFLite model artifacts (not checked in due to size). Download from the GitHub Releases page (see below)
- `notebooks/` — Jupyter notebooks used to train, evaluate and convert models (e.g., `train_and_convert.ipynb`)
- `lib/` — Shared libraries and utilities used by the app and server
- `locales/` — Translations and localized strings used across the app
- `mobile/` or `inference/` — (formerly `mobile`) contains the Python inference wrapper and rule files used for model packaging and CI smoke tests. Consider renaming to `inference/` for clarity.

## Releases & large artifacts

The packaged TFLite model artifacts are not stored in the repository; they are published to GitHub Releases. The current packaged artifacts (see `phishing_detector_package/README.md`) include:

- `phishing_detector.tflite` (float16) — 258.27 MB
- `phishing_detector_dynamic.tflite` (dynamic quantization) — 129.86 MB
- `phishing_detector_int8.tflite` (int8 quantized) — 129.71 MB

A short sample evaluation included with the package shows the float16 and dynamic variants performing strongly on a held sample (n=2000) while the int8 quantized variant shows lower recall on the same sample. See `phishing_detector_package/README.md` for the exact sample metrics and `notebooks/train_and_convert.ipynb` for conversion steps.

Why not checked in: The TFLite artifacts are large and would blow up the repo; Releases provides a clean distribution channel. If you need the package locally for builds, download the `phishing_detector_package` artifact and place it at the repo root (the Android Gradle prebuild tasks expect the package contents under `phishing_detector_package/` during asset copy).

### Explainability & heuristics

- Detection is intentionally explainable: the runtime returns both the model score and a set of heuristic "factors" (matches) derived from per-language rule sets. Typical heuristic signals include short-link detection, monetary/reward/account keyword matches, urgency phrases, and OTP patterns.
- The combination of model + heuristics is controlled by `heuristic_weight` and thresholds in `phishing_detector_package/model-metadata.json`. The Python wrapper used for CI and packaging is `model-inference/inference_wrapper/infer.py` and the Android native wrapper is `android/app/src/main/java/.../InferenceModule.java` — both expose the model score, heuristic matches, and a combined severity level used by the UI.

### Datasets & provenance

- The training and evaluation data is a mix of curated, public, and synthetically generated examples. A processed statistics snapshot is available at `data/processed/dataset_statistics.json` showing `total_messages: 68118`. The processed sources include a `synthetic_generator` contribution of `23400` messages (about 34% of the processed corpus). See the `phishing_dataset/` and `data/processed/` folders for per-language files and processing scripts.

### Mock-run & parity testing

- A parity / smoke harness (`model-inference/inference_wrapper/run_on_mock.py`) runs the wrapper (or a dummy wrapper) over embedded mock and benign messages to validate parity between the mobile wrapper and the Python wrapper. The CI workflow runs a lightweight parity smoke using this script (see `.github/workflows/parity-smoke.yml`). Detailed sweep commands, results and analysis are documented in `model-inference/inference_wrapper/REPORT.md`.

Example parity result (representative): with `heuristic_weight = 0.7` (our chosen default), a typical parity run on the embedded mock set produced medium→high severity for the seven phishing mock messages and safe→low for the benign samples.

For repository hygiene and to keep the README readable, the full parity JSONL outputs have been moved to an artifact file:

- Full parity JSONL: `phishing_detector_package/mock_parity_0.7.jsonl` (contains mock-1..mock-7 and benign-1..benign-5 outputs)

Representative single-line sample (from the artifact):

```json
{"id":"mock-1","score":0.99,"severity":"high","modelVersion":"v0.1.0"}
```

See `model-inference/inference_wrapper/REPORT.md` for the sweep commands and the test harness used to generate these outputs.

## Monorepo integration and how pieces fit together

This repository is organized as a monorepo so the mobile app, backend and model tooling can be developed and released together. Integration points include:

- The Android build copies rule files and model assets from the `phishing_detector_package` and `mobile/inference_wrapper` into `android/app/src/main/assets` at build time (see `android/app/build.gradle`)
- The backend `outbox` endpoint receives queued messages from clients and persists them using Prisma; optional Redis/BullMQ handles durable processing
- Notebooks in `notebooks/` produce converted artifacts which are packaged and uploaded to Releases. The mobile app and backend can fetch updated models from a model registry URL configured in `app.json` (see `expo.extra.modelRegistryUrl`)

## Scripts you will use (developer shortcuts)

A non-exhaustive list (see `package.json` files for exact commands):

- Root workspace (common tasks)
  - `pnpm install` — install all workspace packages (uses pnpm workspace)

- Server (from `server/`)
  - `pnpm run dev` — start server in dev mode (tsx/ts-node) with dotenv-flow
  - `pnpm run build` — compile TypeScript to `dist/`
  - `pnpm run start` — run the compiled server via `node dist/index.js`
  - `scripts/prisma-connect.ts` — helper script to validate Prisma connectivity

- Mobile / Expo
  - `npx expo start` — start Metro and Expo dev server
  - `eas build` — for EAS builds (if configured)

- Model packaging
  - Notebooks under `notebooks/` include training and conversion steps
  - Python wrapper `mobile/inference_wrapper` has `requirements.txt` and smoke test scripts (use a virtual environment and `pip install -r requirements.txt`)

## Other READMEs and documentation

We maintain several focused docs inside the repo — consult them for deep dives:

- `notebooks/` — training / conversion notebooks
- `docs/` — architecture sketches and process docs (see `docs/architecture/`)
- `server/README.md` — server-specific runbook (if present) — contains details on environment variables, Prisma, and production notes
- `mobile/inference_wrapper/README.md` — explains model packaging and the Python inference wrapper
- `docs/security_and_worker.md` — (referenced by offline-first section) — contains details about security, worker design and queueing. If you need deeper security/worker design, start there.

## Offline-first design — end-to-end breakdown

This is an executive summary and engineering-level flow for how we achieve offline-first behavior. See `docs/security_and_worker.md` for the security/worker reference.

1. Local detection

- Each incoming message is first passed to an on-device TFLite model and then to heuristic rules for rapid classification.
- If malicious or suspicious, the app displays an inline warning immediately.

2. Durable local queue

- Messages that require server-side processing (for audit, triage, or model feedback) are placed in a durable local queue.
- The queue is persisted to local storage (secure storage/SQLite) so that app restarts or crashes do not lose items.

3. Background processing & retry

- A background worker attempts to flush the queue when the device has connectivity. Retries use exponential backoff and are capped.
- The worker uses small payloads and supports batching to reduce network overhead.

4. Server-side ingestion & processing

- The server `outbox` endpoint persists incoming items to the database and enqueues a background job (BullMQ) if Redis is available.
- The server worker processes items (store audit, notify, or enrich) and can push updated model telemetry back to a model registry.

5. Synchronization & model updates

- Clients periodically check the configured `modelRegistryUrl` for newer models. When a new model is available and compatible, the client downloads it and replaces the local TFLite file.

Security notes

- All uploads are authenticated (token-based) and audited. Sensitive data is not logged in plain text. See `docs/security_and_worker.md` for details.

## Key features and highlights

- Multilingual phishing detection (Swahili, Yoruba, Amharic, Arabic, French, Hausa, and others)
- Offline-first operation: local TFLite inference + durable queue + smart backoff
- Model + heuristics for on-device detection (packaged TFLite variants; see "Releases & large artifacts" for sizes and trade-offs)
- Auditing and metrics on the backend for analysis and model improvement
- Optional background worker using Redis/BullMQ for scalable processing
- Export-ready artifacts: packaged TFLite model released on GitHub Releases
- Fast API (Fastify) with simple endpoints: `/v1/outbox`, `/v1/health`, `/v1/config`, `/v1/tokens` etc.

## Run the backend (server) locally

Quick start (development):

1. Install dependencies (from repo root):

```bash
pnpm install
````

2. Configure local env (recommended):

- Copy `server/.env.example` to `server/.env.development.local` and edit values.
- For local dev we use a SQLite file by default in `server/prisma/dev.db`. Ensure `DATABASE_URL` is set to `file:./prisma/dev.db`.

1. Build & run (recommended to test compiled output):

```bash
cd server
pnpm run build
NODE_ENV=development LOG_LEVEL=debug node dist/index.js
```

1. For rapid dev with live reload (tsx):

```bash
cd server
NODE_ENV=development LOG_LEVEL=debug pnpm exec -- tsx -r dotenv-flow/config src/index.ts
```

Notes

- If using Redis/BullMQ, set `REDIS_URL` in the env. The queue initialization is guarded so the server will start even if Redis is not present.
- Ensure `prisma generate` is run before building in CI. Add `npx prisma generate` to your CI/build step or move `prisma` into `dependencies` so `postinstall` runs in production.

## Run the mobile app (Expo) locally

1. From repo root:

```bash
pnpm install
npx expo start
```

1. Open on device (Expo Go) or emulator. The splash screen background color is set to `#2563eb` and uses `assets/ai-phishing-shield-logo.png`.

1. For native builds (Android/iOS), follow `eas build` / prebuild steps. Android Gradle copies model/rules into `android/app/src/main/assets` at build time.

<!-- Screenshots & demo removed from this README. Add verified screenshots to `assets/` and update this file if/when you have stable images or videos to link. -->

## Contributing, testing and release notes

- Please follow the monorepo conventions (pnpm workspace). Run `pnpm install` at the root.
- Unit & integration tests live alongside code. Run test scripts defined in each `package.json`.
- Releases: packaged model artifacts and large binaries are placed in the GitHub Releases page. Tag a release and upload the `phishing_detector_package` artifact.

Release checklist (recommended):

- Run notebooks to rebuild & convert the model in `notebooks/`.
- Run Python smoke tests under `mobile/inference_wrapper`.
- Build Android artifacts and ensure `preBuild` tasks copy model/rules into assets.
- Publish release on GitHub and attach the `phishing_detector_package` (TFLite + tokenizer + metadata) and optional APK.

## Troubleshooting & FAQs

- Q: Prisma fails with `P1012` complaining about URL protocol?
  - A: The Prisma schema is configured for SQLite in dev. Ensure `DATABASE_URL` starts with `file:` for local dev (e.g. `file:./prisma/dev.db`).

- Q: Server crashes because `@prisma/client` missing in CI?
  - A: Make sure `prisma generate` runs during CI (e.g. `npx prisma generate`) or move `prisma` to `dependencies` to enable `postinstall` in production.

- Q: Model artifacts are missing during Android build?
  - A: Confirm `phishing_detector_package` is downloaded to the repo root or placed in a path expected by `android/app/build.gradle` before running `./gradlew assembleDebug`.

## Vision & next steps

Our guiding goal is to make a verifiable, privacy-preserving phishing detection tool that works on resource-constrained devices and in intermittent networks. The README now only contains file-backed claims; below are pragmatic next steps we plan to execute and verify using repository artifacts:

- Model distribution & trade-offs: continue publishing multiple TFLite variants (float16, dynamic, int8) and keep `phishing_detector_package/README.md` updated with sizes and sample evaluation metrics so integrators can choose the right tradeoff.
- Rule refinement & explainability: expand per-language rule sets used by the inference wrappers (see `model-inference/inference_wrapper/rules/`) and keep `model-metadata.json` authoritative for `heuristic_weight` and severity thresholds.
- Parity & CI: keep `model-inference/inference_wrapper/run_on_mock.py` and `.github/workflows/parity-smoke.yml` active to validate parity between the Python wrapper and native/mobile wrappers; publish concise sweep artifacts to `artifacts/` in CI for audits.
- Safe model updates on-device: implement atomic model swaps and metadata-driven compatibility checks (clients should read `model-metadata.json` before replacing local artifacts).
- Backend stability: ensure `prisma generate` runs in CI, guard BullMQ/Redis startup behind `REDIS_URL`, and add integration tests that exercise key endpoints such as `/v1/outbox` and `/v1/health`.
- Documentation & examples: add a short `server/README.md` focused on running the server locally and a small `examples/` folder with curl snippets for essential endpoints, all backed by the repo's server code.

Additional high-level visions:

- iOS notification/listener strategy: iOS currently restricts background notification-listening for third-party apps. We plan to design and prototype a compatible approach (for example: a small companion service, user opt-in accessibility flows, or server-assisted detection models) so that phishing detection can be delivered to iOS users without compromising platform policies or user privacy. This will require UX exploration and possibly platform-specific engineering (entitlements, background modes, or a companion cloud-assisted flow).

- Reduce false positives and improve model intelligence: continue improving model robustness and calibration, expand evaluation on real-world, multilingual samples, run targeted adversarial and edge-case tests, and iterate on heuristics and label curation to reduce false positives while preserving recall.

- Model artifact size & efficiency: continue shrinking final model artifacts and explore quantization and architecture changes. We've already reduced distribution size by favoring the dynamic-quantized TFLite variant over the float16 variant; the int8 variant was tried but didn't match dynamic's reference quality and ended up similar in size — we'll evaluate additional options (different quantization strategies, smaller transformer variants, pruning, or distillation) to produce a substantially lighter artifact suitable for low-end devices.

If you'd like, I can now:

- add a one-line verified mock-run summary (referencing `model-inference/inference_wrapper/REPORT.md` and the run_on_mock parity harness) into this README, or
- run a markdown lint pass and fix spacing/list heading issues across the README.

Please tell me which follow-up you'd like and I'll proceed.
