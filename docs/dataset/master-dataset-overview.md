# Master Dataset Overview

This document captures the current state of the consolidated phishing detection corpus, how to regenerate it, and what to expect from the resulting artefacts.

## Outputs

All processed files live under `data/processed/` and are UTF-8 CSV unless otherwise stated.

| File                                      | Description                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `master_dataset.csv`                      | Full corpus after normalisation, balancing, and source caps. |
| `train.csv`, `validation.csv`, `test.csv` | Stratified splits (language + label) at 70/15/15.            |
| `dataset_statistics.json`                 | Aggregate counts by label, language, and source.             |
| `processing_notes.md`                     | Generated markdown log of key normalisation steps.           |

Synthetic samples exported by `scripts/phishingMessagesGenerator.ts` can be found under `phishing_dataset/` (per-language CSV/JSON plus an all-language aggregate). These are consumed automatically when present.

## Schema

All CSV files share the same column contract expected by the mobile inference client.

| Column        | Type                              | Notes                                                                |
| ------------- | --------------------------------- | -------------------------------------------------------------------- |
| `message`     | string                            | SMS body trimmed to ≥6 chars with internal whitespace normalised.    |
| `label`       | string (`phishing`\|`legitimate`) | Binary target after harmonising dataset-specific labels.             |
| `language`    | string (BCP-47)                   | Lower-case tag (e.g., `en`, `yo`, `pcm`).                            |
| `source`      | string                            | Provenance identifier (e.g., `uci_sms_spam`, `synthetic_generator`). |
| `channel`     | string                            | Currently always `sms` to match app inference payloads.              |
| `sender`      | string                            | Synthetic MSISDN generated from region-aware prefixes.               |
| `received_at` | ISO-8601 string                   | Randomised timestamp within the past ~2 years when absent.           |
| `scam_type`   | string                            | Keyword-inferred subtype; legitimate rows are `legitimate_general`.  |

## Current Corpus Snapshot (2025-10-21)

- Total messages: **68,118**
- Phishing share: **36.0%** (target band 30–40%)
- Largest source share: **34.4%** (`synthetic_generator`, below the 40% cap)

### Language coverage

| Language |   Rows | Phishing ratio |
| -------- | -----: | -------------: |
| `am`     |  2,600 |          0.769 |
| `ar`     |  7,504 |          0.351 |
| `de`     |  5,140 |          0.124 |
| `en`     | 21,904 |          0.245 |
| `fr`     | 12,858 |          0.255 |
| `ha`     |  2,600 |          0.769 |
| `hi`     |  5,112 |          0.123 |
| `ig`     |  2,600 |          0.769 |
| `pcm`    |  2,600 |          0.769 |
| `sw`     |  2,600 |          0.769 |
| `yo`     |  2,600 |          0.769 |

> **Note:** The high phishing ratios in languages sourced primarily from the generator (`am`, `ha`, `ig`, `pcm`, `sw`, `yo`) are expected and counter-balanced during global sampling so the overall corpus remains inside the target band.

## Reproducibility

### 1. Python environment

```bash
python -m pip install -r requirements-dataset.txt
```

### 2. Generate synthetic samples (optional but recommended)

The TypeScript generator is designed to be compiled to plain JavaScript for consistent cross-platform execution.

```bash
pnpm exec tsc scripts/phishingMessagesGenerator.ts \
  --module ES2022 --target ES2022 --moduleResolution node \
  --outDir scripts/dist --esModuleInterop --lib ES2022
node scripts/dist/phishingMessagesGenerator.js
```

This produces fresh CSV/JSON files under `phishing_dataset/` for nine target languages. Skip this step and pass `--without-synthetic` to the Python script if you need an all-real dataset baseline.

### 3. Build the master dataset

```bash
python scripts/dataset/prepare_master_dataset.py
```

Add `--dry-run` to preview row counts without writing files. Use `--without-synthetic` to ignore any generated synthetic exports.

## Integration Notes

- Deduplication happens per `(message, language)` pair. Collisions across languages are retained for multilingual coverage.
- `received_at` timestamps and `sender` MSISDNs are synthetic, ensuring compatibility with the mobile app’s telemetry format without exposing PII.
- `processing_notes.md` and `dataset_statistics.json` are regenerated on every run; archive snapshots if you need historical comparisons.
- The balancing step samples with replacement when required to maintain the phishing ratio band. Downstream training should therefore use stratified shuffling by `language` + `label` when forming batches to preserve this profile.

## Next Steps

- Re-run the pipeline after incorporating new real-world corpora or refining the synthetic generator templates.
- Feed `train.csv` into the model-training workflow described in `docs/strategy/complete-model-training-and-mobile-integration-strategy.md`, keeping the validation/test splits untouched for evaluation.
