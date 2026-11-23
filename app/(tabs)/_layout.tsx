import { useEffect, useState } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Image, Keyboard, Platform, StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { useAuth } from '../../src/context/AuthContext';
import { colors, font, spacing, radius } from '../../src/theme';
import BugReportPickerSheet from '../../src/components/BugReportPickerSheet';
import { useBottomBarStore } from '../../src/store/bottomBarStore';

/** Dev build (or Metro dev session) shows the dev app icon in the top bar, like the launcher icon. */
const IS_DEV_BUILD = __DEV__ || (Application.applicationId ?? '').endsWith('.dev');
const BRAND_LOGO = IS_DEV_BUILD
  ? require('../../assets/icon-dev.png')
  : require('../../assets/logo.png');

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

type Tab = { name: string; title: string; icon: IconName };

const HOME_TAB: Tab = { name: 'home', title: 'Home', icon: 'home' };

/** Screens in the center selector. Home has its own icon button in the center of the top bar. */
const TABS: Tab[] = [
  { name: 'pillars',   title: 'Pillars',   icon: 'account-balance' },
  { name: 'projects',  title: 'Projects',  icon: 'flag' },
  { name: 'weight',    title: 'Weight',    icon: 'monitor-weight' },
  { name: 'fitness',   title: 'Fitness',   icon: 'fitness-center' },
  { name: 'habits',    title: 'Habits',    icon: 'track-changes' },
  { name: 'nutrition', title: 'Nutrition', icon: 'restaurant' },
];

/** Hides the bottom bar while the keyboard is up, so it doesn't sit on top of the keyboard. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const keyboardVisible = useKeyboardVisible();
  const barAction = useBottomBarStore((s) => s.action);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bugSheetOpen, setBugSheetOpen] = useState(false);
  const [selectorX, setSelectorX] = useState(0);

  const isActive = (t: Tab) => pathname === `/${t.name}` || pathname.startsWith(`/${t.name}/`);
  const activeTab = TABS.find(isActive);
  const homeActive = !activeTab;
  const bottomBarHeight = BOTTOM_BAR_HEIGHT + insets.bottom;

  function navigate(tab: Tab) {
    setDropdownOpen(false);
    router.navigate(`/(tabs)/${tab.name}`);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.navBar}>
        {/* Left: logo + name, opens the About screen */}
        <TouchableOpacity style={styles.brand} onPress={() => router.push('/about')} activeOpacity={0.7}>
          <Image source={BRAND_LOGO} style={styles.logo} />
          <Text style={styles.brandName}>Uptic</Text>
        </TouchableOpacity>

        {/* Center: Home, icon only, circled when active */}
        <View style={styles.homeCenter} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.homeBtn, homeActive && styles.homeBtnActive]}
            onPress={() => navigate(HOME_TAB)}
            activeOpacity={0.7}
            accessibilityLabel="Home"
          >
            <MaterialIcons name="home" size={24} color={homeActive ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Right: notifications + bug report + settings + profile */}
        <View style={styles.rightButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
            <MaterialIcons name="notifications-none" size={24} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setBugSheetOpen(true)} activeOpacity={0.7}>
            <MaterialIcons name="bug-report" size={24} color={colors.textMuted} />
          </TouchableOpacity>
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

      <View style={styles.content}>
        <Slot />
      </View>

      {/* Bottom bar: screen selector in the center, screen action on the right */}
      {!keyboardVisible && (
        <View style={[styles.bottomBar, { height: bottomBarHeight, paddingBottom: insets.bottom }]}>
          {/* Center: screen selector, absolutely centered so the right-side action can't push it off */}
          <View style={[styles.selectorCenter, { bottom: insets.bottom }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setDropdownOpen((v) => !v)}
              onLayout={(e) => setSelectorX(e.nativeEvent.layout.x)}
              activeOpacity={0.7}
            >
              {activeTab ? (
                <>
                  <MaterialIcons name={activeTab.icon} size={22} color={colors.accent} />
                  <Text style={styles.activeLabel}>{activeTab.title}</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="apps" size={22} color={colors.textMuted} />
                  <Text style={styles.selectorPlaceholder}>Go to</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.barSide, styles.barSideRight]}>
            {barAction && (
              <TouchableOpacity style={styles.addBtn} onPress={barAction.onPress} activeOpacity={0.7}>
                <MaterialIcons name={barAction.icon} size={16} color="#fff" />
                <Text style={styles.addBtnText}>{barAction.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Screen menu, opens upward from the selector with its icons and labels lined up under the selector's */}
      {dropdownOpen && !keyboardVisible && (
        <TouchableWithoutFeedback onPress={() => setDropdownOpen(false)}>
          <View style={[styles.overlay, { bottom: bottomBarHeight }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.dropdown, { marginLeft: selectorX - 1 }]}>
                {TABS.filter((t) => t.name !== activeTab?.name).map((tab, i, list) => (
                  <TouchableOpacity
                    key={tab.name}
                    style={[styles.dropdownItem, i === list.length - 1 && styles.dropdownItemLast]}
                    onPress={() => navigate(tab)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name={tab.icon} size={22} color={colors.textMuted} />
                    <Text style={styles.dropdownItemText}>{tab.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}

      <BugReportPickerSheet visible={bugSheetOpen} onClose={() => setBugSheetOpen(false)} />
    </View>
  );
}

const NAV_HEIGHT = 52;
const BOTTOM_BAR_HEIGHT = 56;

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
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  brandName: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  content: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectorCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  barSideRight: {
    justifyContent: 'flex-end',
  },
  homeCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Same look as the Badge pills: accent at ~13% opacity, no border. */
  homeBtnActive: {
    backgroundColor: `${colors.accent}22`,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  // Selector label and menu options share one text style (size + weight).
  activeLabel: {
    color: colors.accent,
    fontSize: font.lg,
    fontWeight: '600',
  },
  selectorPlaceholder: {
    color: colors.textMuted,
    fontSize: font.lg,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  addBtnText: {
    color: '#fff',
    fontSize: font.sm,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingBottom: spacing.sm,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  // Same icon size, gap and horizontal padding as the selector, so the columns line up.
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: '600',
  },
});
