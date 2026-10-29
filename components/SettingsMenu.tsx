// components/SettingsMenu.tsx
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePauseSettings } from '../contexts/PauseSettingsContext';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';
import { useResponsive } from '../utils/responsive';

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  hasPassword: boolean | null;
}

type SettingsPage = 'home' | 'pause' | 'appearance';

export default function SettingsMenu({ visible, onClose, onSelect, hasPassword }: SettingsMenuProps) {
  const { colors, isDark, preference, setPreference } = useTheme();
  const {
    autoPauseEnabled,
    isLoaded: pauseSettingsLoaded,
    setVoiceAlertsEnabled,
    setAutoPauseEnabled,
    voiceAlertsEnabled,
  } = usePauseSettings();
  const { spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<SettingsPage>('home');
  const accountOptions = [
    { label: hasPassword === null ? 'Password' : hasPassword ? 'Change Password' : 'Set Password', icon: 'key-variant' },
  ];
  const themeOptions = [
    { value: 'system', label: 'Phone Default', icon: 'cellphone' },
    { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
    { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
  ] as const;

  const handleBack = useCallback(() => {
    if (page !== 'home') {
      setPage('home');
      return;
    }
    onClose();
  }, [page, onClose]);

  const handleSwipeDownToClose = useCallback((distanceY: number, velocityY: number) => {
    if (distanceY < 70 && !(distanceY >= 40 && velocityY >= 0.65)) return;
    if (page !== 'home') setPage('home');
    else onClose();
  }, [page, onClose]);

  const swipeDismissResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1
    ),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gesture) => handleSwipeDownToClose(gesture.dy, gesture.vy),
  }), [handleSwipeDownToClose]);

  const renderAndroidRow = ({
    label,
    icon,
    iconSet = 'feather',
    summary,
    onPress,
    disabled = false,
  }: {
    label: string;
    icon: string;
    iconSet?: 'feather' | 'material';
    summary?: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.72}
      style={[styles.androidOptionRow, { borderBottomColor: colors.border }]}
    >
      {iconSet === 'material' ? (
        <MaterialCommunityIcons name={icon as any} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
      ) : (
        <Feather name={icon as any} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
      )}
      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>{label}</Text>
      {summary ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.androidOptionSummary, { color: colors.textTertiary }]}
        >
          {summary}
        </Text>
      ) : null}
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onShow={() => setPage('home')} onRequestClose={handleBack}>
      <View style={[styles.fullPage, { backgroundColor: isDark ? colors.background : '#FFFFFF', paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View {...swipeDismissResponder.panHandlers} style={[styles.pageHeader, page === 'home' && styles.homePageHeader]}>
          {page === 'home' ? (
            <View style={styles.homeHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={handleBack}
                style={[styles.backButton, { backgroundColor: colors.surfaceRaised }]}
              >
                <Feather name="chevron-left" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.homeTitle, { color: colors.text, fontSize: fontSize(30, 27, 32) }]}>Settings</Text>
            </View>
          ) : (
            <View style={styles.androidHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back to settings"
                onPress={handleBack}
                style={styles.androidHeaderButton}
              >
                <Feather name="chevron-left" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.androidHeaderTitle, { color: colors.text, fontSize: fontSize(17, 16, 19) }]}>
                {page === 'pause' ? 'Pause Mode' : 'Appearance'}
              </Text>
              <View style={styles.androidHeaderSpacer} />
            </View>
          )}
        </View>

        <ScrollView
          style={styles.settingsScroll}
          contentContainerStyle={[styles.settingsContent, { paddingHorizontal: spacing(16) }]}
          showsVerticalScrollIndicator={false}
        >
          {page === 'home' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>ACTIVITY</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderAndroidRow({ label: 'Activities', icon: 'activity', onPress: () => onSelect('Activities') })}
                  {renderAndroidRow({
                    label: 'Pause Mode',
                    icon: 'pause-circle',
                    summary: autoPauseEnabled ? 'Manual + Auto-Pause' : 'Manual Pause',
                    onPress: () => setPage('pause'),
                  })}
                </View>

                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>ACCOUNT</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {accountOptions.map((item) => renderAndroidRow({
                    label: item.label,
                    icon: item.icon,
                    iconSet: 'material',
                    onPress: () => onSelect(item.label),
                    disabled: hasPassword === null && item.label === 'Password',
                  }))}
                  {renderAndroidRow({ label: 'Subscriptions', icon: 'credit-card', onPress: () => onSelect('Subscription') })}
                </View>

                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>PREFERENCES</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderAndroidRow({
                    label: 'Appearance',
                    icon: 'circle-half-full',
                    iconSet: 'material',
                    summary: preference === 'system' ? 'Phone Default' : preference === 'light' ? 'Light' : 'Dark',
                    onPress: () => setPage('appearance'),
                  })}
                  <View style={[styles.androidVoiceRow, { borderTopColor: colors.border }]}>
                    <Feather name="volume-2" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Voice Coach</Text>
                    <Switch
                      accessibilityRole="switch"
                      accessibilityLabel="Voice Coach"
                      value={voiceAlertsEnabled}
                      onValueChange={setVoiceAlertsEnabled}
                      disabled={!pauseSettingsLoaded}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.surface}
                    />
                  </View>
                </View>
                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>SESSION</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log out of your account"
                    onPress={() => onSelect('Logout')}
                    style={styles.androidOptionRow}
                  >
                    <Feather name="log-out" size={spacing(21)} color={isDark ? '#F87171' : '#D46A70'} style={styles.androidOptionIcon} />
                    <Text style={[styles.androidOptionLabel, { color: isDark ? '#F87171' : '#D46A70', fontSize: fontSize(16, 14, 17) }]}>Logout</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : page === 'pause' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>PAUSE MODE</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  <View style={[styles.androidCheckboxRow, { borderBottomColor: colors.border }]}>
                    <Feather name="pause-circle" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <View style={styles.androidCheckboxCopy}>
                      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Manual Pause</Text>
                      <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>The run only pauses when you tap Pause.</Text>
                    </View>
                    <Feather name="check" size={20} color={colors.primary} />
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Auto-Pause"
                    accessibilityState={{ checked: autoPauseEnabled, disabled: !pauseSettingsLoaded }}
                    disabled={!pauseSettingsLoaded}
                    onPress={() => setAutoPauseEnabled(!autoPauseEnabled)}
                    style={styles.androidCheckboxRow}
                  >
                    <Feather name="activity" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <View style={styles.androidCheckboxCopy}>
                      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Auto-Pause</Text>
                      <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>Pause after 5 seconds still and resume when movement returns.</Text>
                    </View>
                    <Feather name={autoPauseEnabled ? 'check' : 'square'} size={20} color={autoPauseEnabled ? colors.primary : colors.textTertiary} />
                  </Pressable>
                </View>
                <Text style={[styles.androidSettingsNote, { color: colors.textTertiary }]}>You can still pause and resume manually at any time, even with Auto-Pause on.</Text>
              </>
            ) : (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>THEME</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {themeOptions.map((mode, index) => {
                    const selected = preference === mode.value;
                    return (
                      <TouchableOpacity
                        key={mode.value}
                        accessibilityRole="radio"
                        accessibilityLabel={`${mode.label} theme`}
                        accessibilityState={{ checked: selected }}
                        onPress={() => setPreference(mode.value as ThemePreference)}
                        style={[styles.androidOptionRow, mode.value === 'system' && styles.androidThemeRow, index < themeOptions.length - 1 && { borderBottomColor: colors.border }]}
                      >
                        <MaterialCommunityIcons name={mode.icon} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                        <View style={styles.androidThemeCopy}>
                          <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>{mode.label}</Text>
                          {mode.value === 'system' ? <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>Matches your phone&apos;s appearance setting</Text> : null}
                        </View>
                        {selected ? <Feather name="check" size={20} color={colors.primary} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPage: { flex: 1 },
  pageHeader: { borderBottomWidth: 0, paddingHorizontal: 16 },
  homePageHeader: { paddingBottom: 8 },
  homeHeader: { paddingTop: 8, gap: 16 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  homeTitle: { fontWeight: '800', lineHeight: 38 },
  androidHeader: { height: 56, flexDirection: 'row', alignItems: 'center' },
  androidHeaderButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  androidHeaderTitle: { flex: 1, textAlign: 'center', fontWeight: '700' },
  androidHeaderSpacer: { width: 44 },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
  },
  swipeHandleArea: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    fontSize: 21,
  },
  settingsScroll: { flex: 1 },
  settingsContent: { paddingTop: 12, paddingBottom: 24 },
  androidSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7, marginLeft: 2 },
  androidSectionSpaced: { marginTop: 20 },
  optionGroup: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  androidOptionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  androidOptionIcon: { marginRight: 14 },
  androidOptionLabel: { flex: 1, flexShrink: 1, fontWeight: '500' },
  androidOptionSummary: { fontSize: 12, marginRight: 8 },
  androidVoiceRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  androidCheckboxRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  androidCheckboxCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  androidThemeRow: { minHeight: 64 },
  androidThemeCopy: { flex: 1, minWidth: 0, gap: 2 },
  androidOptionHint: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  androidSettingsNote: { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
});
