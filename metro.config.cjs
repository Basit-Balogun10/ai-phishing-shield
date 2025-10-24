const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const exclusionList = require('metro-config/src/defaults/exclusionList');
const path = require('path');

// Use process.cwd() instead of __dirname so Windows absolute paths are handled
// consistently when EAS/Node uses the ESM loader (avoids 'Received protocol c:' errors).
const projectRoot = process.cwd();
const config = getDefaultConfig(projectRoot);

// Prevent Metro from resolving/including server-side code or large model
// artifacts accidentally. This is a safety guard for monorepos where the
// server lives alongside the mobile app.
config.resolver = config.resolver || {};
config.resolver.blockList = exclusionList([
  /server\/.*$/,
  /phishing_detector_package\/.*$/,
]);

module.exports = withNativeWind(config, { input: './global.css' });
