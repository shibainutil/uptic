// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase ships separate builds per platform. Metro must be allowed to resolve
// `.cjs` modules and to honor the "react-native" package-export condition so the
// React Native auth build (which provides getReactNativePersistence) is used on
// device instead of the browser build (which does not).
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
