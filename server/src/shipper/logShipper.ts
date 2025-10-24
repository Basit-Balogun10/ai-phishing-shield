import fs from 'fs';
import path from 'path';

export function startShipper() {
  const logDir = path.join(__dirname, '..', '..', 'logs');
  const src = path.join(logDir, 'server.log');
  const out = path.join(logDir, 'shipped.log');

  // simple poller: read whole file periodically and append new lines to shipped.log
  let lastSize = 0;
  const interval = setInterval(() => {
    try {
      const stat = fs.statSync(src);
      if (stat.size > lastSize) {
        const fd = fs.openSync(src, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        fs.appendFileSync(out, buf);
        lastSize = stat.size;
      }
    } catch {
      // ignore
    }
  }, 500);

  return () => clearInterval(interval);
}
