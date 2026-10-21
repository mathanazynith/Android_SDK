// components/SettingsMenu.tsx
import { Feather } from '@expo/vector-icons';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';
import { useResponsive } from '../utils/responsive';

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  hasPassword: boolean | null;
}

export default function SettingsMenu({ visible, onClose, onSelect, hasPassword }: SettingsMenuProps) {
  const { colors, isDark, preference, setPreference } = useTheme();
  const { height, spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const accountOptions = [
    { label: 'Edit Profile', icon: 'user' },
    { label: hasPassword === null ? 'Password' : hasPassword ? 'Change Password' : 'Set Password', icon: 'lock' },
  ];
  const preferenceOptions = [
    { label: 'Notifications', icon: 'bell' },
    { label: 'Subscription', icon: 'credit-card' },
  ];
  const themeOptions = [
    { value: 'system', label: 'System', icon: 'smartphone' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ] as const;

  const renderOption = (item: { label: string; icon: string }, destructive = false) => (
    <TouchableOpacity
      key={item.label}
      accessibilityRole="button"
      accessibilityLabel={destructive ? 'Log out of your account' : item.label}
      accessibilityHint={destructive ? 'You will be asked to confirm before signing out.' : undefined}
      accessibilityState={{ disabled: hasPassword === null && item.label === 'Password' }}
      style={[
        styles.option,
        destructive && styles.logoutOption,
        destructive && { backgroundColor: isDark ? '#B91C1C' : '#DC2626' },
        { borderBottomColor: colors.border },
      ]}
      onPress={() => onSelect(item.label)}
      disabled={hasPassword === null && item.label === 'Password'}
      activeOpacity={0.72}
    >
      {destructive ? (
        <>
          <Feather name="log-out" size={spacing(21)} color="#FFFFFF" style={styles.optionIcon} />
          <Text style={[styles.optionLabel, styles.logoutLabel, { color: '#FFFFFF', fontSize: fontSize(16, 14, 17) }]}>Log out</Text>
          <Feather name="chevron-right" size={18} color="#FFFFFF" />
        </>
      ) : (
        <>
          <Feather name={item.icon as any} size={spacing(21)} color={colors.primary} style={styles.optionIcon} />
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>
            {item.label}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { maxHeight: height * 0.92, backgroundColor: colors.surfaceRaised, borderColor: colors.border, paddingHorizontal: spacing(20), paddingTop: spacing(10), paddingBottom: spacing(12) + insets.bottom }]}>
              <View style={[styles.handle, { backgroundColor: colors.textTertiary }]} />
              <View style={styles.header}>
                <View style={styles.headerSpacer} />
                <Text style={[styles.title, { color: colors.text, fontSize: fontSize(21, 19, 23) }]}>Settings</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close settings"
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <Feather name="x" size={spacing(20)} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ACCOUNT</Text>
                <View style={[styles.optionGroup, { borderColor: colors.border }]}>
                  {accountOptions.map((item) => renderOption(item))}
                </View>

                <Text style={[styles.sectionTitle, styles.preferencesTitle, { color: colors.textTertiary }]}>PREFERENCES</Text>
                <View style={[styles.optionGroup, { borderColor: colors.border }]}>
                  {preferenceOptions.map((item) => renderOption(item))}
                </View>

                <Text style={[styles.sectionTitle, styles.preferencesTitle, { color: colors.textTertiary }]}>APPEARANCE</Text>
                <View style={[styles.appearanceGroup, { borderColor: colors.border }]}>
                  <View style={styles.modeButtons}>
                    {themeOptions.map((mode) => {
                      const selected = preference === mode.value;
                      return (
                        <TouchableOpacity
                          key={mode.value}
                          accessibilityRole="radio"
                          accessibilityLabel={`${mode.label} theme`}
                          accessibilityState={{ checked: selected }}
                          style={[
                            styles.modeButton,
                            { backgroundColor: selected ? colors.selected : colors.surface, borderColor: selected ? colors.primary : colors.border },
                          ]}
                          onPress={() => setPreference(mode.value as ThemePreference)}
                          activeOpacity={0.75}
                        >
                          <Feather name={mode.icon} size={spacing(17)} color={selected ? colors.primary : colors.textSecondary} />
                          <Text style={[styles.modeButtonText, { color: selected ? colors.text : colors.textSecondary }]}>{mode.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.logoutGroup, { borderColor: isDark ? '#F87171' : '#B91C1C' }]}>
                  {renderOption({ label: 'Logout', icon: 'log-out' }, true)}
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    paddingBottom: 20,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerSpacer: {
    width: 44,
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
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 5,
    marginLeft: 4,
  },
  preferencesTitle: {
    marginTop: 9,
  },
  optionGroup: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  appearanceGroup: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modeButtons: { flexDirection: 'row', gap: 6, padding: 6 },
  modeButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  modeButtonText: { fontSize: 12, fontWeight: '700' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  logoutGroup: {
    marginTop: 9,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  logoutOption: {
    minHeight: 54,
    borderBottomWidth: 0,
  },
  logoutLabel: {
    fontWeight: '800',
  },
  optionIcon: {
    marginRight: 14,
  },
  optionLabel: {
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
});
