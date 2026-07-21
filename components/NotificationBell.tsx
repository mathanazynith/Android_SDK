// components/NotificationBell.tsx
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';

interface NotificationBellProps {
  onPress: () => void;
  badgeCount?: number;
}

export default function NotificationBell({ onPress, badgeCount = 3 }: NotificationBellProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.bellIcon}>🔔</Text>
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
  bellIcon: { fontSize: 24, color: Colors.text },
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