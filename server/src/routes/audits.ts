import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma.js';

export const auditsRoutes: FastifyPluginAsync = async (server) => {
  // list recent audit logs (admin)
  server.get('/admin/audits', async (request, reply) => {
    const limit = Number((request.query as any)?.limit ?? 100);
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 1000),
    });
    return reply.send(rows);
  });
};
