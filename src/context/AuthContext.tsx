import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { signInWithGoogle } from '../auth/google';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getNativeAuth() {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAuth } = require('@react-native-firebase/auth');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApp } = require('@react-native-firebase/app');
    return getAuth(getApp());
  } catch {
    return null;
  }
}

function nativeAuthFns() {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const nativeAuth = getNativeAuth();

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && nativeAuth) {
        if (!nativeAuth.currentUser) {
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }
      }
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    const na = getNativeAuth();
    const fns = nativeAuthFns();
    if (na && fns) await fns.signInWithEmailAndPassword(na, email, password);
  };

  const registerWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
    const na = getNativeAuth();
    const fns = nativeAuthFns();
    if (na && fns) await fns.createUserWithEmailAndPassword(na, email, password);
  };

  const loginWithGoogle = async () => {
    await signInWithGoogle();
  };

  const logout = async () => {
    const na = getNativeAuth();
    const fns = nativeAuthFns();
    if (na && fns) await fns.signOut(na);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithEmail, registerWithEmail, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
