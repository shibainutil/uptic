import type { ComponentProps } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '../../theme';

export interface ActionSheetItem {
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  destructive?: boolean;
  /** Greyed out but still tappable, so onPress can explain why it isn't possible. */
  muted?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}

/** Bottom sheet of actions. Tapping an item closes the sheet, then runs it. */
export function ActionSheet({ visible, title, items, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {items.map((item) => {
            const tint = item.destructive ? colors.danger : item.muted ? colors.textDim : colors.text;
            return (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => { onClose(); item.onPress(); }}
              >
                <MaterialIcons name={item.icon} size={22} color={tint} />
                <Text style={[styles.itemText, { color: tint }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: spacing.sm,
  },
  title: {
    color: colors.textMuted, fontSize: font.sm, fontWeight: '600',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
  },
  itemPressed: { backgroundColor: colors.surface2 },
  itemText: { fontSize: font.md, fontWeight: '500' },
});
