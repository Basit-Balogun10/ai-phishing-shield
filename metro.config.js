const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving/including server-side code or large model
// artifacts accidentally. This is a safety guard for monorepos where the
// server lives alongside the mobile app.
config.resolver = config.resolver || {};
config.resolver.blockList = exclusionList([
	/server\/.*$/,
	/phishing_detector_package\/.*$/,
]);

module.exports = withNativeWind(config, { input: './global.css' });
