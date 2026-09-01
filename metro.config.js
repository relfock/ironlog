const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle's Expo migration bundle imports the raw .sql files, so Metro has to
// treat .sql as source rather than refusing to resolve it.
config.resolver.sourceExts.push('sql');

module.exports = config;
