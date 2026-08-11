// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Remove problematic extensions
defaultConfig.resolver.sourceExts = [
  ...defaultConfig.resolver.sourceExts,
];

// Ensure proper asset handling
defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter(
  (ext) => ext !== 'env'
);

// Add .env to asset extensions instead
defaultConfig.resolver.assetExts.push('env');

// Disable transformer caching for now
defaultConfig.transformer = {
  ...defaultConfig.transformer,
  enableBabelRCLookup: false,
};

module.exports = defaultConfig;