import { FastifyPluginAsync } from 'fastify';
// prom-client is optional; fall back to a noop metrics endpoint when not installed.

let promClient: any = null;
(async () => {
  try {
    // dynamic import so prom-client is optional in test environments

    const mod = await import('prom-client');
    promClient = mod;
    const collectDefaultMetrics = promClient.collectDefaultMetrics;
    if (collectDefaultMetrics) collectDefaultMetrics({ timeout: 5000 });
  } catch {
    promClient = null;
  }
})();

export const metricsRoutes: FastifyPluginAsync = async (server) => {
  server.get('/', async (request, reply) => {
    if (!promClient) {
      reply.type('text/plain');
      return reply.send('# no metrics available\n');
    }
    const body = await promClient.register.metrics();
    reply.type('text/plain').send(body);
  });
};
