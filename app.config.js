const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Uptic (Dev)' : 'Uptic',
  scheme: IS_DEV ? 'uptic-dev' : 'uptic',
  icon: IS_DEV ? './assets/icon-dev.png' : config.icon,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV ? 'com.uptic.app.dev' : 'com.uptic.app',
  },
  android: {
    ...config.android,
    package: IS_DEV ? 'com.uptic.app.dev' : 'com.uptic.app',
    adaptiveIcon: {
      ...config.android?.adaptiveIcon,
      foregroundImage: IS_DEV
        ? './assets/android-icon-foreground-dev.png'
        : config.android?.adaptiveIcon?.foregroundImage,
    },
  },
  updates: {
    ...config.updates,
    requestHeaders: {
      'expo-channel-name': IS_DEV ? 'development' : 'master',
    },
  },
});
