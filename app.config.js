// Dynamic config: merges with app.json.
// Set EXPO_UPDATE_CHANNEL=staging (dev build) or EXPO_UPDATE_CHANNEL=master (release build).
// Defaults to 'staging' so a plain local build gets the dev channel.
module.exports = ({ config }) => ({
  ...config,
  updates: {
    ...config.updates,
    requestHeaders: {
      'expo-channel-name': process.env.EXPO_UPDATE_CHANNEL ?? 'staging',
    },
  },
});
