import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActivityRouteMap from "../../../components/ActivityRouteMap";
import type { SuggestedRoute } from "../../../service/customWorkout";

export default function RouteDetailScreen() {
  const { route: routeParam } = useLocalSearchParams<{ route?: string }>();
  const route = useMemo<SuggestedRoute | null>(() => {
    if (!routeParam) return null;
    try {
      return JSON.parse(routeParam) as SuggestedRoute;
    } catch {
      return null;
    }
  }, [routeParam]);

  if (!route) {
    return <SafeAreaView style={styles.container}><Text style={styles.errorText}>Route details are unavailable.</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Close route details">
          <Feather name="x" size={32} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{(Number(route.distance || 0) / 1000).toFixed(2)}KM</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.mapArea}>
        <ActivityRouteMap encodedPolyline={route.encoded_polyline} variant="detail" />
      </View>
      <ScrollView contentContainerStyle={styles.stats} horizontal={false}>
        <Metric label="Distance" value={`${(Number(route.distance || 0) / 1000).toFixed(2)} km`} />
        <Metric label="Elev. Gain" value={`+${Number(route.elevation_gain || 0).toFixed(0)} m`} />
        <Metric label="Elev. Loss" value={`-${Number(route.elevation_loss || 0).toFixed(0)} m`} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0C0D" },
  header: { height: 126, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 32, backgroundColor: "#202123", borderTopLeftRadius: 38, borderTopRightRadius: 38 },
  closeButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: "#303235", backgroundColor: "#151617", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  headerSpacer: { width: 56 },
  mapArea: { flex: 1, backgroundColor: "#202326" },
  stats: { minHeight: 130, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "#202326", paddingHorizontal: 20 },
  metric: { flex: 1, alignItems: "center", borderRightWidth: 1, borderRightColor: "#3A3C3E" },
  metricValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  metricLabel: { color: "#B9BABC", fontSize: 15, marginTop: 8 },
  errorText: { color: "#FFFFFF", textAlign: "center", marginTop: 40 },
});