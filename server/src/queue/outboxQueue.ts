import { Queue, Worker, Job } from 'bullmq';
// Delay importing ioredis at runtime to avoid build-time typing issues.
// We'll import dynamically in initQueue if needed.

const redisUrl = process.env.REDIS_URL;

let queue: Queue | null = null;
let worker: Worker | null = null;

export const getQueue = () => queue;

export const initQueue = async (processor: (job: Job) => Promise<void>) => {
  if (!redisUrl) return null;

  // dynamic import to support optional redis and different ESM shapes
  const IORedisMod = await import('ioredis');
  const RedisCtor = (IORedisMod as any).default ?? (IORedisMod as any);
  const connection = new RedisCtor(redisUrl);
  queue = new Queue('outbox', { connection });

  worker = new Worker('outbox', async (job) => {
    await processor(job);
  }, { connection });

  // avoid unhandled errors from the Redis client
  try { connection.on('error', (err: any) => { /* log at caller */ }); } catch {}

  worker.on('failed', (job, err) => {
    console.error('outbox job failed', job?.id, err);
  });

  return { queue, worker };
};

export const enqueueOutbox = async (payload: any) => {
  if (!queue) return null;
  return queue.add('deliver', payload, { removeOnComplete: true, removeOnFail: false });
};

export const closeQueue = async () => {
  try { await worker?.close(); } catch {}
  try { await queue?.close(); } catch {}
};
