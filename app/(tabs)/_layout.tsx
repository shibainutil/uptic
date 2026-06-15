import { useState } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Image, StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, font, spacing, radius } from '../../src/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'todo',      title: 'To Do',     icon: 'checklist' },
  { name: 'goals',     title: 'Goals',     icon: 'flag' },
  { name: 'steps',     title: 'Steps',     icon: 'directions-walk' },
  { name: 'water',     title: 'Water',     icon: 'water-drop' },
  { name: 'poop',      title: 'Poop',      icon: 'wc' },
  { name: 'nutrition', title: 'Nutrition', icon: 'restaurant' },
  { name: 'habits',    title: 'Habits',    icon: 'repeat' },
  { name: 'journal',   title: 'Journal',   icon: 'menu-book' },
  { name: 'fitness',   title: 'Fitness',   icon: 'fitness-center' },
];

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeTab = TABS.find((t) => pathname === `/${t.name}` || pathname.startsWith(`/${t.name}/`)) ?? TABS[0];

  function navigate(tab: typeof TABS[number]) {
    setDropdownOpen(false);
    router.navigate(`/(tabs)/${tab.name}`);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        {/* Left: active tab dropdown trigger */}
        <TouchableOpacity
          style={styles.dropdownTrigger}
          onPress={() => setDropdownOpen((v) => !v)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="menu" size={22} color={colors.accent} />
          <MaterialIcons name={activeTab.icon} size={22} color={colors.accent} />
          <Text style={styles.activeLabel}>{activeTab.title}</Text>
        </TouchableOpacity>

        {/* Right: settings + profile */}
        <View style={styles.rightButtons}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <MaterialIcons name="settings" size={24} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} activeOpacity={0.7}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.profileImage} />
            ) : (
              <MaterialIcons name="account-circle" size={32} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Dropdown overlay */}
      {dropdownOpen && (
        <TouchableWithoutFeedback onPress={() => setDropdownOpen(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdown}>
                {TABS.filter((t) => t.name !== activeTab.name).map((tab) => (
                  <TouchableOpacity
                    key={tab.name}
                    style={styles.dropdownItem}
                    onPress={() => navigate(tab)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name={tab.icon} size={20} color={colors.textMuted} />
                    <Text style={styles.dropdownItemText}>{tab.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}

      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const NAV_HEIGHT = 52;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  navBar: {
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  activeLabel: {
    color: colors.accent,
    fontSize: font.lg,
    fontWeight: '700',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  profileBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  overlay: {
    position: 'absolute',
    top: NAV_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  dropdown: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: font.md,
  },
  content: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
