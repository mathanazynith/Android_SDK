// components/NotificationBell.tsx
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { BRAND_GREEN } from '../contexts/ThemeContext';

interface NotificationBellProps {
  onPress: () => void;
  badgeCount?: number;
}

export default function NotificationBell({ onPress, badgeCount = 0 }: NotificationBellProps) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Notifications" style={styles.container} onPress={onPress}>
      <Feather name="bell" size={22} color={BRAND_GREEN} />
      {badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.xs, position: 'relative' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { ...Typography.caption, color: '#fff', fontSize: 10, fontWeight: 'bold' },
});