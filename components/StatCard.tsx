// FrontEnd/components/StatCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { AppCard } from './AppCard';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  change?: { value: number; type: 'increase' | 'decrease' };
  subtitle?: string;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, change, subtitle, loading = false }) => {
  return (
    <AppCard variant="elevated" padding={Spacing.md}>
      <View style={styles.container}>
        <View style={styles.header}>
          {icon && <View style={styles.iconWrapper}>{icon}</View>}
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.value}>{loading ? '...' : value}</Text>
        {change && (
          <View style={styles.changeContainer}>
            <Text style={[styles.changeText, { color: change.type === 'increase' ? Colors.success : Colors.error }]}>
              {change.type === 'increase' ? '↑' : '↓'} {Math.abs(change.value)}%
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        )}
        {!change && subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: Spacing.sm,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  value: { ...Typography.h2, color: Colors.text, fontWeight: '700' },
  changeContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  changeText: { ...Typography.caption, fontWeight: '600' },
  subtitle: { ...Typography.caption, color: Colors.textSecondary },
});