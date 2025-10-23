import os
import time
import uuid
import json
import re
from typing import List, Dict, Any

import numpy as np
import tensorflow as tf
from transformers import AutoTokenizer

# Paths (assume working dir is repo root)
PACKAGE_DIR = os.path.join(os.getcwd(), 'phishing_detector_package')
TFLITE_PATH = os.path.join(PACKAGE_DIR, 'phishing_detector_dynamic.tflite')
TOKENIZER_DIR = os.path.join(PACKAGE_DIR, 'tokenizer')
METADATA_PATH = os.path.join(PACKAGE_DIR, 'model-metadata.json')
MAX_LEN = 128


def load_model_and_tokenizer(tflite_path: str = TFLITE_PATH, tokenizer_dir: str = TOKENIZER_DIR):
    if not os.path.exists(tflite_path):
        raise FileNotFoundError(f"TFLite model not found at {tflite_path}")
    if not os.path.exists(tokenizer_dir):
        raise FileNotFoundError(f"Tokenizer folder not found at {tokenizer_dir}")

    # Try to read num_threads from metadata if available
    num_threads = None
    try:
        meta = read_metadata()
        num_threads = int(meta.get('num_threads', 1))
    except Exception:
        num_threads = 1

    # Create interpreter with a configurable number of threads (helps low-RAM machines)
    if num_threads and num_threads > 0:
        interpreter = tf.lite.Interpreter(model_path=tflite_path, num_threads=num_threads)
    else:
        interpreter = tf.lite.Interpreter(model_path=tflite_path)

    # Do not allocate here; we'll resize at inference time
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_dir)
    return interpreter, tokenizer


def _softmax(logits: np.ndarray) -> np.ndarray:
    ex = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return ex / np.sum(ex, axis=-1, keepdims=True)


def _extract_urls(text: str) -> List[Dict[str, Any]]:
    url_re = re.compile(r"https?://[\w\-\./?%&=~#]+", flags=re.I)
    urls = []
    for m in url_re.finditer(text or ""):
        u = m.group(0)
        domain = re.sub(r"https?://", "", u).split('/')[0]
        urls.append({"url": u, "domain": domain})
    return urls


def _detect_otp(text: str) -> bool:
    # Simple OTP pattern: 4-6 digit codes
    return bool(re.search(r"\b\d{4,6}\b", text or ""))


def _urgency_score(text: str) -> float:
    # heuristic: count urgency keywords
    kws = ["urgent", "immediately", "now", "within 24", "suspend", "suspended", "verify", "verify now", "click"]
    t = (text or "").lower()
    count = sum(1 for k in kws if k in t)
    return min(1.0, count / 3.0)


def read_metadata(path: str = METADATA_PATH) -> Dict[str, Any]:
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    return {
        "modelVersion": "v0.0.0",
        "modelName": "distilbert-base-multilingual-cased",
        "max_length": MAX_LEN,
        "input_names": ["serving_default_input_ids:0", "serving_default_attention_mask:0"],
        "quantization": "dynamic",
        "createdAt": None,
        "training_languages": ["en", "fr", "sw", "yo", "ig", "ha", "am", "ar", "pcm"]
    }


class InferenceWrapper:
    def __init__(self, tflite_path: str = TFLITE_PATH, tokenizer_dir: str = TOKENIZER_DIR):
        # read metadata first so load_model_and_tokenizer can use it
        self.metadata = read_metadata(METADATA_PATH)
        self.interpreter, self.tokenizer = load_model_and_tokenizer(tflite_path, tokenizer_dir)
        self.input_details = None
        self.output_details = None

    def _prepare_interpreter(self):
        # Query details and set initial tiny shape; we'll resize per request
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

    def infer(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Validate minimal payload
        if payload.get('shieldPaused'):
            return {"skipped": True}
        if not payload.get('messageId') or not payload.get('body'):
            return {"error": "invalid_payload", "field": "body/messageId"}

        # Tokenize
        body = payload.get('body', '')
        enc = self.tokenizer(body, truncation=True, padding='max_length', max_length=MAX_LEN, return_tensors='np')
        input_ids = enc['input_ids'].astype(np.int32)
        attention_mask = enc['attention_mask'].astype(np.int32)

        # Prepare interpreter details
        if self.input_details is None:
            self._prepare_interpreter()

        # Resize inputs to [1, MAX_LEN]
        for inp in self.input_details:
            try:
                self.interpreter.resize_tensor_input(inp['index'], [1, MAX_LEN])
            except Exception:
                # ignore resize errors, will attempt allocate
                pass
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        # Map tokenizer outputs to interpreter inputs by name
        for inp in self.input_details:
            name = inp['name'].lower()
            if 'input_ids' in name:
                arr = input_ids
            elif 'attention' in name and 'mask' in name:
                arr = attention_mask
            else:
                arr = input_ids
            # Cast if interpreter expects int8 etc (dynamic model uses int32 inputs)
            expected_dtype = inp['dtype']
            if arr.dtype != expected_dtype:
                try:
                    arr = arr.astype(expected_dtype)
                except Exception:
                    arr = arr.astype(np.int32)
            self.interpreter.set_tensor(inp['index'], arr)

        # Run inference
        start = time.time()
        self.interpreter.invoke()
        end = time.time()
        latency_ms = int((end - start) * 1000)

        out = self.interpreter.get_tensor(self.output_details[0]['index'])
        probs = _softmax(out)[0].tolist()
        # assume class index 1 == phishing
        score = round(float(probs[1]), 2)
        confidence = round(max(probs), 2)

        # Map severity
        if score < 0.40:
            severity = 'safe'
        elif score < 0.60:
            severity = 'low'
        elif score < 0.80:
            severity = 'medium'
        else:
            severity = 'high'

        # Heuristic explainability
        urls = _extract_urls(body)
        otp = _detect_otp(body)
        urgency = _urgency_score(body)
        factors = []
        if urgency > 0:
            factors.append({
                'label': 'Urgency language',
                'excerpt': body[:120],
                'weight': round(urgency, 2),
                'evidenceType': 'keyword'
            })
        if urls:
            for u in urls:
                factors.append({
                    'label': 'Suspicious link',
                    'excerpt': u['url'],
                    'weight': 0.18,
                    'evidenceType': 'url_reputation'
                })
        if otp:
            factors.append({
                'label': 'OTP/Verification code',
                'excerpt': 'numeric code present',
                'weight': 0.12,
                'evidenceType': 'otp'
            })

        # Actions simple mapping
        recommended = 'block_sender' if severity == 'high' else 'report'

        detection = {
            'detectionId': str(uuid.uuid4()),
            'modelVersion': self.metadata.get('modelVersion', 'v0.0.0'),
            'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()),
            'latencyMs': latency_ms,
            'message': {
                'messageId': payload.get('messageId'),
                'channel': payload.get('channel', 'sms'),
                'sender': payload.get('sender'),
                'receivedAt': payload.get('receivedAt')
            },
            'risk': {
                'score': score,
                'severity': severity,
                'label': 'Likely phishing' if score >= 0.5 else 'Likely safe',
                'confidence': confidence,
                'factors': factors
            },
            'actions': {
                'recommended': recommended,
                'rationale': 'heuristic + model score',
                'secondary': []
            },
            'metadata': {
                'channelFeatures': {
                    'links': urls,
                    'language': payload.get('language')
                },
                'explanations': [f'Result from model {self.metadata.get("modelVersion")}'],
                'heuristics': {
                    'looksLikeOtpCapture': otp,
                    'urgencyScore': round(urgency, 2)
                }
            }
        }

        return detection


if __name__ == '__main__':
    # simple CLI: read JSON from stdin and print detection
    import sys
    wrapper = InferenceWrapper()
    payload = json.load(sys.stdin)
    out = wrapper.infer(payload)
    print(json.dumps(out, indent=2))
