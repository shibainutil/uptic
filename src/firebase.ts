import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: Firebase "web" config values are NOT secrets. They ship in the client of
// every Firebase web/mobile app. Security is enforced by Firestore security
// rules, not by hiding these. Hardcoding them removes any chance of a missing
// build-time env var producing an undefined config (which crashes the app on
// launch). Env vars still override when present (e.g. for web/CI).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyC3EXQdJ_Fv-13ct71e90GFE_ljqq9OTs4',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'uptic-6ff6b.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'uptic-6ff6b',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'uptic-6ff6b.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '752330312289',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:752330312289:web:f38d689cccf088050e3820',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// On React Native, auth needs explicit AsyncStorage persistence so the user
// stays logged in across restarts. The helper that wires this up
// (getReactNativePersistence) lives ONLY in Firebase's React Native build
// (@firebase/auth/dist/rn). Depending on how the bundler resolves Firebase it
// may not be present — so we look it up defensively and ALWAYS fall back to a
// working auth instance rather than throwing (a throw here = instant crash on
// app launch, before any UI renders).
// Metro only allows require() with static string literals, so each candidate
// resolution path is its own try block.
function loadRnPersistence(): ((storage: unknown) => unknown) | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('@firebase/auth');
    if (typeof lib.getReactNativePersistence === 'function') return lib.getReactNativePersistence;
  } catch {
    // fall through
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('firebase/auth');
    if (typeof lib.getReactNativePersistence === 'function') return lib.getReactNativePersistence;
  } catch {
    // fall through
  }
  return undefined;
}

function createNativeAuth(): Auth {
  const getReactNativePersistence = loadRnPersistence();
  if (getReactNativePersistence) {
    try {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage) as never,
      });
    } catch {
      // fall through to a non-persistent instance
    }
  }

  // Persistence helper unavailable: still give the app a working auth instance.
  // Login simply won't survive a full cold restart — but the app runs.
  try {
    return initializeAuth(app);
  } catch {
    return getAuth(app);
  }
}

export const auth: Auth = Platform.OS === 'web' ? getAuth(app) : createNativeAuth();
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
