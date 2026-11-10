import { Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface Props {
  /** Tap: usually opens the item's edit screen. */
  onPress: () => void;
  /** Hold: starts dragging (pass the `drag` from react-native-draggable-flatlist). */
  onDrag?: () => void;
  active?: boolean;
}

/** ☰ handle on the right of a reorderable row: tap to edit, hold to drag. */
export function DragHandle({ onPress, onDrag, active }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDrag}
      delayLongPress={250}
      disabled={active}
      hitSlop={10}
      style={styles.handle}
    >
      <MaterialIcons name="menu" size={24} color={active ? colors.accent : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: { paddingLeft: 4, paddingVertical: 4 },
});
