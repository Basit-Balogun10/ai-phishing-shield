#!/usr/bin/env node
/* eslint-env node */
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = process.env.LOCALES_DIR || path.resolve(__dirname, '..', 'locales');
const REFERENCE_PATH = path.join(LOCALES_DIR, 'en.json');

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function pruneToReference(reference, target) {
  if (!isPlainObject(reference)) {
    // If reference is not an object (primitive or array), keep target as-is
    return target;
  }

  if (!isPlainObject(target)) {
    // Target isn't an object but reference is — copy reference shape (keeps strings/arrays from reference)
    return JSON.parse(JSON.stringify(reference));
  }

  const out = {};
  Object.keys(reference).forEach((key) => {
    if (!(key in target)) {
      // missing in target — copy reference (so placeholders remain)
      out[key] = JSON.parse(JSON.stringify(reference[key]));
      return;
    }

    const refVal = reference[key];
    const tgtVal = target[key];

    if (isPlainObject(refVal)) {
      out[key] = pruneToReference(refVal, tgtVal);
      return;
    }

    // For arrays/primitives, prefer target value if present (keep translations),
    // otherwise fallback to reference
    out[key] = typeof tgtVal !== 'undefined' ? tgtVal : JSON.parse(JSON.stringify(refVal));
  });

  return out;
}

function main() {
  if (!fs.existsSync(REFERENCE_PATH)) {
    console.error('Reference locale en.json not found at', REFERENCE_PATH);
    process.exit(1);
  }

  const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));

  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');

  files.forEach((file) => {
    const p = path.join(LOCALES_DIR, file);
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);

    const pruned = pruneToReference(reference, data);
    const updated = JSON.stringify(pruned, null, 2) + '\n';

    if (updated !== raw) {
      fs.writeFileSync(p, updated);
      console.log(`Pruned ${file}`);
    }
  });
}

main();
