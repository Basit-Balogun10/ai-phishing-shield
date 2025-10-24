export type MockMessage = {
  id: string;
  sender: string;
  channel: 'sms' | 'whatsapp' | 'email';
  body: string;
  receivedAt: string;
};

export type DetectionMatch = {
  label: string;
  excerpt: string;
  weight: number;
};

export type DetectionResult = {
  message: MockMessage;
  score: number;
  matches: DetectionMatch[];
};

type KeywordRule = {
  pattern: RegExp;
  weight: number;
  label: string;
};

const KEYWORD_RULES: KeywordRule[] = [
  {
    pattern: /(urgent|immediately|act now|within 24 hours)/i,
    weight: 0.25,
    label: 'Urgency language',
  },
  {
    pattern: /(verify|confirm|update) (your |)account/i,
    weight: 0.2,
    label: 'Account verification request',
  },
  {
    pattern: /(click|tap) (the |this |)link/i,
    weight: 0.2,
    label: 'Link-based call-to-action',
  },
  {
    pattern: /(suspend|deactivate)d? (your |)account/i,
    weight: 0.15,
    label: 'Threat of suspension',
  },
  {
    pattern: /(bank|financial|atm|card)/i,
    weight: 0.1,
    label: 'Financial institution reference',
  },
  {
    pattern: /(otp|one-time password|pin)/i,
    weight: 0.15,
    label: 'Credential or OTP request',
  },
  {
    pattern: /(gift|prize|reward|lottery)/i,
    weight: 0.18,
    label: 'Unexpected reward',
  },
];

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: 'mock-1',
    sender: 'UBA Secure',
    channel: 'sms',
    body: 'UBA Alert: Your account will be suspended within 24 hours. Verify your account now at http://uba-secure-check.com to avoid blockage.',
    receivedAt: '2025-10-08T08:15:00Z',
  },
  {
    id: 'mock-2',
    sender: 'Tax Grant',
    channel: 'sms',
    body: 'Congratulations! You qualify for a special tax rebate. Tap this link to claim within 12 hours: https://bit.ly/rebatesafrica',
    receivedAt: '2025-10-08T09:02:00Z',
  },
  {
    id: 'mock-3',
    sender: 'MTN Nigeria',
    channel: 'sms',
    body: 'Dear customer, your SIM will be deactivated today. Confirm your NIN immediately via http://mtn-verify.ng and enter your OTP.',
    receivedAt: '2025-10-08T09:45:00Z',
  },
  {
    id: 'mock-4',
    sender: 'HR Payroll',
    channel: 'email',
    body: 'We need you to update your payroll information before salaries are processed. Click the link and input your banking PIN to continue.',
    receivedAt: '2025-10-08T10:15:00Z',
  },
  {
    id: 'mock-5',
    sender: 'Airtel Rewards',
    channel: 'sms',
    body: 'You have been selected for an Airtel Rewards gift. Act now and claim your prize code: http://airtel-bonus.win',
    receivedAt: '2025-10-08T11:00:00Z',
  },
  {
    id: 'mock-6',
    sender: 'WhatsApp Support',
    channel: 'whatsapp',
    body: 'WhatsApp: Your chats will be deleted. Confirm your account using the OTP sent to you. Failure to respond means suspension.',
    receivedAt: '2025-10-08T11:30:00Z',
  },
  {
    id: 'mock-7',
    sender: 'Stanbic IBTC',
    channel: 'sms',
    body: 'Your Stanbic account has been flagged. Update your BVN immediately using this secure portal: http://stanbic-review.info',
    receivedAt: '2025-10-08T12:00:00Z',
  },
];

const BASE_SCORES: Record<MockMessage['channel'], number> = {
  sms: 0.25,
  whatsapp: 0.2,
  email: 0.15,
};

const clampScore = (value: number) => {
  if (value < 0) {
    return 0;
  }

  if (value > 0.99) {
    return 0.99;
  }

  return Number(value.toFixed(2));
};

const extractExcerpt = (body: string, pattern: RegExp): string => {
  const match = body.match(pattern);
  if (!match) {
    return '';
  }

  return match[0];
};

export const analyzeMessage = (message: MockMessage): DetectionResult => {
  const matches: DetectionMatch[] = [];
  let score = BASE_SCORES[message.channel] ?? 0.1;

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(message.body)) {
      matches.push({
        label: rule.label,
        excerpt: extractExcerpt(message.body, rule.pattern),
        weight: rule.weight,
      });
      score += rule.weight;
    }
  }

  return {
    message,
    score: clampScore(score),
    matches,
  };
};

const pickMessageIndex = (candidates: MockMessage[]): number => {
  if (candidates.length === 0) {
    return -1;
  }

  const offset = new Date().getMinutes();
  return offset % candidates.length;
};

export const runMockDetectionSweep = async (): Promise<DetectionResult | null> => {
  const analyses = MOCK_MESSAGES.map(analyzeMessage);
  const suspicious = analyses.filter((result) => result.score >= 0.6);

  if (suspicious.length === 0) {
    return null;
  }

  const index = pickMessageIndex(suspicious.map((item) => item.message));
  const result = suspicious[index] ?? suspicious[0];

  return result;
};

export const getMockMessages = (): MockMessage[] => {
  return [...MOCK_MESSAGES];
};

export const explainDetection = (result: DetectionResult): string => {
  if (!result.matches.length) {
    return '';
  }

  const [primary] = result.matches;
  return `${primary.label}: “${primary.excerpt}”.`;
};
