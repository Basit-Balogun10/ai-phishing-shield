import prisma from '../db/prisma';
import { initQueue, closeQueue } from '../queue/outboxQueue';
import axios from 'axios';

const POLL_INTERVAL = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);
const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5);

const backoffMs = (attempts: number) => Math.min(60_000, 500 * 2 ** attempts);

const processItem = async (item: any) => {
  // Implement the delivery to the UPSTREAM_URL here.
  const upstream = process.env.UPSTREAM_URL;
  if (!upstream) {
    // If no upstream is configured, mark processed as a no-op.
    await prisma.outboxEvent.update({ where: { id: item.id }, data: { status: 'processed' } });
    return;
  }

  try {
    await axios.post(
      upstream,
      { id: item.id, channel: item.channel, payload: JSON.parse(item.payload) },
      { timeout: 10_000 }
    );
    await prisma.outboxEvent.update({ where: { id: item.id }, data: { status: 'processed' } });
  } catch (err: any) {
    const attempts = (item.attempts ?? 0) + 1;
    const nextAvailable = new Date(Date.now() + backoffMs(attempts));

    if (attempts >= MAX_ATTEMPTS) {
      await prisma.outboxEvent.update({
        where: { id: item.id },
        data: { status: 'error', attempts, lastError: String(err), availableAt: nextAvailable },
      });

      // Best-effort server-side audit when the worker gives up on an item.
      try {
        await prisma.auditLog.create({
          data: {
            route: 'worker/outbox/error',
            method: 'worker',
            token: null,
            ip: null,
            body: JSON.stringify({ id: item.id, attempts, lastError: String(err) }),
          },
        });
      } catch (auditErr) {
        // don't fail processing on audit logging problems
        console.warn('[worker] failed to persist audit log', auditErr);
      }
    } else {
      await prisma.outboxEvent.update({
        where: { id: item.id },
        data: { attempts, lastError: String(err), availableAt: nextAvailable },
      });
    }
  }
};

export const startProcessor = () => {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const now = new Date();
        const item = await prisma.outboxEvent.findFirst({
          where: { status: 'queued', availableAt: { lte: now } },
          orderBy: { createdAt: 'asc' },
        });

        if (!item) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          continue;
        }

        await processItem(item);
      } catch (err) {
        console.warn('[worker] processing error', err);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    }
  };

  // If Redis is configured, initialize BullMQ worker as an alternative
  // durable processor. The BullMQ Worker will call the processor function
  // below which reads the DB record by id and processes it.
  initQueue(async (job: any) => {
    try {
      const outboxId = job.data?.outboxId;
      if (!outboxId) return;
      const item = await prisma.outboxEvent.findUnique({ where: { id: outboxId } });
      if (!item) return;
      // Map job.attempts (BullMQ) to DB attempts/backoff
      const jobAttempts = job.attemptsMade ?? 0;
      if (jobAttempts > 0) {
        const attempts = Math.max(item.attempts ?? 0, jobAttempts);
        await prisma.outboxEvent.update({ where: { id: item.id }, data: { attempts } });
      }
      await processItem(item);
    } catch (e) {
      console.warn('[worker][bull] job handler error', e);
      throw e;
    }
  });

  void loop();

  const stop = () => {
    running = false;
  };

  const close = async () => {
    stop();
    try {
      await closeQueue();
    } catch {}
  };

  return { stop, close };
};
