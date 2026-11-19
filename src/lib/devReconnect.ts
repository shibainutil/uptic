import { useEffect, useRef } from 'react';
import { AppState, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';

// Dev only. MIUI cuts a backgrounded app's sockets after ~5 s, which kills the Fast
// Refresh socket, and React Native's HMR client never reconnects. So when the app
// comes back after longer than that, reload from Metro and reopen the same screen.
const AWAY_MS = 4000;
const KEY = 'dev:restorePath';

async function metroIsUp(): Promise<boolean> {
  try {
    const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer').default;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${getDevServer().url}status`, { signal: ctrl.signal });
    clearTimeout(t);
    return (await res.text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

export function useDevReconnect(ready: boolean) {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!__DEV__) return;
    let awaySince: number | null = null;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') { awaySince ??= Date.now(); return; }
      const away = awaySince != null && Date.now() - awaySince > AWAY_MS;
      awaySince = null;
      if (!away || !(await metroIsUp())) return;
      await AsyncStorage.setItem(KEY, pathRef.current);
      DevSettings.reload();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!__DEV__ || !ready) return;
    AsyncStorage.getItem(KEY).then((path) => {
      if (!path) return;
      AsyncStorage.removeItem(KEY);
      if (path !== pathRef.current) router.push(path as never);
    });
  }, [ready]);
}
