# Dataset Processing Notes

Generated on: 2025-10-21T20:54:21.385899Z

## Source breakdown
- **uci_sms_spam** — 5150 rows after normalisation
- **kaggle_multilingual** — 20528 rows after normalisation
- **huggingface_augmented** — 15180 rows after normalisation
- **nigeria_university_sms** — 3860 rows after normalisation
- **synthetic_generator** — 23400 rows after normalisation

## Normalisation steps
- Trimmed whitespace and removed messages under 6 characters.
- Harmonised labels to `phishing`/`legitimate`.
- Annotated each row with a BCP-47 language tag.
- Added synthetic sender metadata for compatibility with the inference payload schema.
- Auto-assigned `scam_type` using keyword heuristics for phishing records; legitimate entries are tagged `legitimate_general`.
- Deduplicated identical message-language pairs.
- Enforced <=40% contribution per data source and a 35%±5 phishing ratio.
- Stratified into train/validation/test splits using language + label.
