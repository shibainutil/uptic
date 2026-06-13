import { Tabs } from 'expo-router';
import { colors, font } from '../../src/theme';

const TABS = [
  { name: 'todo', title: 'To Do', icon: '✅' },
  { name: 'goals', title: 'Goals', icon: '🎯' },
  { name: 'steps', title: 'Steps', icon: '👟' },
  { name: 'water', title: 'Water', icon: '💧' },
  { name: 'poop', title: 'Poop', icon: '💩' },
  { name: 'nutrition', title: 'Nutrition', icon: '🥗' },
  { name: 'habits', title: 'Habits', icon: '🔁' },
  { name: 'journal', title: 'Journal', icon: '📓' },
  { name: 'gym', title: 'Gym', icon: '🏋️' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: font.lg },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: () => null,
            tabBarLabel: `${t.icon} ${t.title}`,
          }}
        />
      ))}
    </Tabs>
  );
}
