import { FastifyPluginAsync } from 'fastify';

export const configRoutes: FastifyPluginAsync = async (server) => {
  server.get('/config', async () => {
    return {
      minAppVersion: process.env.MIN_APP_VERSION ?? '1.0.0',
      maintenance: null,
      featureFlags: {
        manualReportsEnabled: true,
        modelDownloads: 'live',
      },
    };
  });
};
