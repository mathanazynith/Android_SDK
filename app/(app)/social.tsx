// app/(app)/social.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GradientHeader } from '../../components/GradientHeader';
import { AppCard } from '../../components/AppCard';
import { Avatar } from '../../components/Avatar';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function SocialScreen() {
  const teamMembers = [
    { name: 'Ahmed K.', role: 'Manager' },
    { name: 'Sara M.', role: 'Developer' },
    { name: 'Layla R.', role: 'Designer' },
    { name: 'John D.', role: 'HR Specialist' },
  ];

  const leaderboard = [
    { name: 'Ahmed K.', hours: 42 },
    { name: 'Sara M.', hours: 38 },
    { name: 'Layla R.', hours: 35 },
    { name: 'John D.', hours: 32 },
  ];

  return (
    <View style={styles.container}>
      <GradientHeader title="Community" subtitle="Team & activities" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard variant="elevated" style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Team Members</Text>
          {teamMembers.map((member, index) => (
            <View key={index} style={styles.memberRow}>
              <Avatar name={member.name} size={40} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberRole}>{member.role}</Text>
              </View>
            </View>
          ))}
        </AppCard>

        <AppCard variant="elevated" style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Top Performers</Text>
          {leaderboard.map((item, index) => (
            <View key={index} style={styles.leaderboardRow}>
              <Text style={styles.rank}>{index + 1}</Text>
              <Text style={styles.leaderName}>{item.name}</Text>
              <Text style={styles.leaderHours}>{item.hours}h</Text>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  sectionCard: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { ...Typography.h4, color: Colors.text, marginBottom: Spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  memberInfo: { marginLeft: Spacing.sm },
  memberName: { ...Typography.body, color: Colors.text },
  memberRole: { ...Typography.caption, color: Colors.textSecondary },
  leaderboardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rank: { ...Typography.body, color: Colors.text, width: 30 },
  leaderName: { ...Typography.body, color: Colors.text, flex: 1 },
  leaderHours: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },
});