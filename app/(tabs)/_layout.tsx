import { Slot, usePathname, useRouter } from 'expo-router';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, spacing } from '../../src/theme';

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
  { name: 'gym',       title: 'Gym',       icon: 'fitness-center' },
];

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.navBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navContent}
        >
          {TABS.map((tab) => {
            const isActive = pathname === `/${tab.name}` || pathname.startsWith(`/${tab.name}/`);
            return (
              <TouchableOpacity
                key={tab.name}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => router.navigate(`/(tabs)/${tab.name}`)}
              >
                <MaterialIcons
                  name={tab.icon}
                  size={24}
                  color={isActive ? colors.accent : colors.textMuted}
                />
                {isActive && (
                  <Text style={styles.tabLabel}>{tab.title}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  navBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navContent: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  tabItemActive: {
    backgroundColor: colors.surface2,
  },
  tabLabel: {
    color: colors.accent,
    fontSize: font.xl,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
