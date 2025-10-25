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
PACKAGE_DIR = os.path.join(os.getcwd(), "phishing_detector_package")
TFLITE_PATH = os.path.join(PACKAGE_DIR, "phishing_detector_dynamic.tflite")
TOKENIZER_DIR = os.path.join(PACKAGE_DIR, "tokenizer")
METADATA_PATH = os.path.join(PACKAGE_DIR, "model-metadata.json")
MAX_LEN = 128
RULES_DIR = os.path.join(os.path.dirname(__file__), "rules")


def load_model_and_tokenizer(
    tflite_path: str = TFLITE_PATH, tokenizer_dir: str = TOKENIZER_DIR
):
    if not os.path.exists(tflite_path):
        raise FileNotFoundError(f"TFLite model not found at {tflite_path}")
    if not os.path.exists(tokenizer_dir):
        raise FileNotFoundError(f"Tokenizer folder not found at {tokenizer_dir}")

    # Try to read num_threads from metadata if available
    num_threads = None
    try:
        meta = read_metadata()
        num_threads = int(meta.get("num_threads", 1))
    except Exception:
        num_threads = 1

    # Create interpreter with a configurable number of threads (helps low-RAM machines)
    if num_threads and num_threads > 0:
        interpreter = tf.lite.Interpreter(
            model_path=tflite_path, num_threads=num_threads
        )
    else:
        interpreter = tf.lite.Interpreter(model_path=tflite_path)

    # Do not allocate here; we'll resize at inference time
    # Attempt to load HF tokenizer; if it fails (missing files or incompatible files),
    # provide a very small fallback tokenizer so the wrapper stays runnable for parity
    # checks. WARNING: fallback tokenizer does NOT produce meaningful token ids and
    # should only be used for heuristic-only testing or when the correct tokenizer
    # files are not available in the runtime.
    try:
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_dir)
    except Exception as e:
        # Emit a clear warning and create a minimal whitespace tokenizer that returns
        # zeroed input ids and attention masks sized to MAX_LEN so downstream code
        # can call the wrapper in environments where the HF tokenizer isn't present.
        print(f"[warning] Failed to load tokenizer from {tokenizer_dir}: {e}")

        class _FallbackTokenizer:
            def __init__(self, max_len=MAX_LEN):
                self.max_len = max_len

            def __call__(
                self,
                text,
                truncation=True,
                padding="max_length",
                max_length=None,
                return_tensors=None,
            ):
                ml = max_length or self.max_len
                # return arrays shaped (1, ml)
                input_ids = np.zeros((1, ml), dtype=np.int32)
                attention_mask = np.zeros((1, ml), dtype=np.int32)
                # minimal attention mask: ones for non-zero tokens (none here)
                return {"input_ids": input_ids, "attention_mask": attention_mask}

        tokenizer = _FallbackTokenizer()

    return interpreter, tokenizer


def _softmax(logits: np.ndarray) -> np.ndarray:
    ex = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return ex / np.sum(ex, axis=-1, keepdims=True)


def _extract_urls(text: str) -> List[Dict[str, Any]]:
    url_re = re.compile(r"https?://[\w\-\./?%&=~#]+", flags=re.I)
    urls = []
    for m in url_re.finditer(text or ""):
        u = m.group(0)
        domain = re.sub(r"https?://", "", u).split("/")[0]
        urls.append({"url": u, "domain": domain})
    return urls


SHORTENERS = set(
    ["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "goo.gl", "ow.ly", "is.gd", "tiny.cc"]
)


def _is_short_link(domain: str) -> bool:
    d = (domain or "").lower()
    if d in SHORTENERS:
        return True
    # heuristic: short domain (<10 chars) or contains dash and short
    name = d.split(":")[-1]
    name = name.split("@")[-1]
    if len(name.split(".")[0]) <= 6:
        return True
    return False


MONEY_KEYWORDS = re.compile(
    r"(bank|account|transfer|withdraw|deposit|balance|pay|gbp|ngn|naira|dollar|credit|debit)",
    re.I,
)
REWARD_KEYWORDS = re.compile(
    r"(prize|lottery|winner|congratulations|reward|gift|selected)", re.I
)
ACCOUNT_KEYWORDS = re.compile(
    r"(verify|confirm|update|suspend|activate|deactivate|reactivate)", re.I
)


def _detect_otp(text: str, pattern: str = None) -> bool:
    # Simple OTP pattern: 4-6 digit codes
    if pattern:
        try:
            return bool(re.search(pattern, text or ""))
        except Exception:
            pass
    return bool(re.search(r"\b\d{4,6}\b", text or ""))


def _urgency_score(text: str, keywords: List[str] = None) -> float:
    # heuristic: count urgency keywords (language-specific provided as `keywords`)
    if not keywords:
        keywords = [
            "urgent",
            "immediately",
            "now",
            "within 24",
            "suspend",
            "suspended",
            "verify",
            "verify now",
            "click",
        ]
    t = (text or "").lower()
    count = sum(1 for k in keywords if k.lower() in t)
    # scale into 0..1 but cap per-rule contribution later; return raw urgency fraction
    return min(1.0, count / 3.0)


def load_language_rules(language: str = "en") -> Dict[str, Any]:
    """Load per-language heuristic rules from the `rules/` directory.

    Fallback order: {language}.json -> default.json -> built-in defaults
    """
    defaults = {
        "urgency_keywords": [
            "urgent",
            "immediately",
            "now",
            "within 24",
            "suspend",
            "suspended",
            "verify",
            "verify now",
            "click",
        ],
        "money_regex": r"(bank|account|transfer|withdraw|deposit|balance|pay|gbp|ngn|naira|dollar|credit|debit)",
        "reward_regex": r"(prize|lottery|winner|congratulations|reward|gift|selected)",
        "account_regex": r"(verify|confirm|update|suspend|activate|deactivate|reactivate)",
        "otp_pattern": r"\b\d{4,6}\b",
        "urgency_weight": 0.25,
        "short_link_weight": 0.18,
        "money_keyword_weight": 0.2,
        "reward_keyword_weight": 0.18,
        "account_keyword_weight": 0.2,
    }
    try:
        lang_file = os.path.join(RULES_DIR, f"{language}.json")
        if os.path.exists(lang_file):
            with open(lang_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                defaults.update(data)
                return defaults
        # try default.json
        default_file = os.path.join(RULES_DIR, "default.json")
        if os.path.exists(default_file):
            with open(default_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                defaults.update(data)
                return defaults
    except Exception:
        pass
    return defaults


def read_metadata(path: str = METADATA_PATH) -> Dict[str, Any]:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {
        "modelVersion": "v0.0.0",
        "modelName": "distilbert-base-multilingual-cased",
        "max_length": MAX_LEN,
        "input_names": [
            "serving_default_input_ids:0",
            "serving_default_attention_mask:0",
        ],
        "quantization": "dynamic",
        "createdAt": None,
        "training_languages": ["en", "fr", "sw", "yo", "ig", "ha", "am", "ar", "pcm"],
    }


class InferenceWrapper:
    def __init__(
        self, tflite_path: str = TFLITE_PATH, tokenizer_dir: str = TOKENIZER_DIR
    ):
        # read metadata first so load_model_and_tokenizer can use it
        self.metadata = read_metadata(METADATA_PATH)
        self.interpreter, self.tokenizer = load_model_and_tokenizer(
            tflite_path, tokenizer_dir
        )
        self.input_details = None
        self.output_details = None

    def _prepare_interpreter(self):
        # Query details and set initial tiny shape; we'll resize per request
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

    def infer(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Validate minimal payload
        if payload.get("shieldPaused"):
            return {"skipped": True}
        if not payload.get("messageId") or not payload.get("body"):
            return {"error": "invalid_payload", "field": "body/messageId"}

        # Tokenize
        body = payload.get("body", "")
        enc = self.tokenizer(
            body,
            truncation=True,
            padding="max_length",
            max_length=MAX_LEN,
            return_tensors="np",
        )
        input_ids = enc["input_ids"].astype(np.int32)
        attention_mask = enc["attention_mask"].astype(np.int32)

        # Prepare interpreter details
        if self.input_details is None:
            self._prepare_interpreter()

        # Resize inputs to [1, MAX_LEN]
        for inp in self.input_details:
            try:
                self.interpreter.resize_tensor_input(inp["index"], [1, MAX_LEN])
            except Exception:
                # ignore resize errors, will attempt allocate
                pass
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        # Map tokenizer outputs to interpreter inputs by name
        for inp in self.input_details:
            name = inp["name"].lower()
            if "input_ids" in name:
                arr = input_ids
            elif "attention" in name and "mask" in name:
                arr = attention_mask
            else:
                arr = input_ids
            # Cast if interpreter expects int8 etc (dynamic model uses int32 inputs)
            expected_dtype = inp["dtype"]
            if arr.dtype != expected_dtype:
                try:
                    arr = arr.astype(expected_dtype)
                except Exception:
                    arr = arr.astype(np.int32)
            self.interpreter.set_tensor(inp["index"], arr)

        # Run inference
        start = time.time()
        self.interpreter.invoke()
        end = time.time()
        latency_ms = int((end - start) * 1000)

        out = self.interpreter.get_tensor(self.output_details[0]["index"])

        # Dequantize output if needed
        out_info = self.output_details[0]
        try:
            scale, zero_point = out_info.get("quantization", (0.0, 0))
        except Exception:
            scale, zero_point = (0.0, 0)
        if scale and zero_point:
            # int8/uint8 outputs must be converted to float
            out = (out.astype(np.float32) - zero_point) * scale

        # Normalize depending on output shape: support sigmoid (1 logit) or softmax (2 logits)
        score = 0.0
        confidence = 0.0
        probs = None
        if out.ndim >= 2 and out.shape[-1] == 1:
            # binary single-logit (sigmoid)
            logits = out.reshape(-1, 1)
            probs_arr = 1.0 / (1.0 + np.exp(-logits))
            score = float(probs_arr[0, 0])
            confidence = float(max(probs_arr[0, 0], 1.0 - probs_arr[0, 0]))
            probs = [1.0 - score, score]
        elif out.ndim >= 2 and out.shape[-1] == 2:
            probs_arr = _softmax(out)
            probs = probs_arr[0].tolist()
            # assume class index 1 == phishing
            score = float(probs[1])
            confidence = float(max(probs))
        else:
            # fallback: flatten and softmax
            flat = out.reshape(1, -1)
            probs_arr = _softmax(flat)
            probs = probs_arr[0].tolist()
            if len(probs) > 1:
                score = float(probs[1])
            else:
                score = float(probs[0])
            confidence = float(max(probs))

        # clamp tiny numerical edge cases and keep full-precision for combination
        eps = 1e-6
        score = min(max(score, eps), 1.0 - eps)
        confidence = min(max(confidence, eps), 1.0 - eps)

        # Map severity based on model score for now (will re-evaluate after combining)
        # We will recompute severity from the final combined score below so this is temporary
        if score < 0.40:
            severity = "safe"
        elif score < 0.60:
            severity = "low"
        elif score < 0.80:
            severity = "medium"
        else:
            severity = "high"

        # Heuristic explainability using per-language rules where available
        rules = load_language_rules(payload.get("language") or "en")
        urls = _extract_urls(body)
        otp = _detect_otp(body, pattern=rules.get("otp_pattern"))
        urgency = _urgency_score(body, keywords=rules.get("urgency_keywords"))
        factors = []
        heuristic_score = 0.0

        # urgency factor (language-specific)
        if urgency > 0:
            urgency_w = float(rules.get("urgency_weight", 0.25))
            w = round(min(urgency, 1.0) * urgency_w, 2)
            factors.append(
                {
                    "label": "Urgency language",
                    "excerpt": body[:120],
                    "weight": w,
                    "evidenceType": "keyword",
                }
            )
            heuristic_score += w

        # URL-based heuristics
        if urls:
            for u in urls:
                is_short = _is_short_link(u.get("domain"))
                url_weight = (
                    float(rules.get("short_link_weight", 0.18))
                    if is_short
                    else float(rules.get("link_weight", 0.05))
                )
                factors.append(
                    {
                        "label": "Suspicious link" if is_short else "Link",
                        "excerpt": u["url"],
                        "weight": round(url_weight, 2),
                        "evidenceType": "url_reputation",
                    }
                )
                heuristic_score += url_weight

        # OTP factor
        if otp:
            otp_w = float(rules.get("otp_weight", 0.12))
            factors.append(
                {
                    "label": "OTP/Verification code",
                    "excerpt": "numeric code present",
                    "weight": otp_w,
                    "evidenceType": "otp",
                }
            )
            heuristic_score += otp_w

        # Money / reward / account keywords (language-specific regexes)
        money_re = re.compile(rules.get("money_regex", MONEY_KEYWORDS.pattern), re.I)
        reward_re = re.compile(rules.get("reward_regex", REWARD_KEYWORDS.pattern), re.I)
        account_re = re.compile(
            rules.get("account_regex", ACCOUNT_KEYWORDS.pattern), re.I
        )

        if money_re.search(body):
            mw = float(rules.get("money_keyword_weight", 0.2))
            factors.append(
                {
                    "label": "Financial keyword",
                    "excerpt": body[:80],
                    "weight": round(mw, 2),
                    "evidenceType": "keyword",
                }
            )
            heuristic_score += mw
        if reward_re.search(body):
            rw = float(rules.get("reward_keyword_weight", 0.18))
            factors.append(
                {
                    "label": "Reward / lottery",
                    "excerpt": body[:80],
                    "weight": round(rw, 2),
                    "evidenceType": "keyword",
                }
            )
            heuristic_score += rw
        if account_re.search(body):
            aw = float(rules.get("account_keyword_weight", 0.2))
            factors.append(
                {
                    "label": "Account action requested",
                    "excerpt": body[:80],
                    "weight": round(aw, 2),
                    "evidenceType": "keyword",
                }
            )
            heuristic_score += aw

        # normalize heuristic score to [0,1]
        heuristic_score = min(heuristic_score, 1.0)

        # combine model score with heuristic score using heuristic_weight from metadata
        h_weight = float(self.metadata.get("heuristic_weight", 0.2))
        combined_score = (score * (1.0 - h_weight)) + (heuristic_score * h_weight)

        # final numeric clamping and formatting: mirror frontend mock behaviour by
        # capping reported scores/confidence at 0.99 (never expose exact 1.0)
        final_score = float(min(max(combined_score, 0.0), 0.99))
        final_score = round(final_score, 2)

        # derive a conservative confidence: keep model confidence but let heuristics raise it;
        # then cap at 0.99
        combined_confidence = max(confidence, min(1.0, 0.5 + heuristic_score * 0.5))
        final_confidence = float(min(max(combined_confidence, 0.0), 0.99))
        final_confidence = round(final_confidence, 2)

        # recompute severity based on the final combined score (so heuristics affect severity)
        # Use thresholds from metadata if present; fallback to frontend defaults.
        thr = self.metadata.get("severity_thresholds", {})
        high_thr = float(thr.get("high", 0.85))
        med_thr = float(thr.get("medium", 0.7))
        low_thr = float(thr.get("low", 0.4))

        if final_score >= high_thr:
            severity = "high"
        elif final_score >= med_thr:
            severity = "medium"
        elif final_score >= low_thr:
            severity = "low"
        else:
            severity = "safe"

        # Actions simple mapping
        recommended = "block_sender" if severity == "high" else "report"

        # normalize message fields
        raw_sender = payload.get("sender")
        sender_str = None
        if raw_sender is not None:
            try:
                sender_str = str(raw_sender)
            except Exception:
                sender_str = None

        received_at = payload.get("receivedAt")
        # treat NaN or empty strings as None
        if received_at is None:
            received_at_clean = None
        else:
            try:
                s = str(received_at)
                if s.lower() == "nan" or s.strip() == "":
                    received_at_clean = None
                else:
                    received_at_clean = s
            except Exception:
                received_at_clean = None

        # Build a top-level 'matches' array to help parity with frontend mockDetection.ts
        matches = []
        for f in factors:
            matches.append(
                {
                    "label": f.get("label"),
                    "excerpt": f.get("excerpt"),
                    "weight": f.get("weight"),
                }
            )

        detection = {
            # top-level compatibility field used by some frontend code (mockDetection)
            "score": final_score,
            "detectionId": str(uuid.uuid4()),
            "modelVersion": self.metadata.get("modelVersion", "v0.0.0"),
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            "latencyMs": latency_ms,
            "message": {
                "messageId": str(payload.get("messageId"))
                if payload.get("messageId") is not None
                else None,
                "channel": payload.get("channel", "sms"),
                "sender": sender_str,
                "receivedAt": received_at_clean,
            },
            "matches": matches,
            "risk": {
                "score": final_score,
                "severity": severity,
                "label": "Likely phishing" if final_score >= 0.5 else "Likely safe",
                "confidence": final_confidence,
                "factors": factors,
            },
            "actions": {
                "recommended": recommended,
                "rationale": "heuristic + model score",
                "secondary": [],
            },
            "metadata": {
                "channelFeatures": {"links": urls, "language": payload.get("language")},
                "explanations": [
                    f'Result from model {self.metadata.get("modelVersion")}'
                ],
                "heuristics": {
                    "looksLikeOtpCapture": otp,
                    "urgencyScore": round(urgency, 2),
                },
            },
        }

        # Debug fields to help parity/tuning: raw model score (pre-heuristics),
        # heuristic_score and combined_score before we clamp/report it.
        try:
            detection["raw_model_score"] = round(float(score), 4)
        except Exception:
            detection["raw_model_score"] = None
        try:
            detection["heuristic_score"] = round(float(heuristic_score), 4)
        except Exception:
            detection["heuristic_score"] = None
        try:
            detection["combined_score_pre_clamp"] = round(float(combined_score), 4)
        except Exception:
            detection["combined_score_pre_clamp"] = None

        return detection


if __name__ == "__main__":
    # simple CLI: read JSON from stdin and print detection
    import sys

    wrapper = InferenceWrapper()
    payload = json.load(sys.stdin)
    out = wrapper.infer(payload)
    print(json.dumps(out, indent=2))
