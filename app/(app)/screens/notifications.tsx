// app/(app)/notifications.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GradientHeader } from '../../../components/GradientHeader';
import { AppCard } from '../../../components/AppCard';
import { Colors, Spacing, Typography } from '../../../constants/theme';

export default function NotificationsScreen() {
  const notifications = [
    { id: '1', title: 'Leave Approved', message: 'Your annual leave request for July 20-22 has been approved.', time: '10 min ago' },
    { id: '2', title: 'Payroll Ready', message: 'Your salary slip for June is now available.', time: '1 hour ago' },
    { id: '3', title: 'New Task Assigned', message: 'You have been assigned to review Q2 performance.', time: '3 hours ago' },
    { id: '4', title: 'Meeting Reminder', message: 'Team meeting at 2:00 PM today.', time: 'Yesterday' },
  ];

  return (
    <View style={styles.container}>
      <GradientHeader title="Notifications" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {notifications.map((item) => (
          <AppCard key={item.id} variant="elevated" style={styles.card}>
            <Text style={styles.notifTitle}>{item.title}</Text>
            <Text style={styles.notifMessage}>{item.message}</Text>
            <Text style={styles.notifTime}>{item.time}</Text>
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
  notifTitle: { ...Typography.body, color: Colors.text, fontWeight: '600' },
  notifMessage: { ...Typography.bodySmall, color: Colors.textSecondary, marginVertical: Spacing.xs },
  notifTime: { ...Typography.caption, color: Colors.textMuted, alignSelf: 'flex-end' },
});