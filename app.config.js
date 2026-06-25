const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Uptic Dev' : 'Uptic',
  scheme: IS_DEV ? 'uptic-dev' : 'uptic',
  android: {
    ...config.android,
    package: IS_DEV ? 'com.uptic.app.dev' : 'com.uptic.app',
  },
  updates: {
    ...config.updates,
    requestHeaders: {
      'expo-channel-name': IS_DEV ? 'staging' : 'master',
    },
  },
});
