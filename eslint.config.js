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
      // Prevent accidental imports from server-side code or large model/dataset
      // folders into the mobile app. This runs during lint/time and will fail
      // the build if any mobile code imports forbidden paths.
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
          // A short message helps developers quickly understand why the import
          // is restricted.
          message: 'Importing server-side or large dataset/model files into the mobile bundle is forbidden. Access server APIs via network calls instead.'
        }
      ],
    },
  },
]);
