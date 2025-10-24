import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    metricsRegistry?: any;
    metricAccepted?: any;
    metricDuplicate?: any;
    metricInvalid?: any;
    metricProcessed?: any;
  }

  interface FastifyRequest {
    authToken?: string | null;
    authClaims?: any;
    routerPath?: string;
  }
}
