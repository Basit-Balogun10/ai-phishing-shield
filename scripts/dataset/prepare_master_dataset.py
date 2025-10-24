#!/usr/bin/env python3
"""Builds the consolidated multilingual phishing detection dataset.

This script ingests the raw datasets located in the repository `dataset/` directory
(along with any optional synthetic outputs placed under `phishing_dataset/`),
normalises them to a shared schema, balances label/source contributions, and
emits the train/validation/test splits plus accompanying documentation into
`data/processed/`.

Usage
-----
    python scripts/dataset/prepare_master_dataset.py [--dry-run]

The optional `--dry-run` flag performs the end-to-end processing pipeline
without writing artefacts to disk – handy for experimentation or CI checks.
"""
from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


# ---------------------------------------------------------------------------
# Paths & Constants
# ---------------------------------------------------------------------------
THIS_FILE = Path(__file__).resolve()
REPO_ROOT = THIS_FILE.parents[2]
RAW_DATA_DIR = REPO_ROOT / "dataset"
SYNTHETIC_DIR = REPO_ROOT / "phishing_dataset"
OUTPUT_DIR = REPO_ROOT / "data" / "processed"

RANDOM_SEED = 52
np.random.seed(RANDOM_SEED)
random.seed(RANDOM_SEED)

# Target balance constraints
TARGET_PHISHING_RATIO = 0.35  # within 0.30-0.40 per project requirements
MAX_SOURCE_SHARE = 0.40  # no single source should exceed 40%

# Minimum message length safeguard (strip obvious noise)
MIN_MESSAGE_LEN = 6

# Languages that should *definitely* appear in the final corpus
REQUIRED_LANGUAGES = {
    "en",
    "fr",
    "sw",
    "yo",
    "ig",
    "ha",
    "pcm",
    "ar",
    "am",
}

# Mapping columns (from the augmented/multilingual datasets) to BCP-47 tags
AUGMENTED_LANGUAGE_MAP: Dict[str, str] = {
    "text": "en",
    "text_fr": "fr",
    "text_ar": "ar",
    "text_pt": "pt",
    "text_es": "es",
    "text_hi": "hi",
    "text_de": "de",
    "text_ru": "ru",
    "text_bn": "bn",
    "text_ja": "ja",
    "text_id": "id",
    "text_ur": "ur",
    "text_pa": "pa",
    "text_jv": "jv",
    "text_tr": "tr",
    "text_ko": "ko",
    "text_mr": "mr",
    "text_uk": "uk",
    "text_sv": "sv",
    "text_no": "no",
}

# Phone prefix hints per language/region (used to synthesise sender metadata)
PHONE_PREFIX_HINTS: Dict[str, List[str]] = {
    "en": ["+44", "+234", "+65", "+27"],
    "fr": ["+33", "+225", "+221", "+223"],
    "sw": ["+255", "+254"],
    "yo": ["+234"],
    "ig": ["+234"],
    "ha": ["+234", "+227", "+234"],
    "pcm": ["+234"],
    "ar": ["+20", "+212", "+971"],
    "am": ["+251"],
    "pt": ["+351", "+258"],
    "es": ["+34", "+34"],
    "hi": ["+91"],
    "de": ["+49"],
    "ru": ["+7"],
    "bn": ["+880"],
    "ja": ["+81"],
    "id": ["+62"],
    "ur": ["+92"],
    "pa": ["+91"],
    "jv": ["+62"],
    "tr": ["+90"],
    "ko": ["+82"],
    "mr": ["+91"],
    "uk": ["+380"],
    "sv": ["+46"],
    "no": ["+47"],
}


@dataclass
class DatasetFrame:
    name: str
    frame: pd.DataFrame


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------
def _normalise_label(raw: str) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    value = raw.strip().lower()
    if value in {"spam", "phishing", "scam", "smishing"}:
        return "phishing"
    if value in {"ham", "legitimate", "safe", "normal"}:
        return "legitimate"
    return None


def _generate_sender(language: str) -> str:
    prefixes = PHONE_PREFIX_HINTS.get(language, ["+234"])
    prefix = random.choice(prefixes)
    digits_needed = 10 if prefix.startswith("+") else 11
    remaining = digits_needed - len(prefix.replace("+", ""))
    remaining = max(4, remaining)
    number = "".join(str(random.randint(0, 9)) for _ in range(remaining))
    return f"{prefix}{number}"


def _generate_received_at() -> str:
    start = datetime.now() - timedelta(days=730)
    delta = timedelta(seconds=random.randint(0, 730 * 24 * 3600))
    return (start + delta).replace(microsecond=0).isoformat()


SCAM_KEYWORDS: Dict[str, Iterable[str]] = {
    "account_suspension": (
        "suspend",
        "deactivate",
        "login",
        "verify",
        "bvn",
        "security",
        "blocked",
        "update",
        "limit",
    ),
    "otp_request": (
        "otp",
        "code",
        "pin",
        "token",
        "verification",
        "auth",
    ),
    "fake_credit": (
        "credit",
        "credited",
        "transfer",
        "deposit",
        "wallet",
        "claim",
        "received",
    ),
    "prize_lottery": (
        "congrat",
        "winner",
        "lottery",
        "jackpot",
        "prize",
        "reward",
    ),
    "loan_offer": (
        "loan",
        "cash",
        "approval",
        "interest",
        "investment",
    ),
    "help_scam": (
        "help",
        "hospital",
        "stuck",
        "urgent",
        "send me",
        "please",
    ),
    "customer_service": (
        "call",
        "customer care",
        "agent",
        "hotline",
        "support",
    ),
    "phishing_link": (
        "http://",
        "https://",
        "www.",
        "bit.ly",
    ),
}


def infer_scam_type(message: str, label: str) -> str:
    if not isinstance(message, str) or not message:
        return "unknown"
    if label == "legitimate":
        return "legitimate_general"

    text = message.lower()
    for scam_type, keywords in SCAM_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return scam_type
    return "phishing_other"


def tidy_dataframe(name: str, df: pd.DataFrame) -> DatasetFrame:
    base = df.copy()
    base["message"] = base["message"].astype(str).str.strip()
    base = base[base["message"].str.len() >= MIN_MESSAGE_LEN]

    base["label"] = base["label"].apply(_normalise_label)
    base = base.dropna(subset=["label", "language", "message"])

    base["language"] = base["language"].str.strip().str.lower()
    base["source"] = name
    base["channel"] = "sms"
    base["sender"] = base["language"].apply(_generate_sender)

    received_at_series = (
        base["received_at"]
        if "received_at" in base.columns
        else pd.Series("", index=base.index, dtype="object")
    )
    base["received_at"] = received_at_series.fillna("").apply(
        lambda ts: ts if isinstance(ts, str) and ts.strip() else _generate_received_at()
    )
    base["scam_type"] = base.apply(
        lambda row: infer_scam_type(row["message"], row["label"]), axis=1
    )

    base = base.drop_duplicates(subset=["message", "language"])
    return DatasetFrame(name=name, frame=base)


# ---------------------------------------------------------------------------
# Dataset-specific loaders
# ---------------------------------------------------------------------------
def load_sms_spam_collection() -> DatasetFrame:
    path = RAW_DATA_DIR / "sms-spam-collection"
    df = pd.read_csv(path, sep="\t", header=None, names=["label", "message"], quoting=3)
    df["language"] = "en"
    return tidy_dataframe("uci_sms_spam", df)


def load_kaggle_multilingual() -> DatasetFrame:
    path = RAW_DATA_DIR / "multilingual-spam-data.csv"
    raw = pd.read_csv(path)
    frames: List[pd.DataFrame] = []

    column_language = {
        "text_fr": "fr",
        "text_hi": "hi",
        "text_de": "de",
        "text": "en",
    }
    for column, language in column_language.items():
        if column not in raw.columns:
            continue
        temp = raw[["labels", column]].rename(
            columns={"labels": "label", column: "message"}
        )
        temp["language"] = language
        frames.append(temp)

    dataset = pd.concat(frames, ignore_index=True)
    return tidy_dataframe("kaggle_multilingual", dataset)


def load_augmented_multilingual(
    target_languages: Optional[Iterable[str]] = None,
) -> DatasetFrame:
    path = RAW_DATA_DIR / "sms-multilingual-collection-dataset-data-augmented.csv"
    raw = pd.read_csv(path)

    frames: List[pd.DataFrame] = []
    for column, language in AUGMENTED_LANGUAGE_MAP.items():
        if column not in raw.columns:
            continue
        if target_languages and language not in target_languages:
            continue
        temp = raw[["labels", column]].rename(
            columns={"labels": "label", column: "message"}
        )
        temp["language"] = language
        frames.append(temp)

    if not frames:
        return DatasetFrame(
            "huggingface_augmented",
            pd.DataFrame(columns=["message", "label", "language"]),
        )

    dataset = pd.concat(frames, ignore_index=True)
    return tidy_dataframe("huggingface_augmented", dataset)


def load_user_sms_corpus() -> DatasetFrame:
    frames: List[pd.DataFrame] = []
    for csv_file in sorted(RAW_DATA_DIR.glob("USER *.csv")):
        df = pd.read_csv(csv_file, header=None, dtype=str)
        if df.empty:
            continue

        label_series = df.iloc[:, 6].fillna("")
        message_segments = df.iloc[:, 7:].fillna("")
        message_series = message_segments.apply(
            lambda row: " ".join(seg for seg in row if seg).strip(), axis=1
        )

        temp = pd.DataFrame(
            {
                "message": message_series,
                "label": label_series,
                "language": "en",
            }
        )

        temp = temp[~temp["message"].str.lower().isin({"message", "sms"})]
        temp = temp[temp["message"].str.len() > 0]

        frames.append(temp)

    dataset = pd.concat(frames, ignore_index=True)
    return tidy_dataframe("nigeria_university_sms", dataset)


def load_synthetic_exports() -> Optional[DatasetFrame]:
    if not SYNTHETIC_DIR.exists():
        return None

    frames: List[pd.DataFrame] = []
    for csv_file in SYNTHETIC_DIR.glob("*.csv"):
        df = pd.read_csv(csv_file)
        if {"message", "label", "language", "scam_type", "source"}.issubset(df.columns):
            frames.append(df[["message", "label", "language", "scam_type", "source"]])
    if not frames:
        return None

    dataset = pd.concat(frames, ignore_index=True)
    dataset["channel"] = "sms"
    dataset["sender"] = dataset["language"].apply(_generate_sender)
    dataset["received_at"] = (
        dataset.get("received_at", pd.Series(dtype=str))
        .fillna("")
        .apply(lambda ts: ts if isinstance(ts, str) and ts else _generate_received_at())
    )

    return DatasetFrame("synthetic_generator", dataset)


# ---------------------------------------------------------------------------
# Post-processing helpers
# ---------------------------------------------------------------------------
def enforce_source_cap(df: pd.DataFrame) -> pd.DataFrame:
    total = len(df)
    max_allowed = int(total * MAX_SOURCE_SHARE)
    balanced_frames: List[pd.DataFrame] = []

    for source, group in df.groupby("source"):
        if len(group) <= max_allowed:
            balanced_frames.append(group)
            continue
        balanced_frames.append(group.sample(n=max_allowed, random_state=RANDOM_SEED))

    result = pd.concat(balanced_frames, ignore_index=True)
    return result


def adjust_label_balance(df: pd.DataFrame) -> pd.DataFrame:
    phishing = df[df["label"] == "phishing"]
    legitimate = df[df["label"] == "legitimate"]

    total_needed = len(df)
    min_phishing = int(total_needed * 0.30)
    max_phishing = int(total_needed * 0.40)
    target_phishing = int(total_needed * TARGET_PHISHING_RATIO)

    if len(phishing) > max_phishing:
        phishing = phishing.sample(n=max_phishing, random_state=RANDOM_SEED)
    elif len(phishing) < min_phishing:
        deficit = min(target_phishing, len(legitimate)) - len(phishing)
        if deficit > 0:
            phishing = pd.concat(
                [
                    phishing,
                    phishing.sample(n=deficit, replace=True, random_state=RANDOM_SEED),
                ],
                ignore_index=True,
            )

    legitimate_count = total_needed - len(phishing)
    legitimate = legitimate.sample(
        n=legitimate_count,
        replace=len(legitimate) < legitimate_count,
        random_state=RANDOM_SEED,
    )

    combined = pd.concat([phishing, legitimate], ignore_index=True)
    return combined.sample(frac=1.0, random_state=RANDOM_SEED).reset_index(drop=True)


def ensure_language_coverage(df: pd.DataFrame) -> pd.DataFrame:
    missing = REQUIRED_LANGUAGES - set(df["language"].unique())
    if missing:
        print(f"[warn] Missing required languages: {sorted(missing)}")
    return df


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
def write_dataset(artefact: str, df: pd.DataFrame, dry_run: bool) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / artefact
    if dry_run:
        print(f"[dry-run] Would write {artefact} ({len(df)} rows)")
        return
    df.to_csv(path, index=False, encoding="utf-8")
    print(f"[write] {artefact}: {len(df)} rows")


def write_statistics(df: pd.DataFrame, dry_run: bool) -> None:
    stats = {
        "total_messages": int(len(df)),
        "label_distribution": df["label"].value_counts().to_dict(),
        "languages": [],
        "sources": [],
    }

    for language, group in df.groupby("language"):
        label_counts = group["label"].value_counts(normalize=True).to_dict()
        stats["languages"].append(
            {
                "language": language,
                "count": int(len(group)),
                "phishing_ratio": round(label_counts.get("phishing", 0.0), 3),
            }
        )

    for source, group in df.groupby("source"):
        stats["sources"].append(
            {
                "source": source,
                "count": int(len(group)),
                "share": round(len(group) / len(df), 3),
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if dry_run:
        print(f"[dry-run] Would write dataset_statistics.json")
        return

    with (OUTPUT_DIR / "dataset_statistics.json").open("w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=2, ensure_ascii=False)
    print("[write] dataset_statistics.json")


def write_processing_notes(sources: List[DatasetFrame], dry_run: bool) -> None:
    lines = [
        "# Dataset Processing Notes",
        "",
        f"Generated on: {datetime.utcnow().isoformat()}Z",
        "",
        "## Source breakdown",
    ]
    for dataset in sources:
        lines.append(
            f"- **{dataset.name}** — {len(dataset.frame)} rows after normalisation"
        )
    lines.extend(
        [
            "",
            "## Normalisation steps",
            "- Trimmed whitespace and removed messages under 6 characters.",
            "- Harmonised labels to `phishing`/`legitimate`.",
            "- Annotated each row with a BCP-47 language tag.",
            "- Added synthetic sender metadata for compatibility with the inference payload schema.",
            "- Auto-assigned `scam_type` using keyword heuristics for phishing records; legitimate entries are tagged `legitimate_general`.",
            "- Deduplicated identical message-language pairs.",
            "- Enforced <=40% contribution per data source and a 35%±5 phishing ratio.",
            "- Stratified into train/validation/test splits using language + label.",
        ]
    )

    if dry_run:
        print("[dry-run] Would write processing_notes.md")
        return

    with (OUTPUT_DIR / "processing_notes.md").open("w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("[write] processing_notes.md")


# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------
def build_master_dataframe(include_synthetic: bool = True) -> List[DatasetFrame]:
    datasets: List[DatasetFrame] = [
        load_sms_spam_collection(),
        load_kaggle_multilingual(),
        load_augmented_multilingual(target_languages={"en", "fr", "ar"}),
        load_user_sms_corpus(),
    ]

    if include_synthetic:
        synthetic = load_synthetic_exports()
        if synthetic:
            datasets.append(synthetic)

    return datasets


def stratified_splits(df: pd.DataFrame, dry_run: bool) -> None:
    df = df.copy()
    df["strat_key"] = df["language"] + "__" + df["label"]

    train, temp = train_test_split(
        df,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=df["strat_key"],
    )

    validation, test = train_test_split(
        temp,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=temp["strat_key"],
    )

    for split_df in (train, validation, test):
        split_df.drop(columns=["strat_key"], inplace=True)

    write_dataset("train.csv", train, dry_run)
    write_dataset("validation.csv", validation, dry_run)
    write_dataset("test.csv", test, dry_run)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare the master multilingual phishing dataset."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the pipeline without writing output files",
    )
    parser.add_argument(
        "--without-synthetic",
        action="store_true",
        help="Skip loading synthetic generator outputs if present",
    )
    args = parser.parse_args()

    datasets = build_master_dataframe(include_synthetic=not args.without_synthetic)
    combined = pd.concat([ds.frame for ds in datasets], ignore_index=True)

    combined = ensure_language_coverage(combined)
    combined = enforce_source_cap(combined)
    combined = adjust_label_balance(combined)

    write_dataset("master_dataset.csv", combined, args.dry_run)
    stratified_splits(combined, args.dry_run)
    write_statistics(combined, args.dry_run)
    write_processing_notes(datasets, args.dry_run)


if __name__ == "__main__":
    main()
