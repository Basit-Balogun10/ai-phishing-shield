# Phishing detector — full test & design report

This document records the decisions, tests, and implementation details for the on-device inference wrapper and parity harness we built. It covers the smoke tests and mock runs we ran, how the wrapper is instrumented for explainability (not a black box), what problems we observed (benign overconfidence), the short-term metadata changes, and the medium-term roadmap (model calibration, multilingual heuristics).

## Goals for this work

- Produce a deterministic on-device inference wrapper that returns the detection JSON contract used by the app.
- Provide parity and sweep tooling to compare wrapper outputs to the frontend mock implementation (`lib/detection/mockDetection.ts`).
- Make the wrapper explainable: return per-rule heuristics and debug fields so we can tune heuristics and metadata.
- Avoid exposing exact 1.0; clamp final reported scores/confidence to 0.99.
- Tune metadata (heuristic weight, severity thresholds) to minimize benign false positives while preserving true positives on our mock set.
- Ensure heuristics are compatible across all supported languages.

## Files changed / created

- `mobile/inference_wrapper/infer.py` — inference wrapper implementing tokenization, TFLite execution, dequantization, model->prob mapping (sigmoid/softmax), heuristic detection, combination logic, debug fields, final clamping, and JSON output matching the app contract.
- `mobile/inference_wrapper/run_on_mock.py` — parity harness and sweep tool. Uses embedded mock and benign messages. Now reads `low` threshold from metadata when computing TP/FP so parity metrics match UI alert visibility.
- `phishing_detector_package/model-metadata.json` — metadata updated: `heuristic_weight = 0.70`, `severity_thresholds = { low: 0.50, medium: 0.60, high: 0.75 }` (user requested mapping).
- `app/(tabs)/alerts.tsx` — UI alignment: use `risk.severity` primarily for display and filtering (with numeric fallbacks). Default behavior hides 'safe' items (score < 0.5) unless filters are active.
- `mobile/inference_wrapper/REPORT.md` — this document (expanded).

## How the inference wrapper works (contract & behavior)

Contract (high level)

- Input: JSON payload with message fields (messageId, body, channel, sender, receivedAt, language, etc.).
- Output: detection JSON matching the app's expectations. Important fields:
  - `score` (final_score): reported 0.00–0.99 (rounded to two decimals)
  - `risk`: { score, severity, label, confidence, factors }
  - `matches`: an array of match objects used by the UI
  - Debug fields: `raw_model_score`, `heuristic_score`, `combined_score_pre_clamp`

Tokenization and model invocation

- Attempts to load HF `AutoTokenizer` from `phishing_detector_package/tokenizer/`. If missing, a fallback whitespace tokenizer is provided so the wrapper stays runnable for parity tests (but fallback does not produce meaningful model inputs).
- Loads the TFLite model from `phishing_detector_package/phishing_detector_dynamic.tflite` using TF Lite Interpreter.
- Resizes inputs at runtime to match `max_length` and supports dynamic-range quantization by dequantizing outputs using tensor quantization params.
- Supports both single-logit (sigmoid) and two-logit (softmax) outputs and normalizes them into a model `score` in [0,1).

Heuristics & explainability

- The wrapper computes a set of human-readable heuristic signals (factors) such as:
  - Urgency language (counts urgency keywords and caps contribution via `heuristic_rules.urgency_weight`)
  - Link detection + short-link heuristics
  - Money/financial keywords
  - Reward/lottery keywords
  - Account-action/verification keywords
  - OTP detection
- Each factor is emitted in `risk.factors` with `label`, `excerpt`, `weight`, and `evidenceType` so the UI and telemetry can explain why a message was flagged.

Combination (model + heuristics)

- `heuristic_weight` in metadata (0..1) sets how much heuristics contribute vs model score:
  - combined_score = model_score _ (1 - heuristic_weight) + heuristic_score _ heuristic_weight
- Final reported score is clamped to maximum 0.99 and rounded to 2 decimals. Confidence is derived conservatively from model confidence and heuristic signals, then clamped.

Severity mapping and UI visibility

- Metadata `severity_thresholds` are used by the wrapper to set `risk.severity`:
  - if score >= high_thresh → 'high'
  - elif score >= med_thresh → 'medium'
  - elif score >= low_thresh → 'low'
  - else → 'safe'
- Current metadata values: low=0.50, medium=0.60, high=0.75.
- The UI is updated to prefer `risk.severity` for color and filter decisions and, by default, will hide 'safe' detections (score < 0.5) when no severity filters are active. This implements the requested behavior "0.0–0.5 should not be shown as an alert by default".

## Parity harness: how TP/FP are computed (now aligned to UI)

- `mobile/inference_wrapper/run_on_mock.py` compares the wrapper output to the JS mock scoring logic (a set of keyword rules and base channel scores).
- For sweep metrics we define a detection threshold equal to the metadata `low` threshold. This makes the parity metrics reflect "what the UI will show as an alert" (i.e. any detection with score >= low_thr will appear as an alert in the UI unless filters hide it).
- Metrics computed per weight trial:
  - mock_tp_rate = (# mock messages with wrapper_score >= low_thr) / (# mock messages)
  - benign_fp_rate = (# benign messages with wrapper_score >= low_thr) / (# benign messages)
  - avg_mock_delta = average absolute difference between wrapper_score and mock_score for mock messages

Rationale: earlier we used a fixed 0.6 threshold for parity metrics; we've changed that to use the metadata `low` threshold (0.5 by your instruction) so test metrics mirror UI behavior.

## Tests we ran (smoke & mock runs)

Smoke tests (what to run locally)

- Ensure the wrapper runs end-to-end with a sample message and returns a valid JSON detection (no exceptions). Example:

```bash
echo '{"messageId":"smoke-1","body":"Hi","channel":"sms","sender":"Test","receivedAt":"2025-10-24T00:00:00Z"}' | python mobile/inference_wrapper/infer.py
```

Mock runs and sweeps

- Run parity once (writes `mock_parity.jsonl`):

```bash
python mobile/inference_wrapper/run_on_mock.py --out ./sweep_results/mock_parity.jsonl
```

- Run a sweep across heuristic weights to find the TP/FP tradeoff (example):

```bash
python mobile/inference_wrapper/run_on_mock.py --weights 0.2,0.3,0.4,0.5,0.6,0.7 --out ./sweep_results/sweep
```

What we observed

- The model's raw outputs were frequently overconfident (many raw_model_score values near 1.0 on both mock phishing and some benign messages). This made heuristics the primary lever to lower false positives.
- Increasing `heuristic_weight` reduces benign false positives but may depress some borderline mock messages just below the detection threshold. The sweep data you supplied showed that `heuristic_weight=0.6` gave mock_tp_rate 1.0 and benign_fp_rate 0.0 in that sample, while `0.7` reduced mock_tp_rate because one borderline mock dropped below the threshold. You decided that the mock in question is legitimately lower severity and selected `0.7`.

## Problems encountered and mitigation (short-term & medium-term)

Problem: model overconfidence on some benign texts

- Observation: raw_model_score sometimes ≈ 1.0 for benign messages. This leads to high combined_score when heuristics are weak.

Short-term mitigations implemented

- Raised `heuristic_weight` to 0.70 to let heuristics reduce benign FP rates.
- Clamped reported scores and confidences to ≤ 0.99 to avoid exposing exact 1.0.
- Added per-message heuristic `factors` and debug fields (`raw_model_score`, `heuristic_score`, `combined_score_pre_clamp`) so we can inspect failure modes and tune rules.

Medium-term mitigation (recommended)

- Calibration: run temperature scaling or Platt scaling on a held-out validation set (not used in training) to reduce model output overconfidence. That will allow the heuristic weight to be reduced while preserving good TP/FP tradeoffs.
- Retraining options: augment training with more benign negatives or add a regularization objective to reduce overconfident logits (e.g., label smoothing, extra samples of near-miss benigns).

## Multi-language heuristics (compatibility plan)

Goal: ensure heuristics (keyword-based detectors, link heuristics, OTP detection) work robustly for all supported languages (metadata lists training_languages: en, fr, sw, yo, ig, ha, am, ar, pcm).

Actions to take

1. Translate keyword lists: for each language, create equivalent keyword lists for urgency, money, reward, account-action, and OTP-related patterns. Use native-speaker reviewers or reliable translation + manual curation.
2. Use language-aware tokenization: wrapper already preserves `language` in metadata (payload); when language is known, prefer language-specific keyword regexes and avoid false positives from English-only rules.
3. Regex/Unicode robustness: use Unicode-normalized matching and language-appropriate word boundaries. We already normalize diacritics in the UI; same should be applied to heuristics.
4. Short-link heuristics are language-agnostic — keep them shared.
5. Small-language testing: run the parity harness with translated mock messages (one per language) to catch language-specific false positives.

Implementation notes

- We'll store per-language rule sets under `mobile/inference_wrapper/rules/` or add them to metadata as `heuristic_rules_by_language` so the wrapper can load the right regexes at runtime.
- When language detection is uncertain, fall back to multi-language rules but lower per-rule weight to reduce false positives.

## Reproducibility & commands

- Single parity run (writes JSONL):

```bash
python mobile/inference_wrapper/run_on_mock.py --out ./sweep_results/mock_parity.jsonl
```

- Sweep example (writes per-weight JSONL files and summary JSON):

```bash
python mobile/inference_wrapper/run_on_mock.py --weights 0.2,0.3,0.4,0.5,0.6,0.7 --out ./sweep_results/sweep
```

- To use metadata-driven parity threshold (already implemented): ensure `phishing_detector_package/model-metadata.json` has the `severity_thresholds.low` value you want; the harness will read it automatically.

CI and lightweight runs

- The parity harness now supports a dummy wrapper mode that's safe to run in CI (no TensorFlow or HuggingFace dependencies). Use the `--use-dummy-wrapper` flag when running in CI or on machines without the full ML stack. Example:

```bash
python mobile/inference_wrapper/run_on_mock.py --weights 0.5 --use-dummy-wrapper --out ./sweep_results/ci_smoke.jsonl
```

- A GitHub Actions workflow has been added at `.github/workflows/parity-smoke.yml` which runs a single-weight smoke test in dummy mode on push and pull requests. The workflow is intentionally lightweight and verifies the harness end-to-end without requiring heavy model dependencies.

## Suggested next steps (practical)

Short term (apply now)

- Keep `heuristic_weight = 0.70` (per your decision).
- Use the updated parity harness (threshold = low_thr) for future sweeps so metrics match UI.
- Add small smoke tests in CI that run the parity harness with a tiny set of messages to detect regressions.

Medium term

- Calibrate the model: temperature scaling or Platt scaling using a held-out set.
- Expand multilingual heuristics and add translation-reviewed keyword lists.
- Consider light retraining with more benign negatives if calibration is insufficient.

Long term

- Add automated telemetry-driven tuning: collect human feedback on false positives, and surface examples for targeted retraining.

If you'd like, I will:

- (A) Update the parity harness to save per-message diffs with the `risk.severity` and produce a small CSV summarizing flips between weights.
- (B) Implement per-language heuristic rule loading and a small test harness that runs the same mock messages in each supported language.

Tell me which of (A) or (B) to do next, or I can start both in parallel.
