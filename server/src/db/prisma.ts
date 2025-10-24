import { PrismaClient } from '@prisma/client';
import path from 'path';

// Ensure a sensible default for local development/tests when DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  // Use a file-based SQLite DB inside the server folder for tests/dev
  process.env.DATABASE_URL = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
}

const prisma = new PrismaClient();

export default prisma;
