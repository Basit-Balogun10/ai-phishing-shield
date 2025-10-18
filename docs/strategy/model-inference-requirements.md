# Model Inference Requirements

## Why this contract matters

- The alerts list, detail modal, and dashboard tiles all consume the same detection payload.
- We need a single response shape that works for real-time scans, background sweeps, and user-triggered manual analysis.
- The mobile client caches detections locally, so identifiers and versioning are critical for idempotency.
- Inference runs entirely on-device, so this contract doubles as the interface between the React Native layer and the locally bundled TensorFlow Lite runtime.

## Input payload the model must accept

| Group | Field | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Message | `messageId` | string | ✅ | Stable identifier for deduplication and feedback reconciliation. |
|  | `channel` | `"sms" \| "whatsapp" \| "email" \| "push"` | ✅ | Expandable enum; model should be resilient to new channels. |
|  | `sender` | string | ✅ | Raw sender number, email, or handle. |
|  | `body` | string | ✅ | UTF-8 message content. Empty strings should short-circuit to `safe`. |
|  | `subject` | string | ➖ | Optional email/push subject line. |
|  | `receivedAt` | ISO-8601 string | ✅ | Used for sorting, latency metrics, and quiet-hour logic within the client. |
|  | `attachments` | array of objects | ➖ | `{ type: "image" \| "file", uri: string }` for future OCR or file scans. |
| Locale | `language` | BCP-47 string | ✅ | Selected in-app language (e.g., `en`, `fr`, `yo`). |
|  | `deviceLocale` | BCP-47 string | ➖ | Native device locale for fallback translation. |
| Context | `isTrustedSender` | boolean | ✅ | Set by client using trusted contacts list. |
|  | `userRiskTolerance` | `"strict" \| "balanced" \| "lenient"` | ➖ | Derived from future settings; default `balanced`. |
|  | `recentDetections` | array | ➖ | Last N detection IDs with severity; supports contextual tuning. |
|  | `telemetryOptIn` | boolean | ✅ | Toggles the extra diagnostic details we log locally. |
|  | `shieldPaused` | boolean | ✅ | Allows the client to short-circuit costly inference when the shield is paused. |
| Device | `appVersion` | string | ✅ | For rollout gating and schema migrations. |
|  | `osVersion` | string | ➖ | Optional; useful for platform-specific heuristics. |
|  | `deviceModel` | string | ➖ | Useful for latency benchmarking. |

### Derived/optional inputs the client can supply when available

- `threadParticipants`: Other phone numbers or emails in the same conversation thread.
- `normalizedBody`: Lowercased, diacritics-removed text to reuse across repeated scans.
- `linkMetadata[]`: List of URLs extracted client-side with preliminary classification.
- `previousFeedback`: Last known user decision (`confirmed`, `false_positive`) to adjust learning.

## Expected model output contract

The on-device inference module should return the following JSON payload:

```json
{
  "detectionId": "uuid",
  "modelVersion": "v0.4.0",
  "createdAt": "2025-10-17T12:45:08.123Z",
  "latencyMs": 183,
  "message": {
    "messageId": "string",
    "channel": "sms",
    "sender": "UBA Secure",
    "receivedAt": "2025-10-17T11:59:50Z"
  },
  "risk": {
    "score": 0.82,
    "severity": "high",
    "label": "Likely phishing",
    "confidence": 0.91,
    "factors": [
      {
        "label": "Urgency language",
        "excerpt": "will be suspended within 24 hours",
        "weight": 0.18,
        "evidenceType": "keyword",
        "offset": [34, 72]
      }
    ]
  },
  "actions": {
    "recommended": "block_sender",
    "rationale": "Multiple high-risk signals and untrusted source",
    "secondary": ["report", "mark_trusted_if_wrong"]
  },
  "metadata": {
    "channelFeatures": {
      "links": [
        {
          "url": "http://uba-secure-check.com",
          "domain": "uba-secure-check.com",
          "classification": "suspicious",
          "reputationScore": 0.12
        }
      ],
      "entityMentions": ["UBA"],
      "language": "en"
    },
    "explanations": [
      "Threat of suspension combined with credential request",
      "Link domain not in trusted whitelist"
    ],
    "heuristics": {
      "looksLikeOtpCapture": true,
      "spoofsKnownBrand": true
    }
  }
}
```

### Field breakdown

- **`detectionId`** — unique, stable string used by the app to merge duplicates and attach accuracy feedback.
- **`modelVersion`** — ties results to downloadable models offered in the manager; must match catalog naming.
- **`risk.score`** — normalized float `0.0 – 1.0` with two decimal precision.
- **`risk.severity`** — enum: `safe`, `low`, `medium`, `high`. UI colors are mapped to this tier.
- **`risk.label`** — localized-ready plain text (the client will pass it through i18n if necessary).
- **`risk.factors[]`** — drives the “Detected signals” cards:
  - `label`: short title (<= 40 chars).
  - `excerpt`: snippet quoted in UI (use original casing/punctuation).
  - `weight`: optional contribution weight `0.0 – 1.0`.
  - `evidenceType`: (`keyword`, `domain`, `sender_history`, etc.) for analytics.
  - `offset`: `[startIndex, endIndex]` relative to original body for highlighting; optional but preferred.
- **`actions`** — recommended remediation; `secondary` array keeps things future-proof.
- **`metadata.channelFeatures.links[]`** — optional annotation for link previews; will surface in future UI.
- **`metadata.explanations[]`** — human-readable sentences for diagnostics and local logging.

### Severity expectations

| Severity | Score range | UI behaviour |
| --- | --- | --- |
| `safe` | 0.00 – 0.39 | Show “Safe” banner, no warning card. |
| `low` | 0.40 – 0.59 | Neutral caution; display yellow tag. |
| `medium` | 0.60 – 0.79 | Orange warning, eligible for push alert. |
| `high` | 0.80 – 0.99 | Red banner, blocks by default, requests extra confirmation to dismiss. |

If the model is uncertain or heuristics disagree, return `severity: "low"` with `confidence < 0.5` and populate `metadata.explanations` with the conflict reason.

### Error & fallback contract

- If inference fails (e.g., model not yet downloaded), return `{ "error": "model_unavailable" }` so the caller can queue a retry once the bundle is restored.
- For malformed input, throw or return `{ "error": "invalid_payload", "field": "body" }` so the caller can log and drop the message locally.
- When the shield is paused (`shieldPaused: true`), short-circuit and return `{ "skipped": true }`; the UI surfaces a “scan paused” badge without hitting the model.

### Example invocation

#### Input payload

```json
{
  "messageId": "sms-9af2",
  "channel": "sms",
  "sender": "+2349001234567",
  "body": "URGENT: Your Stanbic account is frozen. Update BVN within 12 hours at http://stanbic-review.info",
  "receivedAt": "2025-10-17T11:58:05Z",
  "language": "en",
  "isTrustedSender": false,
  "telemetryOptIn": true,
  "shieldPaused": false,
  "appVersion": "1.0.0",
  "recentDetections": [
    { "detectionId": "sms-8ce1", "severity": "medium", "detectedAt": "2025-10-17T09:15:11Z" }
  ]
}
```

#### Output payload

```json
{
  "detectionId": "det-2d8f9",
  "modelVersion": "v0.3.0",
  "createdAt": "2025-10-17T11:58:06.210Z",
  "latencyMs": 142,
  "risk": {
    "score": 0.88,
    "severity": "high",
    "label": "Likely phishing",
    "confidence": 0.93,
    "factors": [
      {
        "label": "Threat of suspension",
        "excerpt": "account is frozen",
        "weight": 0.22,
        "evidenceType": "keyword"
      },
      {
        "label": "Suspicious link domain",
        "excerpt": "stanbic-review.info",
        "weight": 0.18,
        "evidenceType": "url_reputation"
      }
    ]
  },
  "actions": {
    "recommended": "block_sender",
    "secondary": ["report"]
  },
  "metadata": {
    "channelFeatures": {
      "links": [
        {
          "url": "http://stanbic-review.info",
          "domain": "stanbic-review.info",
          "classification": "suspicious"
        }
      ]
    }
  }
}
```

## Open questions for the training team

1. **Language coverage** – confirm which locales ship in v1 of the model (the app UI currently supports EN, FR, SW, YO, IG, HA, AM, AR, PCM).
2. **Trusted sender influence** – should `isTrustedSender = true` shift thresholds or trigger a “double-check” ruleset instead of skipping scans?
3. **Feedback loop** – we plan to send user accuracy feedback; specify how that will feed back into active learning.
4. **Latency SLAs** – mobile UI expects <250 ms for inline scans and <1 s for background batches; confirm if achievable on mid-tier Android hardware.
5. **Skipped inference** – define when the local runtime should legitimately return `{ "skipped": true }` and what retry semantics should be.

## Next steps

- Align on a canonical JSON schema and publish via JSON Schema for the TypeScript bridge.
- Create integration tests that replay our `mockDetection` fixtures against the local inference module.
- Coordinate with the analytics team to ensure `risk.factors.weight` values align with the “Detected signals” visuals (weights sum approx to score contributions).
