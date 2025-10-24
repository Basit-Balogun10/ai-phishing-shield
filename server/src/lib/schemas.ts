import { z } from 'zod';

export const EnvelopeSchema = z.object({
  id: z.string(),
  channel: z.union([z.literal('feedback'), z.literal('telemetry'), z.literal('report')]),
  payload: z.record(z.any()),
  createdAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid timestamp' }),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
