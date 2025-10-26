/* eslint-env node */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      'react/display-name': 'off',
    },
    // Prevent accidental imports from server-side code or large model/dataset
    // folders into the mobile app. This runs during lint/time and will fail
    // the build if any mobile code imports forbidden paths. Keep the rule
    // simple and compatible with the current ESLint schema by only using
    // the `patterns` option (the schema does not allow a top-level
    // `message` when `patterns` is present).
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          // top-level server folder
          'server/**',
          // model artifacts / tokenizer
          'phishing_detector_package/**',
          // large dataset folders
          'data/**',
          'dataset/**',
        ],
      },
    ],
  },
]);
