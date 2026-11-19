// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { execFileSync } = require('child_process');

// Metro probes Watchman with --no-spawn, so if the Watchman service isn't already
// running it silently falls back to Node's fs.watch, which misses saves on Windows
// and breaks Fast Refresh. Start the service (and the watch) before Metro checks.
// An unclean exit leaves a stale AF_UNIX `sock` file that Windows can't delete and
// that makes the next server die on bind(); moving the state dir aside fixes it.
const startWatchman = () =>
  execFileSync('watchman', ['watch-project', __dirname], { stdio: 'ignore', timeout: 15000 });
try {
  startWatchman();
} catch {
  try {
    const fs = require('fs');
    const path = require('path');
    const stateDir = path.join(process.env.LOCALAPPDATA || '', 'watchman');
    if (fs.existsSync(stateDir)) fs.renameSync(stateDir, `${stateDir}.stale-${Date.now()}`);
    startWatchman();
  } catch {}
}

const config = getDefaultConfig(__dirname);

// Firebase ships separate builds per platform. Metro must be allowed to resolve
// `.cjs` modules and to honor the "react-native" package-export condition so the
// React Native auth build (which provides getReactNativePersistence) is used on
// device instead of the browser build (which does not).
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

// Expo SDK 56 defaults useWatchman to off, leaving Metro on Node's fs.watch, which
// drops file-change events on Windows so Fast Refresh only fires intermittently.
config.resolver.useWatchman = true;

// Windows fs.watch can silently stop delivering events after many rapid saves.
// The health-check pings the watcher on an interval and triggers a restart if
// it has gone stale, so Fast Refresh keeps working without a manual reload.
config.watcher = {
  healthCheck: {
    enabled: true,
    interval: 15000,
    timeout: 5000,
    filePrefix: '.metro-health-check',
  },
};

module.exports = config;
