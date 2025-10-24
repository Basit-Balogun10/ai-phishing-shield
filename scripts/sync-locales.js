/* eslint-env node */
/* global __dirname */

const fs = require('node:fs');
const path = require('node:path');

const localesDir = path.join(__dirname, '..', 'locales');
const referencePath = path.join(localesDir, 'en.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeMissing(reference, target) {
  if (!isPlainObject(reference)) {
    return target;
  }

  if (!isPlainObject(target)) {
    return JSON.parse(JSON.stringify(reference));
  }

  const output = { ...target };

  for (const [key, refValue] of Object.entries(reference)) {
    if (!(key in output)) {
      output[key] = JSON.parse(JSON.stringify(refValue));
      continue;
    }

    const currentValue = output[key];

    if (isPlainObject(refValue) && isPlainObject(currentValue)) {
      output[key] = mergeMissing(refValue, currentValue);
      continue;
    }

    if (Array.isArray(refValue) && !Array.isArray(currentValue)) {
      output[key] = [...refValue];
    }
  }

  return output;
}

function main() {
  if (!fs.existsSync(referencePath)) {
    throw new Error('Reference locale en.json not found');
  }

  const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((file) => file.endsWith('.json') && file !== 'en.json');

  localeFiles.forEach((file) => {
    const localePath = path.join(localesDir, file);
    const raw = fs.readFileSync(localePath, 'utf8');
    const data = JSON.parse(raw);

    const merged = mergeMissing(reference, data);
    const updated = JSON.stringify(merged, null, 2);

    if (updated !== raw.trim()) {
      fs.writeFileSync(localePath, `${updated}\n`);
      console.log(`Updated ${file}`);
    }
  });
}

main();
