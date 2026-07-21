// app/(app)/plan.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GradientHeader } from '../../components/GradientHeader';
import { AppCard } from '../../components/AppCard';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function PlanScreen() {
  const tasks = [
    { id: '1', title: 'Review Q2 performance', deadline: 'Today, 5:00 PM', priority: 'High' },
    { id: '2', title: 'Submit monthly report', deadline: 'Tomorrow, 10:00 AM', priority: 'Medium' },
    { id: '3', title: 'Team meeting', deadline: 'Wed, 2:00 PM', priority: 'Medium' },
    { id: '4', title: 'Update employee records', deadline: 'Thu, 6:00 PM', priority: 'Low' },
  ];

  return (
    <View style={styles.container}>
      <GradientHeader title="Plan" subtitle="Your weekly schedule" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {tasks.map((task) => (
          <AppCard key={task.id} variant="elevated" style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <View style={[styles.badge, { backgroundColor: task.priority === 'High' ? Colors.error : task.priority === 'Medium' ? Colors.warning : Colors.info }]}>
                <Text style={styles.badgeText}>{task.priority}</Text>
              </View>
            </View>
            <Text style={styles.deadline}>📅 {task.deadline}</Text>
          </AppCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: { marginBottom: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { ...Typography.body, color: Colors.text, flex: 1 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 12 },
  badgeText: { ...Typography.caption, color: Colors.text, fontWeight: '600' },
  deadline: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: Spacing.xs },
});