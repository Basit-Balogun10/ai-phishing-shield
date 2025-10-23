import { z } from 'zod';

export const FeedbackPayloadSchema = z.object({
  recordId: z.string(),
  status: z.union([z.literal('confirmed'), z.literal('false_positive')]),
  submittedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  source: z.union([z.literal('historical'), z.literal('simulated')]),
  channel: z.union([z.literal('sms'), z.literal('whatsapp'), z.literal('email')]),
  score: z.number().min(0).max(1),
});

export const TelemetryPayloadSchema = z.object({
  name: z.string(),
  payload: z.record(z.any()),
  timestamp: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
});

export const ReportPayloadSchema = z.object({
  reportId: z.string(),
  message: z.object({
    sender: z.string(),
    channel: z.union([z.literal('sms'), z.literal('whatsapp'), z.literal('email')]),
    body: z.string(),
    receivedAt: z.string().optional(),
  }),
  category: z.union([
    z.literal('phishing'),
    z.literal('suspicious'),
    z.literal('false_positive'),
    z.literal('other'),
  ]),
  comment: z.string().optional(),
  createdAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  attachments: z.array(z.string()).optional(),
});
