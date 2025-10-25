import prisma from '../src/db/prisma';

async function run() {
  try {
    console.log('DATABASE_URL:', process.env.DATABASE_URL ?? 'undefined');
    console.log('Attempting prisma.$connect()...');
    await prisma.$connect();
    console.log('Prisma connected successfully');
  } catch (err) {
    console.error('Prisma connect failed:', err);
    process.exitCode = 2;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
  }
}

run();
