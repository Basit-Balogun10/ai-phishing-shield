import os
import json
import random
import argparse
from typing import List

import pandas as pd

from infer import InferenceWrapper

ROOT = os.getcwd()
PACKAGE_DIR = os.path.join(ROOT, "phishing_detector_package")
TEST_CSV = os.path.join(ROOT, "data", "processed", "test.csv")
OUT_FILE = os.path.join(PACKAGE_DIR, "sample_detections.jsonl")


def load_samples(n: int = 200) -> List[dict]:
    if not os.path.exists(TEST_CSV):
        raise FileNotFoundError(f"test.csv not found at {TEST_CSV}")
    df = pd.read_csv(TEST_CSV)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    rows = df.head(n).to_dict(orient="records")
    payloads = []
    for r in rows:
        payloads.append(
            {
                "messageId": str(
                    r.get("messageId", "msg-" + str(random.randint(1, 100000)))
                ),
                "body": r.get("body") or r.get("message") or "",
                "sender": r.get("sender"),
                "receivedAt": r.get("received_at")
                if "received_at" in r
                else r.get("receivedAt"),
                "channel": r.get("channel", "sms"),
                "language": r.get("language"),
            }
        )
    return payloads


def run(n: int = 200):
    wrapper = InferenceWrapper()
    samples = load_samples(n)
    os.makedirs(PACKAGE_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        for p in samples:
            det = wrapper.infer(p)
            fh.write(json.dumps(det) + "\n")
    print(f"Wrote {n} detections to {OUT_FILE}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-n", "--num", type=int, default=200, help="Number of samples to run"
    )
    args = parser.parse_args()
    run(args.num)


if __name__ == "__main__":
    main()
