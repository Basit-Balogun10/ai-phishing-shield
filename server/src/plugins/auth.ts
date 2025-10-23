import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';

export const authPlugin: FastifyPluginAsync = async (server) => {
  const raw = process.env.AUTH_TOKENS ?? '';
  const envTokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  // decorate request so downstream handlers can access token/claims
  server.decorateRequest('authToken', null as string | null);
  server.decorateRequest('authClaims', null as any);

  server.addHook('onRequest', async (request, reply) => {
    // allow health and config to be read anonymously
    if (request.routerPath === '/v1/health' || request.routerPath === '/v1/config') {
      return;
    }

    const auth = request.headers['authorization'];
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      void reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const token = auth.slice(7).trim();
    // attach token to request for downstream use
    (request as any).authToken = token;

    // If a JWT verification key is configured, try to verify the token as a JWT.
    const jwtKey = process.env.AUTH_JWT_PUBLIC_KEY ?? process.env.AUTH_JWT_SECRET;
    if (jwtKey) {
      try {
        // dynamic import so we don't require jsonwebtoken in environments that don't use JWT

        const jwt = await import('jsonwebtoken');
        try {
          const claims = jwt.verify(token, jwtKey as string);
          (request as any).authClaims = claims;
          // If verified as JWT, accept the request
          return;
        } catch (jwtErr) {
          server.log.debug(
            { err: jwtErr },
            'JWT verification failed, falling back to token lookup'
          );
        }
      } catch (e) {
        server.log.debug('jsonwebtoken not available, skipping JWT verification');
      }
    }

    // Check DB tokens (non-blocking best-effort)
    try {
      const dbToken = await prisma.token.findUnique({ where: { token } });
      if (dbToken && !dbToken.revokedAt) return;
      if (dbToken && dbToken.revokedAt) {
        void reply.code(401).send({ error: 'unauthorized' });
        return;
      }
    } catch (e) {
      server.log.warn('Token lookup failed', e);
    }

    // Fallback to env tokens
    if (!envTokens.includes(token)) {
      void reply.code(401).send({ error: 'unauthorized' });
      return;
    }
  });
};
