const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving/including server-side code or large model
// artifacts accidentally. This is a safety guard for monorepos where the
// server lives alongside the mobile app.
config.resolver = config.resolver || {};
// Avoid importing metro-config private internals (exclusionList) which
// aren't exported under newer package.json `exports` fields. Use a
// direct RegExp that matches paths we want Metro to ignore.
config.resolver.blockList = /server\/.*$|phishing_detector_package\/.*$/;

module.exports = withNativeWind(config, { input: './global.css' });
