import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';

export const auditPlugin: FastifyPluginAsync = async (server) => {
  server.addHook('onResponse', async (request, reply) => {
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'DELETE') {
      return;
    }

    const auth = request.headers['authorization'];
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;

    // best-effort: log to structured logger
    server.log.info({ event: 'audit', token, ip: request.ip, route: request.routerPath, status: reply.statusCode }, 'audit event');

    // best-effort: persist to AuditLog table; ignore failures
    try {
      await prisma.auditLog.create({
        data: {
          route: request.routerPath ?? request.url,
          method: request.method,
          token: token ?? undefined,
          ip: request.ip ?? undefined,
          body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}),
        },
      });
    } catch (e) {
      server.log.warn('Failed to persist audit log', e);
    }
  });
};
