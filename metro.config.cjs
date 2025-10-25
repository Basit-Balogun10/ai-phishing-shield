const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Use process.cwd() instead of __dirname so Windows absolute paths are handled
// consistently when EAS/Node uses the ESM loader (avoids 'Received protocol c:' errors).
const projectRoot = process.cwd();
const config = getDefaultConfig(projectRoot);

// Prevent Metro from resolving/including server-side code or large model
// artifacts accidentally. This is a safety guard for monorepos where the
// server lives alongside the mobile app.
config.resolver = config.resolver || {};
// Provide simple regex-based block list directly to avoid relying on
// metro-config internal exports which can break depending on installed version.
config.resolver.blockList = [
  /server\/.*$/,
  /phishing_detector_package\/.*$/,
];

module.exports = withNativeWind(config, { input: './global.css' });
