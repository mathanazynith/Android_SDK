// FrontEnd/components/GradientHeader.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography } from '../constants/theme';

interface GradientHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  onLeftPress?: () => void;
  rightIcon?: React.ReactNode;
  onRightPress?: () => void;
  gradientColors?: readonly [string, string, ...string[]];
}

export const GradientHeader: React.FC<GradientHeaderProps> = ({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  gradientColors = ['#1A1A2E', '#0A0A0A'],
}) => {
  return (
    <LinearGradient colors={gradientColors} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
      <SafeAreaView>
        <View style={styles.container}>
          <View style={styles.left}>
            {leftIcon && (
              <TouchableOpacity onPress={onLeftPress} style={styles.iconButton}>
                {leftIcon}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.center}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          <View style={styles.right}>
            {rightIcon && (
              <TouchableOpacity onPress={onRightPress} style={styles.iconButton}>
                {rightIcon}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { paddingBottom: Spacing.md },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    minHeight: 80,
  },
  left: { width: 40, alignItems: 'flex-start' },
  center: { flex: 1, alignItems: 'center' },
  right: { width: 40, alignItems: 'flex-end' },
  iconButton: { padding: Spacing.xs },
  title: { ...Typography.h3, color: Colors.text, fontWeight: '700' },
  subtitle: { ...Typography.caption, color: Colors.textSecondary },
});