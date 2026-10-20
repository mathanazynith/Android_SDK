// components/SettingsMenu.tsx
import { Feather } from '@expo/vector-icons';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../utils/responsive';

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  hasPassword: boolean | null;
}

export default function SettingsMenu({ visible, onClose, onSelect, hasPassword }: SettingsMenuProps) {
  const { colors, isDark } = useTheme();
  const { height, spacing, fontSize } = useResponsive();
  const accountOptions = [
    { label: 'Edit Profile', icon: 'user' },
    { label: hasPassword === null ? 'Password' : hasPassword ? 'Change Password' : 'Set Password', icon: 'lock' },
  ];
  const preferenceOptions = [
    { label: 'Notifications', icon: 'bell' },
    { label: 'Subscription', icon: 'credit-card' },
  ];

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
        destructive && { backgroundColor: isDark ? '#2C1B1D' : '#FFF7F7' },
        { borderBottomColor: colors.border },
      ]}
      onPress={() => onSelect(item.label)}
      disabled={hasPassword === null && item.label === 'Password'}
      activeOpacity={0.72}
    >
      {destructive ? (
        <>
          <View style={[styles.logoutIconBadge, { backgroundColor: isDark ? '#4A2529' : '#FEE2E2' }]}>
            <Feather name="log-out" size={spacing(20)} color="#DC2626" />
          </View>
          <View style={styles.logoutCopy}>
            <Text style={[styles.logoutTitle, { color: '#DC2626', fontSize: fontSize(15, 14, 16) }]}>Log out</Text>
            <Text style={[styles.logoutHint, { color: colors.textSecondary }]}>You’ll need to sign in again to access your account.</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#DC2626" />
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
            <View style={[styles.sheet, { maxHeight: height * 0.75, backgroundColor: colors.surfaceRaised, borderColor: colors.border, paddingHorizontal: spacing(20), paddingTop: spacing(14), paddingBottom: spacing(20) }]}>
              <View style={[styles.handle, { backgroundColor: colors.textTertiary }]} />
              <Text style={[styles.title, { color: colors.text, fontSize: fontSize(21, 19, 23) }]}>Settings</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Manage your account and preferences</Text>

              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ACCOUNT</Text>
              <View style={[styles.optionGroup, { borderColor: colors.border }]}>
                {accountOptions.map((item) => renderOption(item))}
              </View>

              <Text style={[styles.sectionTitle, styles.preferencesTitle, { color: colors.textTertiary }]}>PREFERENCES</Text>
              <View style={[styles.optionGroup, { borderColor: colors.border }]}>
                {preferenceOptions.map((item) => renderOption(item))}
              </View>

              <View style={styles.logoutGroup}>
                {renderOption({ label: 'Logout', icon: 'log-out' }, true)}
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.cancelButton, { borderTopColor: colors.border }]}
              >
                <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
              </TouchableOpacity>
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
  handle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 7,
    marginLeft: 4,
  },
  preferencesTitle: {
    marginTop: 15,
  },
  optionGroup: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  logoutGroup: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.28)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  logoutOption: {
    minHeight: 78,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 0,
  },
  logoutIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCopy: { flex: 1, gap: 3 },
  logoutTitle: { fontWeight: '700' },
  optionIcon: {
    marginRight: 14,
  },
  optionLabel: {
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
  logoutHint: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  cancelButton: {
    marginTop: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
});