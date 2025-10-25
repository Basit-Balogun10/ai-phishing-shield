import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

let queue: Queue | null = null;
let worker: Worker | null = null;

export const getQueue = () => queue;

export const initQueue = (processor: (job: Job) => Promise<void>) => {
  if (!redisUrl) return null;

  const connection = new (IORedis as any)(redisUrl);
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
