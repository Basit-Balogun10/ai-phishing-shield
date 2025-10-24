import { buildServer } from './src/index';

process.env.VITEST = '1';
process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'devtoken';
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'testsecret';

(async () => {
  try {
    const app = await buildServer();
    const resCreate = await app.inject({
      method: 'POST',
      url: '/v1/admin/tokens',
      headers: { authorization: `Bearer ${process.env.AUTH_TOKENS.split(',')[0]}` },
      payload: { name: 'test' },
    });
    console.log('status', resCreate.statusCode);
    console.log('payload', resCreate.payload);
    await app.close();
  } catch (e) {
    console.error('err', e);
  }
})();
