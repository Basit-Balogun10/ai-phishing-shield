import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';
import crypto from 'crypto';

export const tokenRoutes: FastifyPluginAsync = async (server) => {
  // simple admin-protected routes; in prod replace with proper auth
  server.get('/admin/tokens', async (request, reply) => {
    const list = await prisma.token.findMany({ orderBy: { createdAt: 'desc' } });
    return reply.send(list);
  });

  server.post('/admin/tokens', async (request, reply) => {
    const name = (request.body as any)?.name ?? null;
    const token = crypto.randomBytes(24).toString('hex');
    try {
      const created = await prisma.token.create({ data: { token, name } });
      return reply.code(201).send({ token: created.token, id: created.id });
    } catch (err: any) {
      // In test environments return more diagnostic information to help
      // the test harness surface the underlying error. In prod we keep the
      // response generic.
      const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === '1';
      server.log.error({ err }, 'failed to create token');
      if (isTest) {
        return reply
          .code(500)
          .send({ error: 'token_create_failed', message: err?.message, stack: err?.stack });
      }
      return reply.code(500).send({ error: 'token_create_failed' });
    }
  });

  server.post('/admin/tokens/:id/revoke', async (request, reply) => {
    const id = Number((request.params as any).id);
    const updated = await prisma.token.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  // Issue a signed JWT for a given token record (admin only). Uses AUTH_JWT_SECRET.
  server.post('/admin/tokens/:id/issue', async (request, reply) => {
    const id = Number((request.params as any).id);
    const record = await prisma.token.findUnique({ where: { id } });
    if (!record) return reply.code(404).send({ error: 'not_found' });
    if (record.revokedAt) return reply.code(400).send({ error: 'revoked' });

    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret) return reply.code(500).send({ error: 'jwt_not_configured' });

    // dynamic import to avoid hard dependency in prod if not needed
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign({ tid: record.id, t: record.token }, secret as string, {
      expiresIn: '24h',
    });
    return reply.code(200).send({ jwt: token });
  });
};
