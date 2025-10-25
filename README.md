# AI Phishing Shield

Table of contents
- [Project overview (short)](#project-overview-short)
- [Hackathon submission (detailed description)](#hackathon-submission-detailed-description)
- [How it works — high level architecture](#how-it-works---high-level-architecture)
- [Key directories (what's where)](#key-directories-whats-where)
- [Releases & large artifacts](#releases--large-artifacts)
- [Monorepo integration and how pieces fit together](#monorepo-integration-and-how-pieces-fit-together)
- [Scripts you will use (developer shortcuts)](#scripts-you-will-use-developer-shortcuts)
- [Other READMEs and documentation](#other-readmes-and-documentation)
- [Offline-first design — end-to-end breakdown](#offline-first-design---end-to-end-breakdown)
- [Key features and highlights](#key-features-and-highlights)
- [Run the backend (server) locally](#run-the-backend-server-locally)
- [Run the mobile app (Expo) locally](#run-the-mobile-app-expo-locally)
- [Screenshots & demo](#screenshots--demo-placeholders)
- [Contributing, testing and release notes](#contributing-testing-and-release-notes)
- [License & contact](#license--contact)


## Project overview (short)
AI Phishing Shield is an end-to-end monorepo that implements an AI-powered phishing detection system optimized for low-end mobile devices and unreliable networks common in many African markets. The project includes:
- a mobile front-end (Expo/React Native),
- a TypeScript/Node backend (Fastify) with a lightweight API and queueing logic,
- model inference tooling (Python wrapper and a packaged TFLite model),
- a dataset repository for multilingual phishing SMS & messages,
- utilities, docs and CI-friendly build scripts.

Public backend: https://ai-phishing-shield.onrender.com/


## Hackathon submission (detailed description)
(Use this when you need to paste a concise but complete submission paragraph for a hackathon form field like: "Describe the problem you are solving, your solution, the technologies and the business case:")

Problem we are solving

Mobile money and SMS-based communications are critical in many African markets, but users on low-end phones and unreliable networks are increasingly targeted by multilingual, culturally-specialized phishing attacks. Existing defenses typically require modern devices, steady connectivity, or language-specific models, leaving many users unprotected.

Our solution

AI Phishing Shield detects phishing attempts in SMS and short message channels on-device or near-device using a compact, multilingual model and a hybrid offline-first architecture. The system combines:
- a lightweight on-device TFLite model and fast heuristics for immediate local verdicts,
- a durable local queue for message processing and temporary storage while offline,
- optional background synchronization and server-side enrichment when connectivity returns,
- multilingual support across Swahili, Yoruba, Amharic, Arabic, French, Hausa and more.

Technologies used

- Mobile: React Native (Expo) for the user interface and local storage, optimized assets and a robust splash/UX.
- Model & inference: TensorFlow Lite for compact on-device inference, a Python inference wrapper for CI/dev and packaging, and language-rule heuristics for improved recall/precision.
- Backend: Fastify (TypeScript), Prisma (SQLite for local dev), BullMQ/ioredis for queueing (optional), and endpoint routes for submission, metrics, and config.
- Data & tooling: multilingual datasets (CSV/JSON), notebook training artifacts, and scripts to convert and package models.

Business case

The product targets mobile money ecosystems and financial services providers. Revenue channels include:
- Telecom integration (network-level filtering and notification),
- B2B SaaS for banks and mobile-money providers,
- Consumer freemium and premium offerings,
- Government or enterprise contracts for national-level phishing protection.
The product is designed for low friction integration and deployment (APK distribution or network-level deployment), and built for resource-constrained devices.


## How it works — high level architecture
- Mobile device receives messages (SMS/WhatsApp). Each message is run through a small local TFLite model plus lightweight heuristic rules.
- If the message is flagged, the app shows an inline warning and optionally queues the message for server upload when the device is online (deferred sync).
- The local queue is durable (persisted to local storage) so messages survive restarts and network outages.
- When connectivity is (re-)established, the client uploads queued items to the backend `outbox` endpoint which persists them and enqueues server-side processing if Redis is configured.
- The backend keeps optional audit logs, metrics and supports token-based auth. The backend also exposes endpoints for config, model update checks and metrics.
- Model packaging: training and conversion notebooks produce the final `phishing_detector_package` (TFLite + tokenizer + model-metadata) which is too large to check into Git; these artifacts are published to Releases.


## Key directories (what's where)
Below are important folders with short explanations. Refer to these when navigating the repo.

- `app/` — Frontend router pages and UI screens (Expo + React Native using `expo-router`).
- `assets/` — App images, icons and splash images (we use `assets/ai-phishing-shield-logo.png` for splash).
- `components/` — Reusable UI components shared across screens.
- `server/` — The backend service (TypeScript/Fastify). Contains `src/`, `prisma/`, and build config. See `server/README.md` (if present) for server-specific docs.
- `dataset/` — Raw datasets, CSVs and dataset-level README files used for training and evaluation.
- `data/processed/` — Processed datasets ready for training (train/validation/test splits and master dataset). See `data/processed/dataset_statistics.json` for stats.
- `phishing_dataset/` — Per-language curated phishing datasets; used as curated training sources.
- `model-inference/` — Placeholder for inference tooling / package used for native inference and testing.
- `phishing_detector_package/` — Packaged TFLite model artifacts (not checked in due to size). Download from the GitHub Releases page (see below).
- `notebooks/` — Jupyter notebooks used to train, evaluate and convert models (e.g., `train_and_convert.ipynb`).
- `lib/` — Shared libraries and utilities used by the app and server.
- `locales/` — Translations and localized strings used across the app.
- `mobile/` or `inference/` — (formerly `mobile`) contains the Python inference wrapper and rule files used for model packaging and CI smoke tests. Consider renaming to `inference/` for clarity.


## Releases & large artifacts
The packaged TFLite model and large artifacts (~900+ MB) are not stored in the repository. Instead they are published on the GitHub Releases page for this project. Use the Releases page to download:
- prebuilt APKs (when present),
- `phishing_detector_package` containing the TFLite model, tokenizer, and model metadata,
- other large artifacts.

Why not checked in: The TFLite artifacts are large and would blow up the repo; Releases provides a clean distribution channel.


## Monorepo integration and how pieces fit together
This repository is organized as a monorepo so the mobile app, backend and model tooling can be developed and released together. Integration points include:
- The Android build copies rule files and model assets from the `phishing_detector_package` and `mobile/inference_wrapper` into `android/app/src/main/assets` at build time (see `android/app/build.gradle`).
- The backend `outbox` endpoint receives queued messages from clients and persists them using Prisma; optional Redis/BullMQ handles durable processing.
- Notebooks in `notebooks/` produce converted artifacts which are packaged and uploaded to Releases. The mobile app and backend can fetch updated models from a model registry URL configured in `app.json` (see `expo.extra.modelRegistryUrl`).


## Scripts you will use (developer shortcuts)
A non-exhaustive list (see `package.json` files for exact commands):

- Root workspace (common tasks)
  - `pnpm install` — install all workspace packages (uses pnpm workspace).

- Server (from `server/`)
  - `pnpm run dev` — start server in dev mode (tsx/ts-node) with dotenv-flow.
  - `pnpm run build` — compile TypeScript to `dist/`.
  - `pnpm run start` — run the compiled server via `node dist/index.js`.
  - `scripts/prisma-connect.ts` — helper script to validate Prisma connectivity.

- Mobile / Expo
  - `npx expo start` — start Metro and Expo dev server.
  - `eas build` — for EAS builds (if configured).

- Model packaging
  - Notebooks under `notebooks/` include training and conversion steps.
  - Python wrapper `mobile/inference_wrapper` has `requirements.txt` and smoke test scripts (use a virtual environment and `pip install -r requirements.txt`).


## Other READMEs and documentation
We maintain several focused docs inside the repo — consult them for deep dives:
- `notebooks/` — training / conversion notebooks.
- `docs/` — architecture sketches and process docs (see `docs/architecture/`).
- `server/README.md` — server-specific runbook (if present) — contains details on environment variables, Prisma, and production notes.
- `mobile/inference_wrapper/README.md` — explains model packaging and the Python inference wrapper.
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
- Small-footprint model optimized for basic smartphones
- Auditing and metrics on the backend for analysis and model improvement
- Optional background worker using Redis/BullMQ for scalable processing
- Export-ready artifacts: packaged TFLite model released on GitHub Releases
- Fast API (Fastify) with simple endpoints: `/v1/outbox`, `/v1/health`, `/v1/config`, `/v1/tokens` etc.


## Run the backend (server) locally
Quick start (development):

1. Install dependencies (from repo root):

```bash
pnpm install
```

2. Configure local env (recommended):

- Copy `server/.env.example` to `server/.env.development.local` and edit values.
- For local dev we use a SQLite file by default in `server/prisma/dev.db`. Ensure `DATABASE_URL` is set to `file:./prisma/dev.db`.

3. Build & run (recommended to test compiled output):

```bash
cd server
pnpm run build
NODE_ENV=development LOG_LEVEL=debug node dist/index.js
```

4. For rapid dev with live reload (tsx):

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

2. Open on device (Expo Go) or emulator. The splash screen background color is set to `#2563eb` and uses `assets/ai-phishing-shield-logo.png`.

3. For native builds (Android/iOS), follow `eas build` / prebuild steps. Android Gradle copies model/rules into `android/app/src/main/assets` at build time.


## Screenshots & demo (placeholders)
- App splash and home screen: `https://placeholder.example.com/screenshot-splash.png`
- Inbox & warning flow: `https://placeholder.example.com/screenshot-inbox.png`
- Demo video (placeholder): `https://placeholder.example.com/demo.mp4`

(Replace placeholders with real URLs when you have screenshots or videos.)


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


## License & contact
- License: choose your preferred open-source license and add it to `LICENSE` at repo root.
- Contact: Basit Balogun (see repo owner profile) — for partnership or questions.


---

If you'd like, I can also:
- add example `curl` or `httpie` requests for key endpoints (outbox/health),
- add screenshots to the repo and update the placeholders,
- create a shorter `server/README.md` focused only on backend run/debug steps.


Thank you — this README is intended to be both a polished project front page and a developer runbook. Tell me if you'd like reorganized sections, additional technical diagrams, or a condensed one-page summary for judges.