import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface RunningPlanHeaderProps {
  planName: string;
  focusLabel: string;
  userName: string;
}

export default function RunningPlanHeader({ planName, focusLabel, userName }: RunningPlanHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Running Plan</Text>
      <Text style={styles.sectionText}><Text style={styles.label}>Plan: </Text><Text style={styles.value}>{planName}</Text></Text>
      <Text style={styles.sectionText}><Text style={styles.label}>Focus: </Text><Text style={styles.value}>{focusLabel}</Text></Text>
      <Text style={styles.greeting}>Let&apos;s push your limits, {userName}!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { color: '#F6F7F8', fontSize: 38, fontWeight: '800', marginBottom: 8, letterSpacing: -0.6 },
  sectionText: { marginTop: 1, fontSize: 18, lineHeight: 27 },
  label: { color: '#F4F4F5', fontWeight: '500' },
  value: { color: '#8EA8DE', fontWeight: '500' },
  greeting: { color: 'rgba(255,255,255,0.82)', fontSize: 18, marginTop: 2, lineHeight: 27 },
});
