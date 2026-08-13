import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/theme';
import { ActivityRecord, ActivityStore } from '../../../src/services/activityStore';

function ActivityCard({ item, onPress }: { item: ActivityRecord; onPress: (it: ActivityRecord) => void }) {
  const hasRoute = item.routeCoordinates && item.routeCoordinates.length > 0;
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      <View style={styles.cardLeft}>
        <Text style={styles.dayLabel}>Day: {item.displayDate}</Text>
        <Text style={styles.workoutTitle}>{item.workoutName}</Text>
        <View style={styles.cardStats}>
          <Text style={styles.statLine}>Distance
            <Text style={styles.statValue}> {(item.distanceMeters/1000).toFixed(2)} km</Text>
          </Text>
          <Text style={styles.statLine}>Pace/km
            <Text style={styles.statValue}> {Math.floor(item.paceSecondsPerKm/60)}:{String(Math.round(item.paceSecondsPerKm%60)).padStart(2,'0')} /km</Text>
          </Text>
          <Text style={styles.statLine}>Total Time
            <Text style={styles.statValue}> {Math.floor(item.durationSeconds/3600)>0?`${Math.floor(item.durationSeconds/3600)}:`:''}{String(Math.floor((item.durationSeconds%3600)/60)).padStart(2,'0')}:{String(item.durationSeconds%60).padStart(2,'0')}</Text>
          </Text>
          <Text style={styles.statLine}>Total Calories
            <Text style={styles.statValue}> {item.calories} kcal</Text>
          </Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        {hasRoute ? (
          <View style={styles.mapPlaceholder}><Text style={styles.mapText}>Map</Text></View>
        ) : (
          <View style={styles.placeholder}><Ionicons name="calendar-outline" size={36} color={Colors.primary} /><Text style={styles.placeholderText}>Rest Day</Text></View>
        )}
        <View style={styles.mapMeta}><Text style={styles.mapMetaText}>{(item.distanceMeters/1000).toFixed(2)} km</Text><Text style={styles.mapMetaText}>{Math.floor(item.paceSecondsPerKm/60)}:{String(Math.round(item.paceSecondsPerKm%60)).padStart(2,'0')} /km</Text></View>
      </View>
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const activities = useMemo(() => ActivityStore.list(), []);
  const [selected, setSelected] = useState<ActivityRecord | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.header}>Running History</Text>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.timelineContainer}>
          {activities.map((item, idx) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.leftRail}>
                <View style={styles.node} />
                {idx < activities.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.cardWrapper}>
                <ActivityCard item={item} onPress={setSelected} />
              </View>
            </View>
          ))}
          {activities.length === 0 && <Text style={styles.empty}>No activities yet — finish a run to see history here.</Text>}
        </View>
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity onPress={() => setSelected(null)} style={styles.modalClose}><Text style={{color: Colors.primary}}>Close</Text></TouchableOpacity>
            {selected && (
              <ScrollView>
                <Text style={styles.modalTitle}>{selected.workoutName}</Text>
                <Text style={styles.modalDate}>{selected.displayDate}</Text>
                <View style={styles.modalStats}>
                  <Text style={styles.modalStatLabel}>Distance</Text>
                  <Text style={styles.modalStatValue}>{(selected.distanceMeters/1000).toFixed(2)} km</Text>
                </View>
                <View style={styles.modalStats}>
                  <Text style={styles.modalStatLabel}>Average Pace</Text>
                  <Text style={styles.modalStatValue}>{Math.floor(selected.paceSecondsPerKm/60)}:{String(Math.round(selected.paceSecondsPerKm%60)).padStart(2,'0')} /km</Text>
                </View>
                <View style={styles.modalStats}>
                  <Text style={styles.modalStatLabel}>Total Time</Text>
                  <Text style={styles.modalStatValue}>{Math.floor((selected.durationSeconds%3600)/60).toString().padStart(2,'0')}:{String(selected.durationSeconds%60).padStart(2,'0')}</Text>
                </View>
                <View style={{height:220, borderRadius:14, backgroundColor:'rgba(255,255,255,0.03)', marginTop:12, justifyContent:'center', alignItems:'center'}}>
                  <Text style={{color:Colors.textSecondary}}>Map preview</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06090B', paddingHorizontal: 18, paddingTop: 18 },
  header: { color: '#FFF', fontSize: 28, fontWeight: '700', marginBottom: 12 },
  scroll: { paddingBottom: 60 },
  timelineContainer: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  leftRail: { width: 36, alignItems: 'center', paddingTop: 6 },
  node: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#5B5B5B', borderWidth: 1, borderColor: '#717171' },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 6 },
  cardWrapper: { flex: 1 },
  card: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardLeft: { flex: 1 },
  dayLabel: { color: '#B9C0C2', fontSize: 13, marginBottom: 4 },
  workoutTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardStats: {},
  statLine: { color: '#AEB0B2', fontSize: 13, marginBottom: 4 },
  statValue: { color: '#FFF', fontWeight: '700' },
  cardRight: { width: 120, marginLeft: 10, alignItems: 'center' },
  mapPlaceholder: { width: 110, height: 80, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  mapText: { color: '#CFCFCF' },
  placeholder: { width: 110, height: 80, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.02)', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#9FBF9A', marginTop: 6 },
  mapMeta: { flexDirection: 'row', justifyContent: 'space-between', width: 110, marginTop: 8 },
  mapMetaText: { color: '#CFCFCF', fontSize: 12 },
  empty: { color: '#B0B0B0', textAlign: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#0A0D0E', borderRadius: 18, padding: 16, maxHeight: '86%' },
  modalClose: { alignSelf: 'flex-end' },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  modalDate: { color: '#AEB0B2', marginBottom: 10 },
  modalStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  modalStatLabel: { color: '#AEB0B2' },
  modalStatValue: { color: '#FFF', fontWeight: '700' },
});
