import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

// The OAuth "Web client" ID from Google Cloud Console (auto-created by Firebase
// when you enable the Google sign-in provider). It is NOT a secret. Read from
// app.json -> expo.extra.googleWebClientId so there's a single place to set it.
const webClientId = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)
  ?.googleWebClientId;

let configured = false;

// Configure the native Google SDK lazily and only on device. Loaded via require
// so the native module is never touched on web.
function ensureNativeConfigured() {
  if (configured) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId });
  configured = true;
}

export async function signInWithGoogle(): Promise<void> {
  // Web: Firebase's popup flow works directly in the browser.
  if (Platform.OS === 'web') {
    await signInWithPopup(auth, googleProvider);
    return;
  }

  if (!webClientId) {
    throw new Error(
      'Google sign-in is not configured. Set expo.extra.googleWebClientId in app.json.'
    );
  }

  // Native: show the Google account picker, get an ID token, hand it to Firebase.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
  ensureNativeConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    // v13+ returns { type: 'success' | 'cancelled', data }; older returns the user directly.
    if (response?.type === 'cancelled') return;
    const idToken: string | undefined = response?.data?.idToken ?? response?.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);

    // Also sign in to the native Firebase instance so @react-native-firebase/storage is authenticated.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeAuth = require('@react-native-firebase/auth').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleAuthProvider: NativeGoogleAuthProvider } = require('@react-native-firebase/auth');
    const nativeCred = NativeGoogleAuthProvider.credential(idToken);
    await nativeAuth().signInWithCredential(nativeCred);
  } catch (e: unknown) {
    // Swallow the explicit user-cancelled case so it isn't surfaced as an error.
    const code = (e as { code?: string })?.code;
    if (statusCodes && (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS)) {
      return;
    }
    throw e;
  }
}
