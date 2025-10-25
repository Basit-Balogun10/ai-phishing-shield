# Mobile inference wrapper

This folder contains a small Python inference wrapper and a smoke-run script to test the dynamic-range TFLite model produced by the repository's training notebook.

Files added:

- `infer.py` — main inference wrapper. Loads `phishing_detector_package/phishing_detector_dynamic.tflite` and tokenizer saved at `phishing_detector_package/tokenizer`. Exposes a small CLI (read JSON from stdin) and `InferenceWrapper` class for programmatic use.
- `smoke_run.py` — samples `data/processed/test.csv`, runs inference for N messages, and writes `phishing_detector_package/sample_detections.jsonl`.
- `schema/detection_schema.json` — minimal JSON Schema to validate wrapper outputs.

Quick start

1. Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

2. Ensure `phishing_detector_package/phishing_detector_dynamic.tflite` and `phishing_detector_package/tokenizer/` exist.

3. Run a smoke test (writes ~200 detections):

```bash
python mobile/inference_wrapper/smoke_run.py
```

Notes

- The wrapper is intentionally small and conservative. It performs tokenization using the HF tokenizer saved in `phishing_detector_package/tokenizer` and runs the TensorFlow Lite interpreter. Inputs are resized to `max_length = 128` before invocation.
- The `model-metadata.json` in `phishing_detector_package/` is used to populate `modelVersion` in the detection JSON.
