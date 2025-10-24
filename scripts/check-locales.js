#!/usr/bin/env node
/* eslint-env node */
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');

// Resolve locales directory relative to this script so the checker works
// regardless of the current working directory when invoked.
const LOCALES_DIR = process.env.LOCALES_DIR || path.resolve(__dirname, '..', 'locales');
const REFERENCE_LOCALE = process.env.LOCALE_REFERENCE ?? 'en.json';

async function getLocaleFiles() {
  const entries = await readdir(LOCALES_DIR, { withFileTypes: true });
  const localeFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  if (!localeFiles.includes(REFERENCE_LOCALE)) {
    console.error(`❌ Reference locale ${REFERENCE_LOCALE} not found in locales directory.`);
    process.exit(1);
  }

  return localeFiles;
}

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
  const localeFiles = await getLocaleFiles();
  const locales = await Promise.all(localeFiles.map(loadLocale));
  if (locales.includes(null)) {
    process.exit(process.exitCode ?? 1);
  }

  const referenceIndex = localeFiles.indexOf(REFERENCE_LOCALE);
  const referenceLocale = locales[referenceIndex];
  const otherLocales = locales.filter((_, index) => index !== referenceIndex);
  const otherLocaleNames = localeFiles.filter((_, index) => index !== referenceIndex);
  const referenceKeys = flatten(referenceLocale);

  let hasMismatch = false;

  otherLocales.forEach((locale, index) => {
    const localeName = otherLocaleNames[index];
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
