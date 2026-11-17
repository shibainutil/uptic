const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Uptic Dev' : 'Uptic',
  scheme: IS_DEV ? 'uptic-dev' : 'uptic',
  // Dev build gets a red DEV banner so it can be told apart from the release app.
  icon: IS_DEV ? './assets/icon-dev.png' : config.icon,
  android: {
    ...config.android,
    adaptiveIcon: {
      ...config.android.adaptiveIcon,
      foregroundImage: IS_DEV
        ? './assets/android-icon-foreground-dev.png'
        : config.android.adaptiveIcon.foregroundImage,
    },
    package: IS_DEV ? 'com.uptic.app.dev' : 'com.uptic.app',
    softwareKeyboardLayoutMode: 'resize',
  },
  updates: {
    ...config.updates,
    requestHeaders: {
      'expo-channel-name': IS_DEV ? 'staging' : 'master',
    },
  },
  // expo-dev-client must only be linked in dev builds; release builds must NOT include it
  // so it is excluded from app.json plugins and injected here only when IS_DEV
  plugins: [
    ...(IS_DEV ? ['expo-dev-client'] : []),
    ...(config.plugins || []),
  ],
});
