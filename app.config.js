const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Uptic (Dev)' : 'Uptic',
  android: {
    ...config.android,
    package: IS_DEV ? 'com.uptic.app.dev' : 'com.uptic.app',
  },
});
