import { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Alert,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { colors, spacing, font, radius } from '../../src/theme';

export default function LoginScreen() {
  const { loginWithEmail, registerWithEmail } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Uptic</Text>
        <Text style={styles.tagline}>Your personal wellness tracker</Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Log in</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => setMode('register')}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Register</Text>
            </Pressable>
          </View>

          <View style={styles.fields}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
            <Button
              label={loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              variant="primary"
              onPress={submit}
              disabled={loading || !email.trim() || !password}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  logo: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: font.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    marginBottom: -1,
  },
  tabText: { color: colors.textMuted, fontSize: font.md, fontWeight: '500' },
  tabTextActive: { color: colors.accent },
  fields: { padding: spacing.lg, gap: spacing.md },
});
