#!/usr/bin/env node
/* eslint-env node */
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const LOCALES_DIR = path.resolve(process.cwd(), 'locales');
const LOCALE_FILES = ['en.json', 'fr.json'];

function flatten(value, prefix = '', acc = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPrefix = `${prefix}[${index}]`;
      flatten(item, nextPrefix, acc);
    });
    if (value.length === 0) {
      acc.add(`${prefix}[]`);
    }
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flatten(value[key], nextPrefix, acc);
    });
  } else if (prefix) {
    acc.add(prefix);
  }

  return acc;
}

function diffKeys(reference, candidate) {
  const missing = new Set();
  reference.forEach((key) => {
    if (!candidate.has(key)) {
      missing.add(key);
    }
  });
  return missing;
}

async function loadLocale(fileName) {
  const filePath = path.resolve(LOCALES_DIR, fileName);
  const contents = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(contents);
  } catch (error) {
    console.error(`❌ Failed to parse ${fileName}:`, error.message);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const locales = await Promise.all(LOCALE_FILES.map(loadLocale));
  if (locales.includes(null)) {
    process.exit(process.exitCode ?? 1);
  }

  const [referenceLocale, ...others] = locales;
  const referenceKeys = flatten(referenceLocale);

  let hasMismatch = false;

  others.forEach((locale, index) => {
    const localeName = LOCALE_FILES[index + 1];
    const candidateKeys = flatten(locale);

    const missingFromCandidate = diffKeys(referenceKeys, candidateKeys);
    const extraInCandidate = diffKeys(candidateKeys, referenceKeys);

    if (missingFromCandidate.size > 0 || extraInCandidate.size > 0) {
      hasMismatch = true;
      console.error(`\n❌ Locale parity check failed for ${localeName}:`);

      if (missingFromCandidate.size > 0) {
        console.error('  • Missing keys:');
        missingFromCandidate.forEach((key) => console.error(`    - ${key}`));
      }

      if (extraInCandidate.size > 0) {
        console.error('  • Extra keys:');
        extraInCandidate.forEach((key) => console.error(`    - ${key}`));
      }
    }
  });

  if (hasMismatch) {
    process.exit(1);
  } else {
    console.log('✅ Locale parity check passed.');
  }
}

main().catch((error) => {
  console.error('❌ Locale parity check encountered an error:', error);
  process.exit(1);
});
