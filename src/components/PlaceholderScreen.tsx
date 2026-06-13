import { View, Text, StyleSheet } from 'react-native';
import { colors, font } from '../theme';

interface Props { name: string; icon: string }

export function PlaceholderScreen({ name, icon }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.soon}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { fontSize: 48 },
  name: { color: colors.textMuted, fontSize: font.lg, fontWeight: '600' },
  soon: { color: colors.textDim, fontSize: font.md },
});
