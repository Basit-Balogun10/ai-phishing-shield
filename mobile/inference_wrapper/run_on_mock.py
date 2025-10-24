import argparse
import re
import json
import csv
import os
from typing import List, Dict, Any

# NOTE: we import the real InferenceWrapper lazily to avoid pulling heavy
# dependencies (tensorflow, transformers) in CI. Use `make_wrapper(use_dummy=True)`
# to get a lightweight DummyWrapper suitable for CI or quick smoke tests.

def make_wrapper(use_dummy: bool = False, language: str = 'en'):
    if use_dummy:
        return DummyWrapper()
    try:
        # import lazily so CI can avoid installing TF
        from infer import InferenceWrapper
        return InferenceWrapper()
    except Exception as e:
        print(f"[warning] Failed to import real InferenceWrapper: {e}. Falling back to DummyWrapper.")
        return DummyWrapper()


class DummyWrapper:
    """A very small deterministic wrapper used for CI and smoke tests.

    It mirrors the detection JSON shape but computes the wrapper score using
    the same lightweight keyword rules as `analyze_message_mock` so parity
    runs are reproducible without heavy ML dependencies.
    """
    def __init__(self):
        self.metadata = {
            'heuristic_weight': 0.5,
            'severity_thresholds': {'low': 0.5, 'medium': 0.6, 'high': 0.75},
            'modelVersion': 'dummy-0.0.0'
        }

    def infer(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # use analyze_message_mock rules to compute a deterministic mock score
        msg = {'id': payload.get('messageId', 'd-1'), 'channel': payload.get('channel', 'sms'), 'body': payload.get('body', '')}
        m = analyze_message_mock(msg)
        score = m['score']
        severity = 'high' if score >= self.metadata['severity_thresholds']['high'] else ('medium' if score >= self.metadata['severity_thresholds']['medium'] else ('low' if score >= self.metadata['severity_thresholds']['low'] else 'safe'))
        detection = {
            'score': score,
            'detectionId': 'dummy-' + (payload.get('messageId') or '1'),
            'modelVersion': self.metadata.get('modelVersion'),
            'createdAt': None,
            'latencyMs': 0,
            'message': {'messageId': payload.get('messageId'), 'channel': payload.get('channel'), 'sender': payload.get('sender')},
            'matches': m['matches'],
            'risk': {
                'score': score,
                'severity': severity,
                'label': 'Likely phishing' if score >= 0.5 else 'Likely safe',
                'confidence': score,
                'factors': []
            },
            'actions': {'recommended': 'report', 'rationale': 'dummy'},
            'metadata': {}
        }
        detection['raw_model_score'] = round(float(score), 4)
        detection['heuristic_score'] = None
        detection['combined_score_pre_clamp'] = round(float(score), 4)
        return detection


# Mock messages ported from lib/detection/mockDetection.ts
MOCK_MESSAGES: List[Dict[str, Any]] = [
    {
        "id": "mock-1",
        "sender": "UBA Secure",
        "channel": "sms",
        "body": "UBA Alert: Your account will be suspended within 24 hours. Verify your account now at http://uba-secure-check.com to avoid blockage.",
        "receivedAt": "2025-10-08T08:15:00Z",
    },
    {
        "id": "mock-2",
        "sender": "Tax Grant",
        "channel": "sms",
        "body": "Congratulations! You qualify for a special tax rebate. Tap this link to claim within 12 hours: https://bit.ly/rebatesafrica",
        "receivedAt": "2025-10-08T09:02:00Z",
    },
    {
        "id": "mock-3",
        "sender": "MTN Nigeria",
        "channel": "sms",
        "body": "Dear customer, your SIM will be deactivated today. Confirm your NIN immediately via http://mtn-verify.ng and enter your OTP.",
        "receivedAt": "2025-10-08T09:45:00Z",
    },
    {
        "id": "mock-4",
        "sender": "HR Payroll",
        "channel": "email",
        "body": "We need you to update your payroll information before salaries are processed. Click the link and input your banking PIN to continue.",
        "receivedAt": "2025-10-08T10:15:00Z",
    },
    {
        "id": "mock-5",
        "sender": "Airtel Rewards",
        "channel": "sms",
        "body": "You have been selected for an Airtel Rewards gift. Act now and claim your prize code: http://airtel-bonus.win",
        "receivedAt": "2025-10-08T11:00:00Z",
    },
    {
        "id": "mock-6",
        "sender": "WhatsApp Support",
        "channel": "whatsapp",
        "body": "WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to you. Failure to respond means suspension.",
        "receivedAt": "2025-10-08T11:30:00Z",
    },
    {
        "id": "mock-7",
        "sender": "Stanbic IBTC",
        "channel": "sms",
        "body": "Your Stanbic account has been flagged. Update your BVN immediately using this secure portal: http://stanbic-review.info",
        "receivedAt": "2025-10-08T12:00:00Z",
    },
]

# Add a few non-phishing / benign messages to check false positives
BENIGN_MESSAGES: List[Dict[str, Any]] = [
    {
        "id": "benign-1",
        "sender": "Mom",
        "channel": "sms",
        "body": "Hey, are we still on for dinner tonight at 7?",
        "receivedAt": "2025-10-08T13:00:00Z",
    },
    {
        "id": "benign-2",
        "sender": "ShopXYZ",
        "channel": "email",
        "body": "Your order #12345 has shipped. Track at https://shopxyz.com/track/12345",
        "receivedAt": "2025-10-08T14:00:00Z",
    },
    {
        "id": "benign-3",
        "sender": "Bank Alert",
        "channel": "sms",
        "body": "Your account ending 4321 was credited with NGN 5,000.00 on 2025-10-08.",
        "receivedAt": "2025-10-08T15:00:00Z",
    },
    {
        "id": "benign-4",
        "sender": "DeliveryCo",
        "channel": "whatsapp",
        "body": "Your package is out for delivery and will arrive today between 2-5pm.",
        "receivedAt": "2025-10-08T16:00:00Z",
    },
    {
        "id": "benign-5",
        "sender": "Newsletter",
        "channel": "email",
        "body": "Monthly newsletter: tips to keep your account secure.",
        "receivedAt": "2025-10-08T17:00:00Z",
    },
]

# Merge mocks and benigns for a combined sweep
ALL_MESSAGES = MOCK_MESSAGES + BENIGN_MESSAGES


def get_messages_for_language(language: str = 'en') -> List[Dict[str, Any]]:
    """Try to load language-specific mock messages from `mock_messages/{language}.json`.

    Fallback to the embedded `ALL_MESSAGES` if no file is present.
    """
    msg_dir = os.path.join(os.path.dirname(__file__), 'mock_messages')
    lang_file = os.path.join(msg_dir, f"{language}.json")
    if os.path.exists(lang_file):
        try:
            with open(lang_file, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
                return data
        except Exception:
            pass
    return ALL_MESSAGES


KEYWORD_RULES = [
    (re.compile(r"(urgent|immediately|act now|within 24 hours)", re.I), 0.25, 'Urgency language'),
    (re.compile(r"(verify|confirm|update) (your |)account", re.I), 0.2, 'Account verification request'),
    (re.compile(r"(click|tap) (the |this |)link", re.I), 0.2, 'Link-based call-to-action'),
    (re.compile(r"(suspend|deactivate)d? (your |)account", re.I), 0.15, 'Threat of suspension'),
    (re.compile(r"(bank|financial|atm|card)", re.I), 0.1, 'Financial institution reference'),
    (re.compile(r"(otp|one-time password|pin)", re.I), 0.15, 'Credential or OTP request'),
    (re.compile(r"(gift|prize|reward|lottery)", re.I), 0.18, 'Unexpected reward'),
]

BASE_SCORES = {
    'sms': 0.25,
    'whatsapp': 0.2,
    'email': 0.15,
}


def clamp_score(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 0.99:
        return 0.99
    return round(value, 2)


def extract_excerpt(body: str, pattern: re.Pattern) -> str:
    m = pattern.search(body)
    return m.group(0) if m else ''


def analyze_message_mock(message: Dict[str, Any]) -> Dict[str, Any]:
    matches = []
    score = BASE_SCORES.get(message.get('channel'), 0.1)
    body = message.get('body', '')
    for pat, weight, label in KEYWORD_RULES:
        if pat.search(body):
            matches.append({'label': label, 'excerpt': extract_excerpt(body, pat), 'weight': weight})
            score += weight
    return {'message': message, 'score': clamp_score(score), 'matches': matches}


def run_parity(output_path: str = None, language: str = 'en', wrapper=None):
    if wrapper is None:
        wrapper = make_wrapper(use_dummy=False, language=language)
    diffs = process_messages(wrapper, language=language)

    if output_path is None:
        output_path = os.path.join(os.getcwd(), 'phishing_detector_package', 'mock_parity.jsonl')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as fh:
        for d in diffs:
            fh.write(json.dumps(d) + "\n")

    print(f"Wrote parity results to {output_path}")
    return diffs


def process_messages(wrapper, language: str = 'en') -> List[Dict[str, Any]]:
    results = []
    diffs: List[Dict[str, Any]] = []
    for msg in ALL_MESSAGES:
        mock = analyze_message_mock(msg)

        payload = {
            'messageId': msg['id'],
            'channel': msg['channel'],
            'sender': msg['sender'],
            'body': msg['body'],
            'receivedAt': msg['receivedAt'],
            'language': language,
            'isTrustedSender': False,
            'telemetryOptIn': False,
            'shieldPaused': False,
            'appVersion': '1.0.0'
        }

        det = wrapper.infer(payload)

        # compose comparison and include debug fields from detection if present
        wrapper_score = det.get('risk', {}).get('score')
        wrapper_matches = det.get('matches', [])
        mock_score = mock['score']
        mock_matches = mock['matches']

        raw_model_score = det.get('raw_model_score')
        heuristic_score = det.get('heuristic_score')
        combined_pre_clamp = det.get('combined_score_pre_clamp')

        diff = {
            'id': msg['id'],
            'mock_score': mock_score,
            'wrapper_score': wrapper_score,
            'score_delta': round((wrapper_score - mock_score) if wrapper_score is not None else None, 2),
            'mock_matches': mock_matches,
            'wrapper_matches': wrapper_matches,
            'raw_model_score': raw_model_score,
            'heuristic_score': heuristic_score,
            'combined_score_pre_clamp': combined_pre_clamp,
            'detection': det
        }
        results.append(det)
        diffs.append(diff)

        # Print body so you can visually inspect examples quickly
        print(f"Message {msg['id']} body: {msg.get('body')}\n")
        print(f"  mock_score={mock_score}  wrapper_score={wrapper_score}  delta={diff['score_delta']}")
        print(f"  raw_model_score={raw_model_score}  heuristic_score={heuristic_score}  combined_pre_clamp={combined_pre_clamp}")
        print(f"  mock matches: {[m['label'] for m in mock_matches]}")
        print(f"  wrapper factors/matches: {[m.get('label') for m in wrapper_matches]}\n")

    return diffs


def run_sweep(weights: List[float], output_path: str = None, language: str = 'en', wrapper=None) -> List[Dict[str, Any]]:
    # Create wrapper once and override heuristic_weight per trial
    if wrapper is None:
        wrapper = make_wrapper(use_dummy=False, language=language)
    summary: List[Dict[str, Any]] = []
    # Pre-compute mock scores and initialize per-message aggregator
    per_message_scores: Dict[str, Dict[str, Any]] = {}
    for msg in ALL_MESSAGES:
        m = analyze_message_mock(msg)
        cat = 'mock' if msg['id'].startswith('mock-') else 'benign'
        per_message_scores[msg['id']] = {
            'id': msg['id'],
            'category': cat,
            'mock_score': m['score'],
            'records': []
        }

    # detection threshold (UI "show as alert") from metadata
    thr_meta = wrapper.metadata.get('severity_thresholds', {})
    low_threshold = float(thr_meta.get('low', 0.5))

    for w in weights:
        print(f"\nRunning sweep with heuristic_weight={w}\n")
        # set metadata override
        wrapper.metadata['heuristic_weight'] = float(w)
        diffs = process_messages(wrapper, language=language)

        # metrics: consider mock messages ids starting with 'mock-' and benign with 'benign-'
        mock_diffs = [d for d in diffs if d['id'].startswith('mock-')]
        benign_diffs = [d for d in diffs if d['id'].startswith('benign-')]

        # compute metrics
        mock_total = len(mock_diffs)
        benign_total = len(benign_diffs)
        mock_tp = sum(1 for d in mock_diffs if (d['wrapper_score'] or 0) >= low_threshold)
        benign_fp = sum(1 for d in benign_diffs if (d['wrapper_score'] or 0) >= low_threshold)

        avg_delta = None
        if mock_total:
            avg_delta = sum(abs((d['wrapper_score'] or 0) - (d['mock_score'] or 0)) for d in mock_diffs) / mock_total

        rec = {
            'heuristic_weight': w,
            'mock_tp_rate': mock_tp / mock_total if mock_total else None,
            'benign_fp_rate': benign_fp / benign_total if benign_total else None,
            'avg_mock_delta': round(avg_delta, 4) if avg_delta is not None else None,
        }
        summary.append(rec)

        # write per-weight diffs to file for later inspection
        if output_path:
            base, ext = os.path.splitext(output_path)
            fname = f"{base}_{language}_w{str(w).replace('.', '_')}{ext}"
        else:
            fname = os.path.join(os.getcwd(), 'phishing_detector_package', f'mock_parity_{language}_w{str(w).replace('.', '_')}.jsonl')
        os.makedirs(os.path.dirname(fname), exist_ok=True)
        with open(fname, 'w', encoding='utf-8') as fh:
            for d in diffs:
                fh.write(json.dumps(d) + "\n")
                # append per-message score record for CSV aggregation
                pid = d['id']
                per_message_scores.setdefault(pid, {'id': pid, 'category': ('mock' if pid.startswith('mock-') else 'benign'), 'mock_score': d.get('mock_score'), 'records': []})
                per_message_scores[pid]['records'].append({
                    'weight': w,
                    'wrapper_score': d.get('wrapper_score'),
                    'wrapper_severity': (d.get('detection', {}).get('risk') or {}).get('severity')
                })
        print(f"Wrote per-weight parity results to {fname}")

    # after all weights, write a CSV summarizing per-message scores across weights and flips
    csv_path = (output_path and os.path.splitext(output_path)[0] + '_per_message.csv') or os.path.join(os.getcwd(), 'phishing_detector_package', 'mock_parity_per_message.csv')
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    weight_cols = [f"w{str(w).replace('.', '_')}" for w in weights]
    # build header: id, category, mock_score, then for each weight: score_wX, sev_wX, detect_wX
    header = ['id', 'category', 'mock_score']
    for w in weights:
        suf = str(w).replace('.', '_')
        header += [f'score_w{suf}', f'sev_w{suf}', f'detect_w{suf}']
    # include flips count for easy sorting/filtering
    header += ['flips']

    flips_summary = []
    with open(csv_path, 'w', newline='', encoding='utf-8') as csvfh:
        writer = csv.DictWriter(csvfh, fieldnames=header)
        writer.writeheader()
        for pid, entry in per_message_scores.items():
            row = {'id': pid, 'category': entry.get('category'), 'mock_score': entry.get('mock_score')}
            # create a map from weight->record for quick lookup
            rec_map = {r['weight']: r for r in entry['records']}
            last_detect = None
            flips = []
            for w in weights:
                suf = str(w).replace('.', '_')
                r = rec_map.get(w)
                score = round(float(r['wrapper_score']), 2) if r and r.get('wrapper_score') is not None else ''
                sev = r.get('wrapper_severity') if r else ''
                detected = False
                try:
                    detected = (float(r['wrapper_score']) >= low_threshold) if r and r.get('wrapper_score') is not None else False
                except Exception:
                    detected = False
                row[f'score_w{suf}'] = score
                row[f'sev_w{suf}'] = sev
                row[f'detect_w{suf}'] = int(detected)
                if last_detect is None:
                    last_detect = detected
                else:
                    if detected != last_detect:
                        flips.append({'from': int(last_detect), 'to': int(detected), 'at_weight': w})
                        last_detect = detected
            row['flips'] = len(flips)
            if flips:
                flips_summary.append({'id': pid, 'flips': flips})
            writer.writerow(row)

    # also write flips summary JSON
    flips_path = (output_path and os.path.splitext(output_path)[0] + '_flips.json') or os.path.join(os.getcwd(), 'phishing_detector_package', 'mock_parity_flips.json')
    with open(flips_path, 'w', encoding='utf-8') as fh:
        json.dump(flips_summary, fh, indent=2)
    print(f"Wrote per-message CSV to {csv_path} and flips summary to {flips_path}")

    # write summary
    summary_path = (output_path and os.path.splitext(output_path)[0] + f'_{language}_summary.json') or os.path.join(os.getcwd(), 'phishing_detector_package', f'mock_parity_{language}_sweep_summary.json')
    with open(summary_path, 'w', encoding='utf-8') as fh:
        json.dump(summary, fh, indent=2)
    print(f"Wrote sweep summary to {summary_path}")
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run parity checks between JS mock rules and the inference wrapper')
    parser.add_argument('--weights', type=str, default=None, help='Comma-separated heuristic_weight values to sweep, e.g. 0,0.05,0.1')
    parser.add_argument('--out', type=str, default=None, help='Output path prefix for parity JSONL or summary')
    parser.add_argument('--languages', type=str, default=None, help='Comma-separated languages to run (en,fr,sw,..). If omitted runs default en')
    parser.add_argument('--use-dummy-wrapper', action='store_true', help='Use a lightweight DummyWrapper (no TF/transformers) - good for CI')
    args = parser.parse_args()

    langs = None
    if args.languages:
        langs = [p.strip() for p in args.languages.split(',') if p.strip()]

    if args.weights:
        parts = [p.strip() for p in args.weights.split(',') if p.strip()]
        weights = []
        for p in parts:
            try:
                weights.append(float(p))
            except ValueError:
                print(f"Invalid weight '{p}' - skipping")
        if weights:
            if langs:
                for L in langs:
                    wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language=L)
                    run_sweep(weights, output_path=args.out, language=L, wrapper=wrapper)
            else:
                wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language='en')
                run_sweep(weights, output_path=args.out, wrapper=wrapper)
        else:
            print('No valid weights provided; running single parity run instead')
            if langs:
                for L in langs:
                    wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language=L)
                    run_parity(output_path=args.out, language=L, wrapper=wrapper)
            else:
                wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language='en')
                run_parity(output_path=args.out, wrapper=wrapper)
    else:
        if args.languages:
            langs = [p.strip() for p in args.languages.split(',') if p.strip()]
            for L in langs:
                wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language=L)
                run_parity(output_path=args.out, language=L, wrapper=wrapper)
        else:
            wrapper = make_wrapper(use_dummy=args.use_dummy_wrapper, language='en')
            run_parity(output_path=args.out, wrapper=wrapper)
