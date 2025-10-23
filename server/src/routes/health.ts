import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });
};
