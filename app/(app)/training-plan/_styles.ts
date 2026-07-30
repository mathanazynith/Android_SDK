import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get('window');

export const trainingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
  // Header Section
  header: {
    backgroundColor: '#1A1A1A',
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  greetingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  beginnerBadge: {
    backgroundColor: '#FF9500',
  },
  savedBadge: {
    backgroundColor: '#34C759',
  },
  planBadgeText: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '700',
  },
  planInfoContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  planInfoText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  planInfoSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  // Save Button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  saveButtonSaved: {
    backgroundColor: '#2D8A4E',
  },
  saveButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
  },
  // ✅ NEW: Dashboard Button
  dashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  dashboardButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  // Week Selector
  weekSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -12,
    gap: 8,
    marginBottom: 16,
  },
  weekTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECF1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  weekTabActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  weekTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  weekTabTextActive: {
    color: '#FFFFFF',
  },
  // Weekly Schedule
  weeklySchedule: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
    paddingLeft: 4,
  },
  weekDayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  weekDayCardRest: {
    backgroundColor: '#F8F9FB',
    opacity: 0.8,
    borderLeftColor: '#8E8E93',
  },
  weekDayHeader: {
    flex: 0.7,
  },
  weekDayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  intensityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  intensityBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  weekDayContent: {
    flex: 1.3,
    paddingHorizontal: 12,
  },
  weekDayWorkout: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  weekDayWorkoutRest: {
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  weekDayDistance: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  weekDayDistanceRest: {
    color: '#B8B8BE',
  },
  weekDayIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FFF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDayIcon: {
    fontSize: 18,
  },
  // Quick Stats
  quickStatsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 30,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E8ECF1',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E8ECF1',
  },
});