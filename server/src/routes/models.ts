import { FastifyPluginAsync } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { signCatalog } from '../lib/catalogSigner';

export const modelsRoutes: FastifyPluginAsync = async (server) => {
  server.get('/catalog.json', async (request, reply) => {
    try {
      const file = path.join(__dirname, '..', '..', 'catalog', 'catalog.json');
      const raw = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(raw);

      // optional HMAC signature for catalog integrity
      const secret = process.env.MODEL_CATALOG_SECRET;
      if (secret) {
        const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');
        reply.header('X-Catalog-Signature', `sha256=${hmac}`);
      }

      return reply.header('Cache-Control', 'public, max-age=60').send(parsed);
    } catch (err) {
      server.log.warn({ err }, 'Failed to load catalog.json, returning 404');
      return reply.code(404).send({ error: 'catalog_unavailable' });
    }
  });
  // serve precomputed signature file if present, otherwise compute on demand when secret is set
  server.get('/catalog.json.sig', async (request, reply) => {
    try {
      const sigFile = path.join(__dirname, '..', '..', 'catalog', 'catalog.json.sig');
      try {
        const raw = await fs.readFile(sigFile, 'utf-8');
        return reply.type('text/plain').send(raw);
      } catch {
        // not found, compute if secret available
      }

      const secret = process.env.MODEL_CATALOG_SECRET;
      if (!secret) return reply.code(404).send({ error: 'signature_unavailable' });
      const sig = await signCatalog(secret);
      return reply.type('text/plain').send(sig);
    } catch (err) {
      server.log.warn({ err }, 'Failed to load or compute signature');
      return reply.code(500).send({ error: 'signature_error' });
    }
  });
  // Serve a minimal Swagger UI that points to the local OpenAPI spec
  server.get('/docs', async (request, reply) => {
    const specUrl = '/docs/openapi.json';
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '${specUrl}', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`;

    reply.type('text/html').send(html);
  });
  // Serve raw OpenAPI file
  server.get('/docs/openapi.json', async (request, reply) => {
    try {
      const file = path.join(__dirname, '..', '..', 'docs', 'openapi.json');
      const raw = await fs.readFile(file, 'utf-8');
      reply.header('Cache-Control', 'no-cache').type('application/json').send(JSON.parse(raw));
    } catch (err) {
      server.log.warn({ err }, 'Failed to load openapi.json');
      reply.code(404).send({ error: 'openapi_unavailable' });
    }
  });
};
