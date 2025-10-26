# Hook: Your AI Phishing Shield

Table of contents

- Project overview (short)
- Hackathon submission (detailed description)
- How it works — high level architecture
- Key directories (what's where)
- Releases & large artifacts
- Monorepo integration and how pieces fit together
- Scripts you will use (developer shortcuts)
- Other READMEs and documentation
- Offline-first design — end-to-end breakdown
- Key features and highlights
- Run the backend (server) locally
- Run the mobile app (Expo) locally
- Contributing, testing and release notes

## Project overview (short)

Hook is an end-to-end monorepo that implements an AI-powered phishing detection system targeting mobile and near-device deployments where connectivity is intermittent. The project includes:

- a mobile front-end (Expo/React Native)
- a TypeScript/Node backend (Fastify) with a lightweight API and queueing logic
- model inference tooling (Python wrapper and a packaged TFLite model)
- a dataset repository for multilingual phishing SMS & messages (real + synthetic)
- utilities, docs and CI-friendly build scripts

## Hackathon submission (detailed description)

(Use this when you need to paste a concise but complete submission paragraph for a hackathon form field like: "Describe the problem you are solving, your solution, the technologies and the business case:")

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

Example parity result (representative): with `heuristic_weight = 0.7` (our chosen default), a typical parity run on the embedded mock set produced medium→high severity for the seven phishing mock messages and safe→low for the benign samples; full parity outputs are written by default to `phishing_detector_package/mock_parity.jsonl` or can be generated via the sweep commands in `REPORT.md`.

```json
{"id":"mock-1","mock_score":0.7,"wrapper_score":0.99,"score_delta":0.29,"mock_matches":[{"label":"Urgency language","excerpt":"within 24 hours","weight":0.25},{"label":"Account verification request","excerpt":"Verify your account","weight":0.2}],"wrapper_matches":[{"label":"Urgency language","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account now at http://uba-secure-check.com to avo","weight":1.0},{"label":"Link","excerpt":"http://uba-secure-check.com","weight":0.18},{"label":"Financial keyword","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2},{"label":"Account action requested","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2}],"raw_model_score":1.0,"heuristic_score":1.0,"combined_score_pre_clamp":1.0,"detection":{"score":0.99,"detectionId":"ca8c1c1d-33d9-4936-8d3e-24fb79c1e427","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":187,"message":{"messageId":"mock-1","channel":"sms","sender":"UBA Secure","receivedAt":"2025-10-08T08:15:00Z"},"matches":[{"label":"Urgency language","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account now at http://uba-secure-check.com to avo","weight":1.0},{"label":"Link","excerpt":"http://uba-secure-check.com","weight":0.18},{"label":"Financial keyword","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2},{"label":"Account action requested","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2}],"risk":{"score":0.99,"severity":"high","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Urgency language","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account now at http://uba-secure-check.com to avo","weight":1.0,"evidenceType":"keyword"},{"label":"Link","excerpt":"http://uba-secure-check.com","weight":0.18,"evidenceType":"url_reputation"},{"label":"Financial keyword","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2,"evidenceType":"keyword"},{"label":"Account action requested","excerpt":"UBA Alert: Your account will be suspended within 24 hours. Verify your account n","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"block_sender","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"http://uba-secure-check.com","domain":"uba-secure-check.com"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":1.0}},"raw_model_score":1.0,"heuristic_score":1.0,"combined_score_pre_clamp":1.0}

{"id":"mock-2","mock_score":0.45,"wrapper_score":0.6,"score_delta":0.15,"mock_matches":[{"label":"Link-based call-to-action","excerpt":"Tap this link","weight":0.2}],"wrapper_matches":[{"label":"Suspicious link","excerpt":"https://bit.ly/rebatesafrica","weight":0.25},{"label":"Reward / lottery","excerpt":"Congratulations! You qualify for a special tax rebate. Tap this link to claim wi","weight":0.18}],"raw_model_score":1.0,"heuristic_score":0.43,"combined_score_pre_clamp":0.601,"detection":{"score":0.6,"detectionId":"76a9e09c-fcda-4a0b-a4e2-64674e977112","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":208,"message":{"messageId":"mock-2","channel":"sms","sender":"Tax Grant","receivedAt":"2025-10-08T09:02:00Z"},"matches":[{"label":"Suspicious link","excerpt":"https://bit.ly/rebatesafrica","weight":0.25},{"label":"Reward / lottery","excerpt":"Congratulations! You qualify for a special tax rebate. Tap this link to claim wi","weight":0.18}],"risk":{"score":0.6,"severity":"medium","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Suspicious link","excerpt":"https://bit.ly/rebatesafrica","weight":0.25,"evidenceType":"url_reputation"},{"label":"Reward / lottery","excerpt":"Congratulations! You qualify for a special tax rebate. Tap this link to claim wi","weight":0.18,"evidenceType":"keyword"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"https://bit.ly/rebatesafrica","domain":"bit.ly"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.0}},"raw_model_score":1.0,"heuristic_score":0.43,"combined_score_pre_clamp":0.601}

{"id":"mock-3","mock_score":0.65,"wrapper_score":0.99,"score_delta":0.34,"mock_matches":[{"label":"Urgency language","excerpt":"immediately","weight":0.25},{"label":"Credential or OTP request","excerpt":"OTP","weight":0.15}],"wrapper_matches":[{"label":"Urgency language","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately via http://mtn-verify.ng and enter your ","weight":0.67},{"label":"Link","excerpt":"http://mtn-verify.ng","weight":0.18},{"label":"Account action requested","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately ","weight":0.2}],"raw_model_score":0.9994,"heuristic_score":1.0,"combined_score_pre_clamp":0.9998,"detection":{"score":0.99,"detectionId":"6248aa9c-718c-44c3-864d-a6cb1799c0e7","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":193,"message":{"messageId":"mock-3","channel":"sms","sender":"MTN Nigeria","receivedAt":"2025-10-08T09:45:00Z"},"matches":[{"label":"Urgency language","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately via http://mtn-verify.ng and enter your ","weight":0.67},{"label":"Link","excerpt":"http://mtn-verify.ng","weight":0.18},{"label":"Account action requested","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately ","weight":0.2}],"risk":{"score":0.99,"severity":"high","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Urgency language","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately via http://mtn-verify.ng and enter your ","weight":0.67,"evidenceType":"keyword"},{"label":"Link","excerpt":"http://mtn-verify.ng","weight":0.18,"evidenceType":"url_reputation"},{"label":"Account action requested","excerpt":"Dear customer, your SIM will be deactivated today. Confirm your NIN immediately ","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"block_sender","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"http://mtn-verify.ng","domain":"mtn-verify.ng"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.67}},"raw_model_score":0.9994,"heuristic_score":1.0,"combined_score_pre_clamp":0.9998}

{"id":"mock-4","mock_score":0.6,"wrapper_score":0.81,"score_delta":0.21,"mock_matches":[{"label":"Link-based call-to-action","excerpt":"Click the link","weight":0.2},{"label":"Financial institution reference","excerpt":"bank","weight":0.1},{"label":"Credential or OTP request","excerpt":"PIN","weight":0.15}],"wrapper_matches":[{"label":"Urgency language","excerpt":"We need you to update your payroll information before salaries are processed. Click the link and input your banking PIN ","weight":0.33},{"label":"Financial keyword","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2},{"label":"Account action requested","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2}],"raw_model_score":0.999,"heuristic_score":0.73,"combined_score_pre_clamp":0.8107,"detection":{"score":0.81,"detectionId":"0b3512e4-aa64-474d-99cf-c2f65e780c81","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":186,"message":{"messageId":"mock-4","channel":"email","sender":"HR Payroll","receivedAt":"2025-10-08T10:15:00Z"},"matches":[{"label":"Urgency language","excerpt":"We need you to update your payroll information before salaries are processed. Click the link and input your banking PIN ","weight":0.33},{"label":"Financial keyword","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2},{"label":"Account action requested","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2}],"risk":{"score":0.81,"severity":"high","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Urgency language","excerpt":"We need you to update your payroll information before salaries are processed. Click the link and input your banking PIN ","weight":0.33,"evidenceType":"keyword"},{"label":"Financial keyword","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2,"evidenceType":"keyword"},{"label":"Account action requested","excerpt":"We need you to update your payroll information before salaries are processed. Cl","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"block_sender","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.33}},"raw_model_score":0.999,"heuristic_score":0.73,"combined_score_pre_clamp":0.8107}

{"id":"mock-5","mock_score":0.68,"wrapper_score":0.78,"score_delta":0.1,"mock_matches":[{"label":"Urgency language","excerpt":"Act now","weight":0.25},{"label":"Unexpected reward","excerpt":"Reward","weight":0.18}],"wrapper_matches":[{"label":"Urgency language","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize code: http://airtel-bonus.win","weight":0.33},{"label":"Link","excerpt":"http://airtel-bonus.win","weight":0.18},{"label":"Reward / lottery","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize ","weight":0.18}],"raw_model_score":0.9982,"heuristic_score":0.69,"combined_score_pre_clamp":0.7825,"detection":{"score":0.78,"detectionId":"109ea7ac-96cf-4a33-9b5a-5e0905914cb7","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":187,"message":{"messageId":"mock-5","channel":"sms","sender":"Airtel Rewards","receivedAt":"2025-10-08T11:00:00Z"},"matches":[{"label":"Urgency language","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize code: http://airtel-bonus.win","weight":0.33},{"label":"Link","excerpt":"http://airtel-bonus.win","weight":0.18},{"label":"Reward / lottery","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize ","weight":0.18}],"risk":{"score":0.78,"severity":"medium","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Urgency language","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize code: http://airtel-bonus.win","weight":0.33,"evidenceType":"keyword"},{"label":"Link","excerpt":"http://airtel-bonus.win","weight":0.18,"evidenceType":"url_reputation"},{"label":"Reward / lottery","excerpt":"You have been selected for an Airtel Rewards gift. Act now and claim your prize ","weight":0.18,"evidenceType":"keyword"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"http://airtel-bonus.win","domain":"airtel-bonus.win"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.33}},"raw_model_score":0.9982,"heuristic_score":0.69,"combined_score_pre_clamp":0.7825}

{"id":"mock-6","mock_score":0.55,"wrapper_score":0.58,"score_delta":0.03,"mock_matches":[{"label":"Account verification request","excerpt":"Confirm your account","weight":0.2},{"label":"Credential or OTP request","excerpt":"OTP","weight":0.15}],"wrapper_matches":[{"label":"Financial keyword","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2},{"label":"Account action requested","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2}],"raw_model_score":1.0,"heuristic_score":0.4,"combined_score_pre_clamp":0.58,"detection":{"score":0.58,"detectionId":"2d854d8a-57e1-46a4-b330-c91f27a2ef98","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:42","latencyMs":186,"message":{"messageId":"mock-6","channel":"whatsapp","sender":"WhatsApp Support","receivedAt":"2025-10-08T11:30:00Z"},"matches":[{"label":"Financial keyword","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2},{"label":"Account action requested","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2}],"risk":{"score":0.58,"severity":"low","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Financial keyword","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2,"evidenceType":"keyword"},{"label":"Account action requested","excerpt":"WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.0}},"raw_model_score":1.0,"heuristic_score":0.4,"combined_score_pre_clamp":0.58}

{"id":"mock-7","mock_score":0.5,"wrapper_score":0.94,"score_delta":0.44,"mock_matches":[{"label":"Urgency language","excerpt":"immediately","weight":0.25}],"wrapper_matches":[{"label":"Urgency language","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this secure portal: http://stanbic-review.info","weight":0.33},{"label":"Link","excerpt":"http://stanbic-review.info","weight":0.18},{"label":"Financial keyword","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2},{"label":"Account action requested","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2}],"raw_model_score":0.999,"heuristic_score":0.91,"combined_score_pre_clamp":0.9367,"detection":{"score":0.94,"detectionId":"1bb47782-496f-4167-aae2-822daf8f6ee8","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:43","latencyMs":190,"message":{"messageId":"mock-7","channel":"sms","sender":"Stanbic IBTC","receivedAt":"2025-10-08T12:00:00Z"},"matches":[{"label":"Urgency language","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this secure portal: http://stanbic-review.info","weight":0.33},{"label":"Link","excerpt":"http://stanbic-review.info","weight":0.18},{"label":"Financial keyword","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2},{"label":"Account action requested","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2}],"risk":{"score":0.94,"severity":"high","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Urgency language","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this secure portal: http://stanbic-review.info","weight":0.33,"evidenceType":"keyword"},{"label":"Link","excerpt":"http://stanbic-review.info","weight":0.18,"evidenceType":"url_reputation"},{"label":"Financial keyword","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2,"evidenceType":"keyword"},{"label":"Account action requested","excerpt":"Your Stanbic account has been flagged. Update your BVN immediately using this se","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"block_sender","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"http://stanbic-review.info","domain":"stanbic-review.info"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.33}},"raw_model_score":0.999,"heuristic_score":0.91,"combined_score_pre_clamp":0.9367}

{"id":"benign-1","mock_score":0.25,"wrapper_score":0.0,"score_delta":-0.25,"mock_matches":[],"wrapper_matches":[],"raw_model_score":0.0,"heuristic_score":0.0,"combined_score_pre_clamp":0.0,"detection":{"score":0.0,"detectionId":"b2bd6e01-dd6f-41eb-bdf2-5d71c9b85a20","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:43","latencyMs":204,"message":{"messageId":"benign-1","channel":"sms","sender":"Mom","receivedAt":"2025-10-08T13:00:00Z"},"matches":[],"risk":{"score":0.0,"severity":"safe","label":"Likely safe","confidence":0.99,"factors":[]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.0}},"raw_model_score":0.0,"heuristic_score":0.0,"combined_score_pre_clamp":0.0}

{"id":"benign-2","mock_score":0.15,"wrapper_score":0.51,"score_delta":0.36,"mock_matches":[],"wrapper_matches":[{"label":"Link","excerpt":"https://shopxyz.com/track/12345","weight":0.18},{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12}],"raw_model_score":1.0,"heuristic_score":0.3,"combined_score_pre_clamp":0.51,"detection":{"score":0.51,"detectionId":"ddcaa7e1-8400-4edc-b642-8c82e173a231","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:43","latencyMs":188,"message":{"messageId":"benign-2","channel":"email","sender":"ShopXYZ","receivedAt":"2025-10-08T14:00:00Z"},"matches":[{"label":"Link","excerpt":"https://shopxyz.com/track/12345","weight":0.18},{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12}],"risk":{"score":0.51,"severity":"low","label":"Likely phishing","confidence":0.99,"factors":[{"label":"Link","excerpt":"https://shopxyz.com/track/12345","weight":0.18,"evidenceType":"url_reputation"},{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12,"evidenceType":"otp"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[{"url":"https://shopxyz.com/track/12345","domain":"shopxyz.com"}],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":true,"urgencyScore":0.0}},"raw_model_score":1.0,"heuristic_score":0.3,"combined_score_pre_clamp":0.51}

{"id":"benign-3","mock_score":0.25,"wrapper_score":0.52,"score_delta":0.27,"mock_matches":[],"wrapper_matches":[{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12},{"label":"Financial keyword","excerpt":"Your account ending 4321 was credited with NGN 5,000.00 on 2025-10-08.","weight":0.2}],"raw_model_score":1.0,"heuristic_score":0.32,"combined_score_pre_clamp":0.524,"detection":{"score":0.52,"detectionId":"ff5be484-e439-4129-9ba5-6db11c37c00b","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:43","latencyMs":186,"message":{"messageId":"benign-3","channel":"sms","sender":"Bank Alert","receivedAt":"2025-10-08T15:00:00Z"},"matches":[{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12},{"label":"Financial keyword","excerpt":"Your account ending 4321 was credited with NGN 5,000.00 on 2025-10-08.","weight":0.2}],"risk":{"score":0.52,"severity":"low","label":"Likely phishing","confidence":0.99,"factors":[{"label":"OTP/Verification code","excerpt":"numeric code present","weight":0.12,"evidenceType":"otp"},{"label":"Financial keyword","excerpt":"Your account ending 4321 was credited with NGN 5,000.00 on 2025-10-08.","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":true,"urgencyScore":0.0}},"raw_model_score":1.0,"heuristic_score":0.32,"combined_score_pre_clamp":0.524}

{"id":"benign-4","mock_score":0.2,"wrapper_score":0.3,"score_delta":0.1,"mock_matches":[],"wrapper_matches":[],"raw_model_score":0.9902,"heuristic_score":0.0,"combined_score_pre_clamp":0.2971,"detection":{"score":0.3,"detectionId":"485353d2-f802-479b-9ccf-216d860102ce","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:43","latencyMs":186,"message":{"messageId":"benign-4","channel":"whatsapp","sender":"DeliveryCo","receivedAt":"2025-10-08T16:00:00Z"},"matches":[],"risk":{"score":0.3,"severity":"safe","label":"Likely safe","confidence":0.99,"factors":[]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.0}},"raw_model_score":0.9902,"heuristic_score":0.0,"combined_score_pre_clamp":0.2971}

{"id":"benign-5","mock_score":0.15,"wrapper_score":0.44,"score_delta":0.29,"mock_matches":[],"wrapper_matches":[{"label":"Financial keyword","excerpt":"Monthly newsletter: tips to keep your account secure.","weight":0.2}],"raw_model_score":0.9996,"heuristic_score":0.2,"combined_score_pre_clamp":0.4399,"detection":{"score":0.44,"detectionId":"df98cddf-8fa6-46a2-a4c8-9640fd6b0971","modelVersion":"v0.1.0","createdAt":"2025-10-24T02:09:44","latencyMs":188,"message":{"messageId":"benign-5","channel":"email","sender":"Newsletter","receivedAt":"2025-10-08T17:00:00Z"},"matches":[{"label":"Financial keyword","excerpt":"Monthly newsletter: tips to keep your account secure.","weight":0.2}],"risk":{"score":0.44,"severity":"low","label":"Likely safe","confidence":0.99,"factors":[{"label":"Financial keyword","excerpt":"Monthly newsletter: tips to keep your account secure.","weight":0.2,"evidenceType":"keyword"}]},"actions":{"recommended":"report","rationale":"heuristic + model score","secondary":[]},"metadata":{"channelFeatures":{"links":[],"language":"en"},"explanations":["Result from model v0.1.0"],"heuristics":{"looksLikeOtpCapture":false,"urgencyScore":0.0}},"raw_model_score":0.9996,"heuristic_score":0.2,"combined_score_pre_clamp":0.4399}

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
```

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

If you'd like, I can now:

- add a one-line verified mock-run summary (referencing `model-inference/inference_wrapper/REPORT.md` and the run_on_mock parity harness) into this README, or
- run a markdown lint pass and fix spacing/list heading issues across the README.

Please tell me which follow-up you'd like and I'll proceed.
