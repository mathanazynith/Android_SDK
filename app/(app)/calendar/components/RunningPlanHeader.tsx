import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../../contexts/ThemeContext';

interface RunningPlanHeaderProps {
  planName: string;
  focusLabel: string;
  userName: string;
}

export default function RunningPlanHeader({ planName, focusLabel, userName }: RunningPlanHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Running Plan</Text>
      <Text style={[styles.sectionText, { color: colors.text }]}><Text style={[styles.label, { color: colors.textSecondary }]}>Plan: </Text><Text style={[styles.value, { color: colors.text }]}>{planName}</Text></Text>
      {focusLabel ? <Text style={[styles.sectionText, { color: colors.text }]}><Text style={[styles.label, { color: colors.textSecondary }]}>Focus: </Text><Text style={[styles.value, { color: colors.text }]}>{focusLabel}</Text></Text> : null}
      <Text style={[styles.greeting, { color: colors.textSecondary }]}>Let&apos;s push your limits, {userName}!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { fontSize: 38, fontWeight: '800', marginBottom: 8, letterSpacing: -0.6 },
  sectionText: { marginTop: 1, fontSize: 18, lineHeight: 27 },
  label: { fontWeight: '500' },
  value: { fontWeight: '500' },
  greeting: { fontSize: 18, marginTop: 2, lineHeight: 27 },
});
