import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function signCatalog(secret: string) {
  const file = path.join(__dirname, '..', '..', 'catalog', 'catalog.json');
  const raw = await fs.readFile(file, 'utf-8');
  const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return `sha256=${hmac}`;
}

export async function writeSignatureFile(sig: string) {
  const out = path.join(__dirname, '..', '..', 'catalog', 'catalog.json.sig');
  await fs.writeFile(out, sig, 'utf-8');
}
